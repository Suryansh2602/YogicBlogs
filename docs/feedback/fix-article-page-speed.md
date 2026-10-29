# Feedback log: `fix/article-page-speed`

Owner request, 2026-10-29: "fix it on its own branch and merge to main". The load test's uncached
article page (500 readers at once, no Redis) had its slowest 1% at 3.03 s, against a 3 s limit.

## What was slow, and why

The load test was run with a CPU profile of the API:
- About a third of the server's CPU went to the ORM (Sequelize and lodash): it **wrote the SQL text anew** for every query, and built full model objects with change tracking that reader pages never use.
- Talking to MySQL itself was about 5%.
- So the article page and the list both stalled near 190 requests/s, while a bare database ping ran at about 760.

The first guess was wrong. Fetching fewer columns and running the follow-up lookups at the same time changed nothing measurable, so the profile was taken before any further changes.

## What changed

- **The article lookup is one fixed SQL statement** with only the columns the page is built from. It runs on every reader request, even when Redis has the page cached, so production benefits too.
  - It leaves out the plain-text copy kept for search, which is as large as the body.
  - Like the model's own queries, it skips soft-deleted rows (`deleted_at IS NULL`).
  - The address is passed as a bound value, never pasted into the SQL.
- **The other reader queries return plain rows** (`raw: true`): the condition, images, linked-article cards, the article list (`nest: true` for its joined condition) and old-address redirects.
- **The condition, cover, linked articles and body images are looked up at the same time**, not one after another.
- **No new cache was added.** A memory cache without Redis could serve outdated pages after an edit, which the articles code promises never to do.

## Errors found (each fixed)

| Problem | Reason | Fix |
|---|---|---|
| The first change made no difference | The cost was CPU in the ORM, not data size or waiting on MySQL | Profiled, then removed the ORM work from the reader path |
| The guard test failed after the switch to fixed SQL | It watched the old `findOne` call | It now checks the SQL itself: the body, no search text, deleted rows excluded |
| Benchmark runs suddenly dropped to a fraction of normal | Windows maintenance (DISM / Windows Update, Defender scanning) was using the CPU and disk | Re-measured on a quiet machine; the load test waits for quiet before running |

## Tests

- **New, on the real database:**
  - the reader query skips the search text and deleted rows, and the page still has everything;
  - a deleted article (even a published one) is never served, and it disappears from the list;
  - SQL attack strings in the address get 404, and the table is untouched.
- **Benchmark** (article scenarios only, 500 at once, quiet machine):

  | Page | Requests/s | Slowest 1% |
  |---|---|---|
  | Article page, before | 191 | 3.37 s |
  | Article page, after | 316 | 2.23 s |
  | Article list, before | 209 | 3.08 s |
  | Article list, after | 314 | 2.07 s |
- **Full load test, quiet machine:** **12 / 12 pass**, 0 errors and 0 timeouts in every scenario. Article page 255 req/s, slowest 1% 2.57 s (was 3.03 s, a fail). Article list 284 req/s, slowest 1% 2.71 s. One earlier run failed 3 scenarios, image serving among them, which this branch doesn't touch. It ran while Windows maintenance was busy, and image serving fell from its usual ~800–1000 to 312 req/s; that run doesn't count. No limit was loosened.
- **Backend QA:** 353 passed (+4 skipped by design), merged coverage 93.0 / 84.5 / 94.2 / 95.4, 0 vulnerabilities. Article database tests 24 / 24.
- **Security:** attack suite 32 / 32, 0 vulnerabilities in either app, credential check passed, plus the SQL-in-address test above.
- **Regression:** frontend 255 passed, bundle within budget; browser journey 30 / 30.
