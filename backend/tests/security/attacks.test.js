// Attack-prevention suite: hostile requests against the real HTTP stack (MySQL/Redis pings stubbed).
// Each feature adds its own attacks (brute force, token tampering, privilege escalation, IDOR, CSRF).
import net from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/db.js', () => ({ pingDatabase: vi.fn(), closeDatabase: vi.fn() }));
vi.mock('../../src/config/redis.js', () => ({
  pingRedis: vi.fn(),
  isRedisEnabled: vi.fn(() => false),
  redis: {},
  redisKey: (...parts) => `nn:${parts.join(':')}`,
}));

const { pingDatabase } = await import('../../src/config/db.js');
const { createApp } = await import('../../src/app.js');
const { createHttpServer } = await import('../../src/httpServer.js');

const SECRET_MARKERS = [/at \w+ \(/, /node_modules/, /\bSELECT\b/i, /ER_[A-Z_]+/, /\\src\\|\/src\//];
const expectNoLeak = (res) => {
  for (const marker of SECRET_MARKERS) expect(res.text).not.toMatch(marker);
};

describe('attack prevention — request payloads', () => {
  let app;

  beforeEach(() => {
    pingDatabase.mockResolvedValue();
    app = createApp();
  });

  it('rejects oversized JSON bodies with 413', async () => {
    const res = await request(app).post('/api/v1/health').send({ blob: 'x'.repeat(150 * 1024) });
    expect(res.status).toBe(413);
    expectNoLeak(res);
  });

  it('rejects malformed JSON with 400 and no stack trace', async () => {
    const res = await request(app).post('/api/v1/health').set('Content-Type', 'application/json').send('{"a":');
    expect(res.status).toBe(400);
    expectNoLeak(res);
  });

  it('survives deeply nested JSON without crashing (no 5xx)', async () => {
    const depth = 40_000;
    const body = '['.repeat(depth) + ']'.repeat(depth);
    const res = await request(app).post('/api/v1/health').set('Content-Type', 'application/json').send(body);
    expect(res.status).toBeLessThan(500);
    // Server still healthy afterwards.
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });

  it('does not let __proto__ / constructor payloads pollute Object.prototype', async () => {
    await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}}}');
    expect({}.polluted).toBeUndefined();
    expect({}.polluted2).toBeUndefined();
  });

  it('does not parse non-JSON bodies (text/plain cannot smuggle data in)', async () => {
    const res = await request(app).post('/api/v1/health').set('Content-Type', 'text/plain').send('{"role":"admin"}');
    expect(res.status).toBe(404);
  });

  it.each([
    ["/api/v1/articles/' OR 1=1 --", 'SQL injection in path'],
    ['/api/v1/articles/1;DROP TABLE users', 'stacked query in path'],
    ['/api/v1/<img src=x onerror=alert(1)>', 'XSS in path'],
    ['/api/v1/../../../../etc/passwd', 'path traversal'],
    ['/api/v1/%2e%2e%2f%2e%2e%2fetc%2fpasswd', 'encoded path traversal'],
    ['/api/v1/%00', 'null byte'],
  ])('answers %s (%s) with a generic 404 that echoes nothing', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Route not found' } });
    expect(res.text).not.toMatch(/passwd|DROP|onerror|OR 1=1/i);
  });

  it('does not reflect TRACE requests', async () => {
    const res = await request(app).trace('/api/v1/health').set('X-Secret-Header', 'should-not-echo');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('should-not-echo');
  });

  it('gives no CORS access to a foreign origin, even on preflight', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('sends hardening headers on every response, including errors', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('hides internal error details when a dependency throws', async () => {
    pingDatabase.mockRejectedValue(new Error("ER_ACCESS_DENIED_ERROR: Access denied for user 'nerve_app'@'10.0.0.5'"));
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.text).not.toContain('nerve_app');
    expect(res.text).not.toContain('10.0.0.5');
    expectNoLeak(res);
  });
});

describe('attack prevention — flooding and spoofing', () => {
  it('blocks a flood from one IP with 429 after the limit', async () => {
    const app = createApp({ apiRateLimit: 20 });
    pingDatabase.mockResolvedValue();
    const statuses = [];
    for (let i = 0; i < 25; i += 1) statuses.push((await request(app).get('/api/v1/health')).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
  });

  it('cannot dodge the rate limit by spoofing X-Forwarded-For (proxy not trusted outside production)', async () => {
    const app = createApp({ apiRateLimit: 5 });
    pingDatabase.mockResolvedValue();
    const statuses = [];
    for (let i = 0; i < 8; i += 1) {
      statuses.push((await request(app).get('/api/v1/health').set('X-Forwarded-For', `203.0.113.${i}`)).status);
    }
    expect(statuses.filter((s) => s === 429).length).toBe(3);
  });
});

describe('attack prevention — connection level', () => {
  let server;
  let port;

  beforeAll(async () => {
    pingDatabase.mockResolvedValue();
    server = createHttpServer(createApp(), { headersTimeout: 500, requestTimeout: 1_000, connectionsCheckingInterval: 100 });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    ({ port } = server.address());
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('drops slowloris connections that never finish their headers', async () => {
    const started = Date.now();
    const closedAfter = await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write('GET /api/v1/health HTTP/1.1\r\nHost: localhost\r\nX-Slow: a');
        // Never send the final CRLF: a slowloris client.
      });
      // Drain incoming data, otherwise Node never emits 'close' for a paused socket.
      socket.resume();
      socket.on('close', () => resolve(Date.now() - started));
      socket.on('error', () => {});
      setTimeout(() => reject(new Error('server kept the slow connection open')), 5_000);
    });
    expect(closedAfter).toBeLessThan(5_000);
  });

  it('rejects oversized headers with 431', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { headers: { 'X-Big': 'a'.repeat(20 * 1024) } });
    expect(res.status).toBe(431);
  });

  it('rejects malformed request lines (CRLF / header injection) at the parser', async () => {
    const reply = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write('GET /api/v1/health HTTP/1.1\r\nHost: localhost\r\nX-Bad: a\rInjected: yes\r\n\r\n');
      });
      let data = '';
      socket.on('data', (chunk) => (data += chunk));
      socket.on('close', () => resolve(data));
      socket.on('error', () => resolve(data));
    });
    expect(reply).toMatch(/^HTTP\/1\.1 400/);
  });

  it('rejects request smuggling (both Content-Length and Transfer-Encoding)', async () => {
    const reply = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(
          'POST /api/v1/health HTTP/1.1\r\nHost: localhost\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n',
        );
      });
      let data = '';
      socket.on('data', (chunk) => (data += chunk));
      socket.on('close', () => resolve(data));
      socket.on('error', () => resolve(data));
    });
    expect(reply).toMatch(/^HTTP\/1\.1 400/);
  });
});
