import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiRequestError } from '../../src/services/apiClient';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'status text',
    headers: new Headers(),
    json: () => Promise.resolve(body),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The [url, init] of the first fetch call. */
function firstCall(fetchMock: ReturnType<typeof mockFetch>) {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const [input, init = {}] = call;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return { url, init, headers: init.headers as Record<string, string> };
}

async function rejectionOf(promise: Promise<unknown>): Promise<ApiRequestError> {
  const err: unknown = await promise.catch((e: unknown) => e);
  if (!(err instanceof ApiRequestError)) throw new Error('expected an ApiRequestError');
  return err;
}

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs JSON with cookies included', async () => {
    const fetchMock = mockFetch(200, { status: 'ok' });
    const data = await apiClient.get<{ status: string }>('/health');

    expect(data).toEqual({ status: 'ok' });
    const { url, init } = firstCall(fetchMock);
    expect(url).toMatch(/\/health$/);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('POSTs a JSON body', async () => {
    const fetchMock = mockFetch(201, { id: 1 });
    await apiClient.post('/articles', { title: 'Migraine' });

    const { init, headers } = firstCall(fetchMock);
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ title: 'Migraine' }));
  });

  it.each(['put', 'patch'] as const)('%s sends the matching method with a JSON body', async (method) => {
    const fetchMock = mockFetch(200, { ok: true });
    await apiClient[method]('/articles/1', { title: 'Updated' });

    const { init } = firstCall(fetchMock);
    expect(init.method).toBe(method.toUpperCase());
    expect(init.body).toBe(JSON.stringify({ title: 'Updated' }));
  });

  it('passes extra headers and the abort signal through', async () => {
    const fetchMock = mockFetch(200, {});
    const controller = new AbortController();
    await apiClient.get('/users/me', { headers: { Authorization: 'Bearer t' }, signal: controller.signal });

    const { init, headers } = firstCall(fetchMock);
    expect(headers['Authorization']).toBe('Bearer t');
    expect(init.signal).toBe(controller.signal);
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Headers(),
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      } as Response),
    );

    const err = await rejectionOf(apiClient.get('/health'));
    expect(err.status).toBe(502);
    expect(err.message).toBe('Bad Gateway');
    expect(err.code).toBeUndefined();
  });

  it('throws ApiRequestError with the server message, code and details on failure', async () => {
    mockFetch(409, { error: { message: 'Session refresh already in progress', code: 'REFRESH_RACE', details: { a: 1 } } });

    const err = await rejectionOf(apiClient.post('/auth/refresh'));
    expect(err.status).toBe(409);
    expect(err.message).toBe('Session refresh already in progress');
    expect(err.code).toBe('REFRESH_RACE');
    expect(err.details).toEqual({ a: 1 });
  });

  it('reads Retry-After so the page can say how long to wait', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '840' }),
        json: () => Promise.resolve({ error: { message: 'Too many', code: 'LOGIN_LOCKED' } }),
      } as Response),
    );
    const err = await rejectionOf(apiClient.post('/auth/login'));
    expect(err.retryAfter).toBe(840);
  });

  it('returns null for 204 No Content', async () => {
    mockFetch(204, undefined);
    expect(await apiClient.delete('/articles/1')).toBeNull();
  });
});
