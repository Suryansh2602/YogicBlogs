// Load test: thousands of concurrent requests against the real API, with pass/fail thresholds.
//   npm run test:load
//
// The API runs in its own process (tests/load/server.js), as in production. Each scenario warms up
// (JIT) first. A bare-Express baseline is measured on the same machine in the same run, so the
// throughput threshold is relative to the hardware (a laptop and a VPS give very different absolutes).
//
// Scenarios:
//   baseline          bare Express 404 handler: the machine's ceiling for comparison
//   capacity-routing  full middleware stack (helmet, rate limit, CORS, error handler), limit lifted
//   stress-1000       same at 1000 concurrent connections: must not error or time out
//   capacity-health   every request pings MySQL through the pool (skipped if MySQL is unreachable)
//   flood (1 IP)      real rate limit: one IP floods with 1000 connections; must hold and answer 429
//   login flood       one IP brute-forces POST /auth/login with 1000 connections: at most 30 password
//                     checks (argon2 is deliberately slow), everything else 429, no errors
//   forged tokens     GET /users/me with an invalid JWT at full speed: all 401, no errors or timeouts
//
// Tunables (env): LOAD_DURATION (s, default 8), LOAD_CONNECTIONS (default 1000),
//                 LOAD_MIN_RATIO (min share of baseline rps, default 0.5), LOAD_P99_MS (default 3000).
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync } from 'node:fs';
import autocannon from 'autocannon';

const DURATION = Number(process.env.LOAD_DURATION ?? 8);
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS ?? 1000);
const MIN_RATIO = Number(process.env.LOAD_MIN_RATIO ?? 0.5);
const P99_MS = Number(process.env.LOAD_P99_MS ?? 3000);
const PROBE = '/api/v1/load-probe'; // unknown route → full middleware stack, no DB

async function startApi(options) {
  const child = spawn(process.execPath, ['tests/load/server.js'], {
    env: { ...process.env, LOAD_APP_OPTIONS: JSON.stringify(options) },
    stdio: ['ignore', 'pipe', 'inherit', 'ipc'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`API process exited early (code ${code})`)));
    child.stdout.on('data', (chunk) => {
      const match = /PORT=(\d+)/.exec(String(chunk));
      if (match) resolve(Number(match[1]));
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: async () => {
      child.send('shutdown');
      await new Promise((resolve) => child.once('exit', resolve));
    },
  };
}

async function startBaseline() {
  const express = (await import('express')).default;
  const app = express();
  app.use((_req, res) => res.status(404).json({ error: { message: 'Route not found' } }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1', backlog: 4096 }, resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    stop: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function measure(url, path, connections, { warmup = true, request = {} } = {}) {
  if (warmup) await autocannon({ url: url + path, connections: 50, duration: 2, ...request });
  return autocannon({ url: url + path, connections, duration: DURATION, timeout: 10, ...request });
}

const codes = (r) => Object.fromEntries(Object.entries(r.statusCodeStats ?? {}).map(([k, v]) => [k, v.count]));
const row = (scenario, r, checks) => {
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  return {
    scenario,
    conns: r.connections,
    reqPerSec: Math.round(r.requests.average),
    p50ms: r.latency.p50,
    p99ms: r.latency.p99,
    errors: r.errors,
    timeouts: r.timeouts,
    statusCodes: JSON.stringify(codes(r)),
    result: failed.length ? `FAIL: ${failed.join('; ')}` : 'PASS',
  };
};
const clean = (r) => [
  { name: 'no errors', ok: r.errors === 0 },
  { name: 'no timeouts', ok: r.timeouts === 0 },
];

const rows = [];

// Baseline: what this machine can do with the thinnest possible Express app.
const baselineServer = await startBaseline();
const baseline = await measure(baselineServer.url, '/', 100);
await baselineServer.stop();
rows.push(row('baseline (bare Express)', baseline, clean(baseline)));
const baselineRps = baseline.requests.average;

// Full stack, rate limit lifted to measure raw capacity.
{
  const api = await startApi({ redisRateLimit: false, apiRateLimit: 1e9 });
  const r = await measure(api.url, PROBE, 100);
  rows.push(
    row('capacity-routing', r, [
      ...clean(r),
      { name: `≥ ${MIN_RATIO * 100}% of baseline rps`, ok: r.requests.average >= MIN_RATIO * baselineRps },
      { name: 'only 404s', ok: Object.keys(codes(r)).every((c) => c === '404') },
    ]),
  );
  const s = await measure(api.url, PROBE, CONNECTIONS, { warmup: false });
  rows.push(row(`stress-${CONNECTIONS}`, s, [...clean(s), { name: `p99 < ${P99_MS} ms`, ok: s.latency.p99 < P99_MS }]));
  await api.stop();
}

// Full stack with a MySQL round trip per request.
{
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { pingDatabase, closeDatabase } = await import('../../src/config/db.js');
  let dbUp = true;
  try {
    await pingDatabase();
  } catch {
    dbUp = false;
  } finally {
    await closeDatabase().catch(() => {});
  }
  if (dbUp) {
    const api = await startApi({ redisRateLimit: false, apiRateLimit: 1e9 });
    const conns = Math.min(CONNECTIONS, 500);
    const r = await measure(api.url, '/api/v1/health', conns);
    const non200 = Object.entries(codes(r)).filter(([c]) => c !== '200').reduce((n, [, v]) => n + v, 0);
    rows.push(
      row('capacity-health (MySQL)', r, [
        ...clean(r),
        { name: `p99 < ${P99_MS} ms`, ok: r.latency.p99 < P99_MS },
        { name: 'all 200', ok: non200 === 0 },
      ]),
    );
    await api.stop();
  } else {
    rows.push({ scenario: 'capacity-health (MySQL)', result: 'SKIPPED: MySQL unreachable (run create-db-users.sql first)' });
  }
}

// Flood: one IP, real limit (300 / 15 min).
{
  const api = await startApi({ redisRateLimit: false });
  const r = await measure(api.url, PROBE, CONNECTIONS, { warmup: false });
  const c = codes(r);
  rows.push(
    row('flood (1 IP, real limit)', r, [
      ...clean(r),
      { name: `p99 < ${P99_MS} ms`, ok: r.latency.p99 < P99_MS },
      { name: 'limit held (≤ 300 through)', ok: (c['404'] ?? 0) <= 300 },
      { name: 'answered with 429', ok: (c['429'] ?? 0) > 0 },
    ]),
  );
  await api.stop();
}

// Brute force on sign-in: the strict credential limit (30 / 15 min per IP) must hold under a flood,
// so an attacker can't burn CPU on password hashing or try more than a handful of passwords.
{
  const login = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'victim@example.com', password: 'guess-guess-guess' }),
  };
  // Exact count first: a 200-request burst on a fresh server. (autocannon's tally can miss the few slow
  // argon2 answers among thousands of instant 429s, so it alone can't prove the handler was reached.)
  const fresh = await startApi({ redisRateLimit: false });
  const burst = await Promise.all(Array.from({ length: 200 }, () => fetch(`${fresh.url}/api/v1/auth/login`, login).then((res) => res.status)));
  await fresh.stop();
  const reached = burst.filter((status) => status === 401).length;

  const api = await startApi({ redisRateLimit: false });
  const r = await measure(api.url, '/api/v1/auth/login', CONNECTIONS, {
    warmup: false,
    request: login,
  });
  const c = codes(r);
  const checked = Object.entries(c).filter(([code]) => code !== '429').reduce((n, [, v]) => n + v, 0);
  rows.push(
    row('login flood (1 IP)', r, [
      ...clean(r),
      { name: `p99 < ${P99_MS} ms`, ok: r.latency.p99 < P99_MS },
      { name: 'at most 30 password checks', ok: checked <= 30 },
      { name: `burst: exactly 30 of 200 reached the check (got ${reached})`, ok: reached === 30 && burst.every((st) => st === 401 || st === 429) },
      { name: 'answered with 429', ok: (c['429'] ?? 0) > 0 },
    ]),
  );
  await api.stop();
}

// Token spam: invalid JWTs on a protected route are rejected cheaply, before any database work.
{
  const api = await startApi({ redisRateLimit: false, apiRateLimit: 1e9 });
  const forged = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6ImFkbWluIn0.c2lnbmF0dXJlLXRoYXQtZG9lcy1ub3QtbWF0Y2g';
  const r = await measure(api.url, '/api/v1/users/me', 100, { request: { headers: { authorization: `Bearer ${forged}` } } });
  rows.push(
    row('forged tokens', r, [
      ...clean(r),
      { name: `p99 < ${P99_MS} ms`, ok: r.latency.p99 < P99_MS },
      { name: 'only 401s', ok: Object.keys(codes(r)).every((code) => code === '401') },
    ]),
  );
  await api.stop();
}

console.table(rows);
const failed = rows.filter((r) => r.result.startsWith('FAIL'));
if (failed.length) {
  console.error(`✖ Load test FAILED: ${failed.map((r) => r.scenario).join(', ')}`);
  process.exit(1);
}
console.log('✔ Load test passed all thresholds');
process.exit(0);
