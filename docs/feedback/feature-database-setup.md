# Feedback log — `feature/database-setup`

Every test run produces feedback. Each item is reviewed and either **fixed** (with the change) or **accepted** (with the reason) before the branch moves on. See [workflow.md](../workflow.md#4-feedback).

| Severity | Meaning |
|---|---|
| High | Security hole, data loss, or crash: must fix before push |
| Medium | Wrong behaviour or a real risk: fix in this branch |
| Low | Hardening or tidiness: fix or accept with a reason |

---

## Round 0 — planning critic + first test runs (before this log existed)

| # | Source | Finding | Sev | Decision / change |
|---|---|---|---|---|
| 0.1 | Unit tests | Zod 4 `.default('false')` skips the transform, so `DB_SSL`, `DB_LOGGING` and `REDIS_TLS` defaulted to **on** (the string `'false'` is truthy) | High | Fixed: real boolean defaults, plus a regression test |
| 0.2 | Test run | DB-only tests were picked up by `npm test` | Medium | Fixed: `tests/db` runs only through `npm run test:db` |
| 0.3 | npm audit | Sequelize bundles `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq) | Medium | Fixed: npm `overrides` to `uuid@^11.1.1`; verified Sequelize UUIDs still work |
| 0.4 | npm audit | autocannon → hyperid bundles the same old `uuid` (dev only) | Low | Fixed: same override |
| 0.5 | Critic agent | Soft delete + `UNIQUE` blocks slug and email reuse | Medium | Fixed: generated `alive` column + `UNIQUE(col, alive)` |
| 0.6 | Critic agent | MySQL can't make a single table append-only inside a database-wide grant | High | Fixed: separate `…_audit` database, app user `INSERT, SELECT` only |
| 0.7 | Critic agent | Allowed values enforced only in JS | Medium | Fixed: `CHECK` constraints in migrations |
| 0.8 | Critic agent | node-redis queues commands while offline, so requests hang | High | Fixed: `disableOfflineQueue: true` |
| 0.9 | Self-review | Redis `allkeys-lru` could evict rate-limit counters, letting attackers reset their limits | High | Fixed: `noeviction` |
| 0.10 | Critic agent | Auth-phase columns missing (session hard expiry, `amr`, email change, consents) | Low | Fixed now, while the schema is unreleased |
| 0.11 | Critic agent | Concurrent admin edits overwrite each other | Medium | Fixed: `version` column (optimistic locking) |
| 0.12 | Owner | Redis / Docker not wanted locally yet | — | `REDIS_ENABLED` flag: off locally, enforced on in production |

## Round 1 — attack-prevention suite (`tests/security/attacks.test.js`, 21 tests)

| # | Source | Finding | Sev | Decision / change |
|---|---|---|---|---|
| 1.1 | Attack test | A preflight from a foreign origin still got `Access-Control-Allow-Credentials: true`. Browsers block it (no allow-origin header), but no grant should be sent at all. | Low | Fixed: per-request CORS options; unknown origins get **no** CORS headers. Methods, headers and `maxAge` made explicit for allowed origins. |
| 1.2 | Attack test | Slowloris connection looked like it was never dropped | High → none | Investigated: the server **does** drop it after `headersTimeout` (`408` at about 536 ms). The test socket was paused, so `close` never fired. Fixed the test (`socket.resume()`); protection confirmed. |
| 1.3 | Attack test | All other attacks (413 oversize, 400 malformed JSON, deep nesting, prototype pollution, text/plain smuggling, SQLi/XSS/traversal/null byte in path, TRACE, 431 huge headers, CRLF injection, request smuggling, flood → 429, X-Forwarded-For spoofing, error-detail leaks) | — | Passing, no change needed |

Result: **94/94 tests passing**, lint clean.

## Round 2 — load test (`npm run test:load`)

Dev machine: AMD Ryzen 3 3250U (2 cores / 4 threads), Windows 11. The load generator shares the CPU, so absolute numbers are conservative. A production VPS will differ, which is why thresholds are relative to a same-run baseline.

| # | Source | Finding | Sev | Decision / change |
|---|---|---|---|---|
| 2.1 | Load test v1 | 1000 connections: p99 9.5 s and 9,984 errors | High → test bug | Investigated: the load generator and the server shared one process and one event loop. With the server in its own process: **0 errors** at 1000 connections. Load test rebuilt to spawn the API as a child process. |
| 2.2 | CPU profile | `ApiError` construction = **14.8 %** of CPU (stack traces built for every 404/400 and never used) | Medium | Fixed: 4xx skip stack capture, 5xx keep it. **+39 % median throughput** (1,895 → 2,626 req/s @ 100 conns, 4 runs each after warm-up). |
| 2.3 | Load test | A single cold run gave misleading numbers (JIT not warmed up, laptop noise) | Medium | Fixed: warm-up before each scenario; bare-Express baseline measured in the same run; throughput threshold relative to it |
| 2.4 | Load test | On Windows a child can't receive SIGTERM, so the profile and graceful exit were lost | Low | Fixed: IPC `shutdown` message for the load-test server |

Final run (all PASS):

| Scenario | Conns | req/s | p99 | Errors | Notes |
|---|---|---|---|---|---|
| Baseline (bare Express) | 100 | 3,285 | 49 ms | 0 | machine ceiling |
| Full API stack | 100 | 2,854 | 72 ms | 0 | **87 % of baseline** |
| Stress | 1,000 | 2,762 | 969 ms | 0 | no errors, no timeouts |
| Flood, one IP, real limit | 1,000 | 2,982 | 1,348 ms | 0 | exactly 300 through, 23,552 → 429 |
| With MySQL | — | — | — | — | skipped until the DB is set up |

## Round 3 — real MySQL tests (`npm run test:db`)

_Pending: waiting for the owner to run `create-db-users.sql`._

## Round 4 — Reviewer stage

_Pending._
