# Feedback log: `feature/auth-core`

Owner request (2026-10-25): get Sign in / Sign up working end to end, with the frontend, backend and database connected and verified. Users land on their dashboard; `/admin` has its own sign-in leading to the admin panel.

## Round 0: what was built

- **Sign-up and email verification:** always `202`, so the response never reveals whether an email is registered. Consents are recorded with the policy version. Verification links are single-use and expire after 24 h; in development they're saved to `backend/.local/outbox/`.
- **Sign-in:**
  - argon2id with timing equalised for unknown emails, plus the HIBP breach check.
  - A 15-minute access JWT; the refresh token sits in an HttpOnly + SameSite=Strict cookie, rotates on every use, and its reuse is detected.
  - CSRF protection on the cookie routes.
  - Lockout per IP + account and per account.
- **2FA:**
  - TOTP with the secret encrypted by AES-256-GCM, protection against code replays, and 10 hashed backup codes.
  - **Mandatory for admins:** the first admin sign-in forces enrolment before any session exists.
- **Admin bootstrap:** `/admin/setup` works only while no admin exists and needs the setup code from the server. There's no public admin sign-up.
- **APIs:** `/users/me` (read and update); `/admin/stats`, `/admin/users` and `/admin/audit-logs`, which require the admin role and a session that passed 2FA.

## Round 1: tester and reviewer findings

| Source | Finding | Change |
|---|---|---|
| Reviewer | The strict auth limit (10 / 15 min) covered *every* auth route, including `/csrf`, `/refresh` and `/logout`, which run on each page load, so normal browsing would get blocked | The strict limit applies only to endpoints that check a credential, code or emailed token. It was raised to 30 / 15 min per IP because many Indian mobile users share one IP (CGNAT); the per-account lockout is the main brute-force guard |
| Reviewer | Two simultaneous sign-ups for the same new email: the slower one got `409`, revealing the email exists | The unique-constraint race now answers `202` and is audited. DB test with 4 parallel sign-ups |
| Reviewer | Lockout errors didn't send `Retry-After` | The error handler sets it; tested |
| Reviewer | Rate-limited answers had no `code` | Added `RATE_LIMITED`, so the frontend can show a friendly message |
| Reviewer | `express.urlencoded` was still enabled | Removed: the API is JSON-only, so classic form-post CSRF payloads are never parsed |
| Tester | Merged coverage was 39% from the unit tests alone, because auth code is proven against real MySQL | `npm run test:coverage` merges the unit and DB suites (Vitest blob reports) and enforces 80/80/75/80 on the merge. Result: 94.6% lines, 83.5% branches |
| Tester | The load-test tool's tally missed the ~30 slow argon2 answers among 13,000 instant 429s, so "≤ 30 password checks" passed vacuously | Added an exact burst check: 200 parallel logins on a fresh server, **exactly 30** reach the password check |
| Tester | The lockout test got a 429 from the IP limiter, not the lockout (the test block had used up its own budget) | The test uses a fresh app instance, so the 429 can only come from the lockout |
| Rename | The Redis key prefix `nn:` came from the old name | Changed to `hm:` (in the rename branch) |

## Round 2: QA results

- **Unit, integration and security:** 141 tests, including 32 attack tests: forged, alg-swapped, `none` and expired JWTs; CSRF from a foreign origin; privilege fields in sign-up; brute force → 429.
- **Real MySQL:** 48 tests (4 Redis tests skipped locally):
  - sign-up → verify → sign-in;
  - refresh rotation; stolen-token reuse revokes the session and emails the user; the two-tab race gives 409;
  - sign-out kills the access token at once; sign out everywhere;
  - password reset (only the newest link works, all sessions end);
  - lockout plus `Retry-After`; user 2FA (the ticket burns after 5 wrong codes);
  - admin bootstrap → forced 2FA → panel; TOTP replay rejected; backup codes single-use.
- **Live smoke test** against the dev server: 28/28 passed.
- **Load test (1,000 connections):** all scenarios pass. The login flood from one IP got exactly 30 password checks and everything else 429, with no errors and p99 1.9 s. Forged-token spam is rejected at about 1,900 requests/s without touching the database.

## Open (owner or later branches)

- Create the reCAPTCHA v3 keys before production (`RECAPTCHA_MODE=live` is enforced there).
- SMTP provider for real emails (production enforces `MAIL_MODE=smtp`).
- Later: Google sign-in, session list, 2FA disable and backup-code regeneration, admin user actions (suspend, change role).
