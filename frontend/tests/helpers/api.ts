// A scripted fake of the Healthmarg API for page tests: map "METHOD /path" to a handler, get every
// call recorded. Unknown routes fail loudly so a test never silently depends on a real server.
import { vi } from 'vitest';
import type { User } from '../../src/features/auth/types';

interface Reply {
  status?: number;
  body?: unknown;
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
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
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
      json: () => Promise.resolve(reply.body),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path.split('?')[0] ?? ''}` === key) };
}

export const apiError = (status: number, code: string, message = code) => ({ status, body: { error: { message, code } } });

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
