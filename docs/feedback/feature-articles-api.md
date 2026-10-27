# Feedback log: `feature/articles-api`

Branch 3 of the content phase. Design: [articles.md](../articles.md).

**Owner decisions while building (2026-10-27):**
- "finish as soon as possible": launch with articles first, i.e. branches 3 (this) and 4 (editor + reader pages). Speech, translation and audio/video follow after launch.
- One combined review per branch instead of several design rounds.

## Round 0: design review (before code)

Four agents reviewed the written plan. **Three failed** with "can't reach the API server" (a DNS outage on this machine, the same one that briefly broke `npm audit`). The empty results were not treated as a pass. The data-integrity reviewer finished with **16 findings, and 15 changed the plan** (marked ✱ in articles.md). The biggest:

| Finding | Change |
|---|---|
| One shared `version` for autosave, publish and status changes would cause false "someone else saved" errors | Drafts have their own `draft_version` with an atomic check. Status changes never touch it |
| Rebuilding references on every save would take foreign-key locks on every linked article (deadlocks) | No foreign key on link targets (articles are only soft-deleted anyway). Targets are resolved when a page is read |
| Media could be deleted while a publish was using it | Media delete locks the media row first. Recording a use needs that row, and publish re-checks every image inside its transaction |
| Translations (later) would need the tables keyed by language, which is painful to add once data exists | `lang` is part of the reference and media-usage keys now. A `live_version` is kept for translations and caching |
| The draft in the hot `articles` row meant every keystroke rewrote it, and drafts could leak into search | Separate `article_drafts` table. Identical autosaves write nothing. Search covers only the live copy |
| A cache cleared before commit, or a failed Redis delete, could keep serving an unpublished article | Generation-numbered cache keys, bumped after commit, plus a one-row "is it live?" check on every request. Redis down means no cache, never stale content |
| Slug semantics for drafts were undefined; changing a published address broke links | The slug is set when publishing, with old addresses kept as redirects. The checklist blocks taken and formerly used slugs |
| A published article under a hidden condition was undefined | The condition must be published to publish; a condition can't be hidden while published articles use it |

**Not taken (1):** keying cached payloads per article generation (one global generation is simpler, and publishes are rare).

## Errors found while building (each fixed)

| Error | Cause | Fix |
|---|---|---|
| Lint flagged a "trojan source" risk in the new validator | The escapes I wrote for invisible bidi characters (`‮`…) were saved as the **real invisible characters**. Invisible direction-control characters in source code are a known attack | A script replaced all 11 with visible `\u` escapes. Every tracked file was searched: none contain such characters |
| The full test database suite failed in 30+ places | The "every migration rolls back and re-applies" test hit its 20 s limit (the article migration rebuilds the table and the full-text index). Cut off mid-way, it left the schema half-migrated, and every later test failed | That test gets its own 5-minute limit. The whole suite then passed (121 tests) |
| The large-body tests got "connection reset" | The server correctly refuses an anonymous or member upload before reading it, then closes while the test client is still sending 500 KB | The test declares 900 KB, sends a few bytes, and reads the 401/403: proof the body is never read |
| An image-pipeline test timed out once | Image processing is CPU-heavy and the full parallel run is slow on this machine | 30 s timeout for that group (no assertion changed) |
| The "restore keeps the old draft" test expected a `restore` revision | The draft before the restore was identical to the manual revision saved just before, so de-duplication correctly skipped storing it twice | The test now checks what matters: the pre-restore draft is still recoverable |

## Round 1: Reviewer (one combined code review, for speed)

Two reviewers (security; correctness and data) and a verifier. **19 findings → 11 real once duplicates are merged, all fixed.** Each fix that can be triggered in a test has one, and the two most important were checked by undoing them (both caught).

| Finding | Change |
|---|---|
| The general 300-per-15-min per-IP limit applied to autosave too: an admin writing for 15 minutes would be cut off mid-article, and readers behind one mobile IP shared 300 page loads | Readers (1500) and the editor (3000) get their own per-IP budgets. The general limit skips them, and autosave keeps its per-admin limit. Test: general limit used up, reading and editing still work |
| The article page decided "teaser or full" from one database read but built the page from a second. In a republish race, members text could go out in full and be publicly cacheable | Built from the same row that decided access and the cache key |
| Made-up list cursors became cache keys (Redis could be filled) | Only first pages are cached; searches and later pages aren't |
| Republishing re-derived the address from a changed title, so a published article's URL moved with every title edit | A published article keeps its address unless a new one is typed. Test (checked by undoing the fix) |
| Hiding a condition counted published articles outside any lock, so a publish could slip in between | The condition row is locked first, and publish takes a share lock on it. Not testable reliably (a race); covered by the locking design |
| The article list set `public, max-age=60` before running the query, so errors could be cached | The header is set only on success. Test |
| Two articles publishing the same address at once: the loser got a vague "Already exists" | `409 SLUG_TAKEN` with the specific message. Test runs both at once |
| A 1–2 character title at create got Sequelize's generic message | "The title needs at least 3 characters." Test |
| Draft field errors had paths without `draft.` | Consistent `draft.…` paths. Test |
| Rebuilding usage rows could deadlock saves of *different* articles (a 500 in the editor) | Saves and publishes retry automatically on a deadlock (up to 3 times) |

**Rejected (3), with reasons:**
- **Anonymous search over members articles' text:** documented, and only public card fields come back.
- **The backfill not filling every new column:** no articles exist before this branch.
- **Publish time rounding hiding a new article from the list:** refuted from Sequelize's own source.

## Round 2: Tester

- **Real database, 21 article tests:**
  - access;
  - a 900 KB body from anonymous visitors or members is never read;
  - other routes stay at 100 kB;
  - autosave locking, identical saves, the 1 MB limit, hostile drafts (`javascript:` links, raw HTML, self-relation, smuggled fields);
  - the checklist;
  - publish, and readers;
  - drafts never public;
  - members teaser vs full, and an invalid token as 401;
  - redirects;
  - paging and search;
  - unpublished targets never leaking;
  - inbound-link confirmation;
  - media and condition protection;
  - archive, discard, a stale and a confirmed delete, 410 after delete;
  - revisions;
  - plus the 5 review-fix tests.
- **Unit, 43 document tests:**
  - every allowed block;
  - 23 hostile shapes, 10 hostile links;
  - the size and depth limits;
  - text, words (Hindi too) and references;
  - the reader clean-up (unpublished articles and missing images).
- **Mutation checks:** 12 protections were undone one at a time; a test failed each time:
  - leak of unpublished links;
  - members text to anonymous visitors;
  - unpublished pages still served;
  - stale saves;
  - the 1 MB route;
  - a hidden condition;
  - inbound confirmation;
  - old addresses;
  - condition hiding;
  - media in drafts;
  - the separate rate budgets;
  - a published article keeping its address.
- **The attack suite caught a real issue:** a malformed article address (`/articles/' OR 1=1 --`) got a 400 validation error instead of the app's generic 404. It now falls through to the same "Route not found" as any other garbage path. (It only showed in the full QA, which runs the security suite; my earlier runs covered only `tests/unit`.)
- **QA:** backend 225 hermetic + 126 real-database tests, 0 vulnerabilities.
- **Load: failed, and not hidden.** On this machine even the bare-Express baseline dropped to ~1000 requests/s (1922 two days ago), and scenarios this branch never touched (floods, conditions list) missed their limits too. The new uncached article page runs at about ⅓ of a database ping (3–4 queries per page); in production Redis serves cached pages. **No threshold was loosened.** The load test must be run on the production server before launch.

## Open

- Run the load test on the production server (with Redis) before launch.
- Two race fixes (hiding a condition during a publish; members access decided from one read) are covered by the locking design and the review, not by a test.
