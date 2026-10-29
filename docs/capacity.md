# Capacity: how much load the site can handle

Measured with the load test (`npm run test:load` in `backend/`) on 2026-10-29, after the
article-speed fix and the global error handling. Owner question: "How much load or users can our website
handle?"

## Short answer

On the development laptop, as tested, the site handles roughly **3,000–7,000 people reading at the same
moment**, or about **1–2 million article views a day**. These are estimates from the worst case (no Redis
cache), not guarantees. The production server must be measured before launch (see the end of this page).

## Measured

Laptop, **Redis off**, one API process, 500–1,000 simultaneous connections, 8 s per scenario. The test
tool ran on the same machine.

| What | Requests per second | Slowest 1% waited | Errors |
|---|---|---|---|
| Opening an article (built from MySQL every time) | ~350 | 2.0 s | 0 |
| The article list | ~340 | 2.1 s | 0 |
| Conditions list | ~700 | 1.2 s | 0 |
| Images | ~1,060 | 0.8 s | 0 |
| Simple requests, full security checks, no database | ~2,800–3,200 | 0.1–0.8 s | 0 |
| 1,000 connections at once | ~3,200 | 0.8 s | 0 |

The test's pass limits: the slowest 1% under 3 s, no errors and no timeouts. **All 12 scenarios pass.**

## From requests to people

- One reader opening an article causes about 2–4 requests (the article, its images, the list).
- Readers then read for a minute or more before the next click.
- So ~350 article opens a second means **a few thousand people actively reading at the same moment**.
- Over a day that is about 30 million article opens, so even with very uneven traffic (busy evenings), **1–2 million views a day** fits comfortably.

## Why production should do better

| Here | In production |
|---|---|
| Redis off: every article rebuilt from MySQL (the worst case) | Redis on: most article views come from memory, which should be several times faster |
| A laptop, with the test tool on the same processor | A server, with the load coming from outside |
| One API process | One process per CPU core |
| Files sent uncompressed by the test web server | gzip or brotli (about a third of the size) |

## Limits that apply whatever the hardware

| Limit | Why |
|---|---|
| 300 requests per 15 minutes per IP (articles, images and the editor have their own budgets) | Stops floods and scrapers. Ordinary readers never come close. Many users behind one mobile IP share it, hence the separate reading budget (1,500). |
| 30 sign-in attempts per 15 minutes per IP; account lockout after repeated failures | Stops password guessing |
| Sign-in is deliberately slow (argon2 password hashing) | Makes stolen password data useless. Heavy sign-in traffic (thousands per minute) would be the first thing to need more CPU. |
| Image uploads: 60 per hour per admin | Protects the disk and the image worker |

## History of the article page under load

| When | Requests per second | Slowest 1% | Result |
|---|---|---|---|
| Before the speed fix | ~190 | 3.0–3.4 s | Failed (limit 3 s) |
| After `fix/article-page-speed` (fixed SQL, plain rows) | 255–377 | 1.7–2.6 s | Passed |
| After the global error handling (request IDs) | ~350 | 2.0 s | Passed |

Details: [feedback/fix-article-page-speed.md](feedback/fix-article-page-speed.md).

## Before launch

Run the same load test **on the production server, with Redis on**. It takes about 5 minutes. Record the
results here, and turn on compression (gzip or brotli) in the web server.
