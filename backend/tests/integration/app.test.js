import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// The HTTP stack runs for real; only the MySQL and Redis pings are stubbed so this suite needs no services.
// Real-service behaviour is covered by tests/db (npm run test:db).
vi.mock('../../src/config/db.js', () => ({
  pingDatabase: vi.fn(),
  closeDatabase: vi.fn(),
}));
vi.mock('../../src/config/redis.js', () => ({
  pingRedis: vi.fn(),
  isRedisEnabled: vi.fn(() => true),
  redis: {},
  redisKey: (...parts) => `hm:${parts.join(':')}`,
}));

const { pingDatabase } = await import('../../src/config/db.js');
const { pingRedis, isRedisEnabled } = await import('../../src/config/redis.js');
const { createApp } = await import('../../src/app.js');

describe('API app', () => {
  let app;

  beforeEach(() => {
    isRedisEnabled.mockReturnValue(true);
    app = createApp();
    pingRedis.mockResolvedValue();
  });

  it('GET /api/v1/health reports ok when MySQL and Redis are up', async () => {
    pingDatabase.mockResolvedValue();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });

  it('GET /api/v1/health reports 503 when the database is down', async () => {
    pingDatabase.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'down', redis: 'up' });
  });

  it('GET /api/v1/health reports 503 when Redis is down, without leaking the error', async () => {
    pingDatabase.mockResolvedValue();
    pingRedis.mockRejectedValue(new Error('NOAUTH Authentication required on 10.0.0.5'));
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.redis).toBe('down');
    expect(res.text).not.toContain('10.0.0.5');
  });

  it('reports Redis as disabled (and stays healthy) when switched off for local development', async () => {
    isRedisEnabled.mockReturnValue(false);
    pingDatabase.mockResolvedValue();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', redis: 'disabled' });
    expect(pingRedis).not.toHaveBeenCalled();
  });

  it('uses the in-memory rate-limit store in tests (Redis store is opt-in)', () => {
    expect(() => createApp({ redisRateLimit: false })).not.toThrow();
  });

  it('returns a JSON 404 for unknown routes without echoing the path', async () => {
    const res = await request(app).get('/api/v1/<script>alert(1)</script>');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Route not found');
    expect(res.text).not.toContain('script');
  });

  it('rate-limits every path, not just API routes', async () => {
    const res = await request(app).get('/wp-admin');
    expect(res.status).toBe(404);
    expect(res.headers.ratelimit).toBeDefined();
  });

  it('sets security headers and hides the framework', async () => {
    pingDatabase.mockResolvedValue();
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('allows CORS only for the configured client origin', async () => {
    pingDatabase.mockResolvedValue();
    const allowed = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects malformed JSON with a 400', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"bad json');
    expect(res.status).toBe(400);
  });

  it('rejects bodies over the size limit with a 413', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .send({ blob: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });
});
