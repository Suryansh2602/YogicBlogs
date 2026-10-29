# Feedback log: `feature/admin-recovery`

Owner, 2026-10-30:
- "What is the name of the database table for admin?" Answer: `users` (`role = 'admin'`).
- "Set up a way so that admin can register himself." Decision: "first admin only for now, and also give reusable setup code for cases if admin forget his/her ID".

Design: [admin-recovery.md](../admin-recovery.md).

## What was built

- **Registration** stays first-admin-only (`/admin/setup`, already built), and closes for good after that.
- **Recovery, `/admin/recover`** (new, reusable), with the configured `ADMIN_SETUP_CODE`:
  1. The code lists the admin accounts with their **full email**, so a forgotten email is found again.
  2. Choose one and set a new password. In one transaction: the password is saved, 2FA and backup codes are removed (set up again at the next sign-in), every session is signed out, and the account is reactivated.
  3. The page shows the email to sign in with.
  - Never for members, never creates an admin, never changes a role. Unknown fields such as `role` are refused.
  - Works only when `ADMIN_SETUP_CODE` is set (`503 RECOVERY_NOT_CONFIGURED`), and never with the temporary startup code.
  - Constant-time code check, the credential rate limit, and audited (`admin.recovery.failure` / `.lookup` / `.completed`).
- **"Can't sign in? Recover the admin account"** link on the admin sign-in page.
- api.md, Postman (two requests; the lookup stores `adminId`), and a new environment variable `adminId`.

## Errors found (each fixed)

| Problem | Reason | Fix |
|---|---|---|
| The planned design showed a partly hidden email, but the admin needs the full one to sign in | Design slip | The full email is shown, only to the holder of the setup code |
| "Recovery not set up" showed a generic "server had a problem" | Every 5xx message is replaced for safety | A dedicated message saying exactly what the operator must do |
| A strict type error on the password check | The chosen account could be missing | Checked first |

## Tests

- **Backend:**
  - real database (5): wrong code 403 and audited; only admins listed, with emails, `no-store`; a member gets 404; password rules; recovery (old access token 401, old refresh refused, old password 401, new one asks for 2FA setup, 2FA and backup codes gone, reactivated, still one admin, setup still closed); a `role` field is refused;
  - unit (2): not configured → 503 without touching the database;
  - **378 passed** (+4 skipped by design), coverage 93.2 / 95.6 (statements / lines), 0 vulnerabilities.
- **Frontend:**
  - the link on sign-in; the code → accounts → password → recovered flow; a weak password; a wrong code; recovery not set up; no admin yet;
  - **334 passed**, 0 vulnerabilities, bundle within budget.
- **Performance:** page speed unchanged; load test 12 / 12 (article page 309 req/s, slowest 1% 2.2 s).
- **Security:** attack suite and client-errors tests 42 / 42; reader attack tests 9 / 9.
- **Regression:** browser journey **33 / 33**, including real recovery (email shown, the old session signed out, the new password, 2FA required again).

## Owner action

Set a long, random `ADMIN_SETUP_CODE` in `backend/.env` (24+ characters) and restart the API. Keep it secret: anyone with it can recover the admin account.
