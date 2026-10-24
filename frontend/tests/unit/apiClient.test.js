import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiRequestError } from '../../src/services/apiClient.js';

function mockFetch(status, body) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'status text',
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs JSON with cookies included', async () => {
    const fetchMock = mockFetch(200, { status: 'ok' });
    const data = await apiClient.get('/health');

    expect(data).toEqual({ status: 'ok' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/health$/);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('POSTs a JSON body', async () => {
    const fetchMock = mockFetch(201, { id: 1 });
    await apiClient.post('/articles', { title: 'Migraine' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ title: 'Migraine' }));
  });

  it.each(['put', 'patch'])('%s sends the matching method with a JSON body', async (method) => {
    const fetchMock = mockFetch(200, { ok: true });
    await apiClient[method]('/articles/1', { title: 'Updated' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe(method.toUpperCase());
    expect(init.body).toBe(JSON.stringify({ title: 'Updated' }));
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      }),
    );

    const err = await apiClient.get('/health').catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toBe('Bad Gateway');
  });

  it('throws ApiRequestError with the server message on failure', async () => {
    mockFetch(403, { error: { message: 'Admins only' } });

    const err = await apiClient.get('/admin').catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(403);
    expect(err.message).toBe('Admins only');
  });

  it('returns null for 204 No Content', async () => {
    mockFetch(204, undefined);
    expect(await apiClient.delete('/articles/1')).toBeNull();
  });
});
