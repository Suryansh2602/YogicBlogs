// A scripted fake of the Healthmarg API for page tests: map "METHOD /path" to a handler, get every
// call recorded. Unknown routes fail loudly so a test never silently depends on a real server.
import { vi } from 'vitest';
import type { User } from '../../src/features/auth/types';

interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

type Handler = Reply | ((call: Call) => Reply | Promise<Reply>);

export function mockApi(routes: Record<string, Handler | Handler[]>) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));

  const fetchMock = vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const path = url.pathname.replace(/^\/api\/v1/, '') + url.search;
    const method = init.method ?? 'GET';
    const call: Call = {
      method,
      path,
      // JSON bodies are parsed; uploads (FormData) are kept as they are so tests can look inside.
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : init.body instanceof FormData ? init.body : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const key = `${method} ${path.split('?')[0] ?? path}`;
    const queue = queues.get(key);
    if (!queue?.length) throw new Error(`Unexpected API call in test: ${key}`);
    // The last handler for a route repeats; earlier ones are used once each, in order.
    const handler = queue.length > 1 ? queue.shift() : queue[0];
    const reply = typeof handler === 'function' ? await handler(call) : (handler ?? {});
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      headers: new Headers(reply.headers),
      json: () => Promise.resolve(reply.body),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path.split('?')[0] ?? ''}` === key) };
}

export const apiError = (status: number, code: string, message = code, headers: Record<string, string> = {}) => ({
  status,
  headers,
  body: { error: { message, code } },
});

export const makeUser = (overrides: Partial<User> = {}): User => ({
  id: '0190a1b2-c3d4-7000-8000-000000000001',
  email: 'meera@example.com',
  displayName: 'Meera Iyer',
  role: 'user',
  avatarUrl: null,
  emailVerified: true,
  twoFactorEnabled: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

export const session = (user: User = makeUser()) => ({ body: { accessToken: `token-for-${user.id}`, user } });

/**
 * jsdom's XMLHttpRequest would go to the network. This one sends uploads through the same scripted
 * fake API (mockApi), reporting progress at 50% and 100% first, like a real upload.
 */
export function installFakeXhr() {
  class FakeXhr {
    status = 0;
    statusText = '';
    responseText = '';
    withCredentials = false;
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private method = 'GET';
    private url = '';
    private headers: Record<string, string> = {};
    private responseHeaders = new Headers();

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    getResponseHeader(name: string) {
      return this.responseHeaders.get(name);
    }
    abort() {
      this.onabort?.();
    }
    send(body: FormData) {
      for (const loaded of [50, 100]) this.upload.onprogress?.({ lengthComputable: true, loaded, total: 100 } as ProgressEvent);
      fetch(this.url, { method: this.method, headers: this.headers, body }).then(
        async (res) => {
          this.status = res.status;
          this.statusText = res.statusText;
          this.responseHeaders = res.headers;
          const data: unknown = await res.json();
          this.responseText = data === undefined ? '' : JSON.stringify(data);
          this.onload?.();
        },
        () => this.onerror?.(),
      );
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}
