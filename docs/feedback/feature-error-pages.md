# Feedback log: `feature/error-pages`

Owner requests, 2026-10-29:
- "Design the error page, for what you know."
- "Create global exception handler and configure the error pages accordingly."

Design and flows: [error-pages.md](../error-pages.md).

## What was built

**Error pages** (one editorial design, no technical details):
- **404:** big code, Go back home, search the articles, and links to the sections.
- **Something went wrong** (with a reference), **Healthmarg has been updated** (Reload), and **You're offline**.
- **API answers:**
  - 401: "Please sign in to continue";
  - 403: "You don't have access" (the API's reason is shown);
  - 429: "Too many requests", with how long to wait;
  - 503: "Temporarily unavailable" (with a reference).
- Article not found and article couldn't load use the same pages.
- Page errors keep the site's header, season strip and footer. If the frame itself fails, a minimal page with the logo is shown.
- A slim "You're offline" notice appears under the header while the connection is down.

**Global error handling:**
- **API:**
  - every request gets an ID (the `X-Request-Id` header, logs, the audit log; the field existed but was never filled);
  - every error has a `code` (filled from the status when a route gives none);
  - server errors carry a `reference`;
  - MySQL or Redis unreachable gives `503 SERVICE_UNAVAILABLE` with `Retry-After`;
  - broken JSON gives `INVALID_JSON`;
  - unknown errors give a friendly 500 message.
- **`POST /client-errors`:** browser crash reports, logged only. Fixed fields; the path is kept without its query or fragment; emails and token-like text are blanked; 20 per 15 minutes per IP. Documented in api.md, and added to Postman.
- **Website:**
  - global listeners for uncaught errors, failed background promises and page code that failed to preload, reported (at most 5 per page load, duplicates skipped, expected 4xx answers skipped);
  - an app-wide error boundary around the providers and the router;
  - one `ErrorPageFor` chooses the page for any error.

## Errors found (each fixed)

| Problem | Reason | Fix |
|---|---|---|
| **A crash showed the router's raw developer screen** | No error element on the routes | Route error screens inside and outside the frame |
| **Request IDs were never set** (`requestId: null` in logs and audits) | No middleware assigned `req.id` | A request-ID middleware first in the app |
| Some errors had no `code` (unknown route, 500, body-parser errors) | Codes were only set where a route chose one | The handler fills a code from the status |
| A database outage answered 500 "Internal server error" | Connection errors weren't recognised | 503 with Retry-After |
| On the offline page, the big word "Offline" repeated the headline | A code was shown for every error | The big code is shown only for 404 (and 401/403/429/503) |
| The "couldn't load" test used 400, which the article page treats as "not found" | Wrong test input | Uses a real server error |
| Test mode loads each page twice, using up the one faked failure | StrictMode | Fakes that keep failing until "Try again" |
| The safety-net test failed only in the full file | An earlier test left the address on `/articles/calm` | The test sets its own address (and checks the query is stripped) |
| Strict type check: `body.reference` | Index-signature access rule | `body['reference']` |
| The test run failed with "1 unhandled error" although all tests passed | The test fired an error after removing the listeners, with no one to handle it | The test catches that one itself |

## Tests

- **Backend:**
  - error handler unit tests: codes for every status, 500 with a reference, 503 for database/pool/Redis down, INVALID_JSON, 413, no reference on 4xx, request IDs (random, a client's ignored);
  - client-errors integration: 204 and scrubbed log, 6 kinds of invalid input refused, non-JSON refused, flood stopped at 20;
  - attack suite updated for `code: NOT_FOUND`;
  - **371 passed** (+4 skipped by design), coverage 93.1 / 84.3 / 94.3 / 95.5, 0 vulnerabilities.
- **Frontend:**
  - error kinds (router, missing code, offline, every API status, network failure);
  - reporting (path only, 4xx skipped, references, duplicates, cap, never throws, 300-character limit, listeners and removal);
  - pages (404 with search and links, crash in the frame, update, offline, frame failure, every API error page, wait time, the API's reason, the app-wide safety net and its report, article 404/500/503, the offline notice, search safety);
  - **329 passed**, coverage 87.5 / 81.3 / 82.9 / 88.8, 0 vulnerabilities, bundle within budget.
- **Performance:**
  - page speed unchanged, layout shift ≤ 0.023 everywhere;
  - **load test 12 / 12** with 0 errors (adding a request ID costs nothing measurable).
- **Security:** attack suite and client-errors tests 42 / 42; reader attack tests 9 / 9.
- **Regression:** browser journey 30 / 30.
