// The global error handling over real HTTP: every response has a request ID, and errors from visitors'
// browsers can be reported (validated, stripped of personal data, rate-limited) without a database.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/db.js', () => ({ pingDatabase: vi.fn(), closeDatabase: vi.fn() }));
vi.mock('../../src/config/redis.js', () => ({
  pingRedis: vi.fn(),
  isRedisEnabled: vi.fn(() => false),
  redis: {},
  redisKey: (...parts) => `hm:${parts.join(':')}`,
}));

const { createApp } = await import('../../src/app.js');
const { logger } = await import('../../src/utils/logger.js');

const report = (app, body) => request(app).post('/api/v1/client-errors').set('Content-Type', 'application/json').send(body);
const valid = { kind: 'crash', message: 'Cannot read properties of undefined (reading "title")', path: '/articles/calm' };

describe('request IDs', () => {
  it('puts a fresh ID on every response, errors included, and exposes it to the website', async () => {
    const app = createApp();
    const a = await request(app).get('/api/v1/no-such-route').set('Origin', 'http://localhost:5173');
    const b = await request(app).get('/api/v1/no-such-route').set('X-Request-Id', 'forged-by-client');
    expect(a.status).toBe(404);
    expect(a.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.headers['x-request-id']).not.toBe(a.headers['x-request-id']);
    expect(a.body).toEqual({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
  });
});

describe('POST /api/v1/client-errors', () => {
  let app;
  let warn;
  beforeEach(() => {
    app = createApp();
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  it('logs a report and answers 204, keeping only the address path and blanking tokens and emails', async () => {
    await report(app, {
      kind: 'crash',
      message: 'Failed at https://healthmarg.in/reset-password?token=abc123secret for meera@example.com with key 0123456789abcdef0123456789abcdef01',
      path: '/reset-password?token=abc123secret#top',
      reference: '0190a1b2-c3d4-7000-8000-00000000f00d',
    }).expect(204);
    const [entry, text] = warn.mock.calls.at(-1);
    expect(text).toBe('Error in a visitor’s browser');
    expect(entry.clientError.path).toBe('/reset-password');
    expect(entry.clientError.reference).toBe('0190a1b2-c3d4-7000-8000-00000000f00d');
    expect(entry.clientError.message).not.toMatch(/abc123secret|meera@example\.com|0123456789abcdef0123456789abcdef01/);
    expect(entry.clientError.message).toContain('[email]');
    expect(entry.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['an unknown kind', { ...valid, kind: 'anything' }],
    ['no message', { ...valid, message: '' }],
    ['a message over 300 characters', { ...valid, message: 'x'.repeat(301) }],
    ['an address over 500 characters', { ...valid, path: `/${'a'.repeat(500)}` }],
    ['extra fields (e.g. a stack or cookies)', { ...valid, stack: 'at secret.js:1', cookies: 'sid=1' }],
    ['a reference that isn’t a request ID', { ...valid, reference: '<script>' }],
  ])('refuses %s with 400, and logs nothing', async (_what, body) => {
    const res = await report(app, body).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(warn).not.toHaveBeenCalledWith(expect.anything(), 'Error in a visitor’s browser');
  });

  it('refuses a body that isn’t JSON', async () => {
    await request(app).post('/api/v1/client-errors').set('Content-Type', 'text/plain').send('kind=crash').expect(400);
  });

  it('stops a flood: 20 reports per 15 minutes per address, then 429', async () => {
    for (let i = 0; i < 20; i++) await report(app, valid).expect(204);
    const blocked = await report(app, valid).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
