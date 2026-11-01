# Feedback log: `feature/admin-security`

Owner, 2026-10-30: "the ADMIN_SETUP_CODE should be like I can change in future", then "do it and update the docs also for this".

Design: [admin-recovery.md](../admin-recovery.md). Owner how-to: [admin-guide.md](../admin-guide.md), section 5.

## What was built

- **Admin → Security:** where the code comes from, when and by whom it was changed, and wrong codes tried in the last 24 hours.
- **Change the setup code:** needs the password and a fresh 2FA code; the code is typed twice or generated (32 random characters, with a copy button).
- **Use the .env code instead:** removes the panel code, and is refused with `409 NO_FALLBACK` when `.env` has no code.
- **Storage:** new table `admin_security` (one row), argon2id hash only. It applies at once, with no restart.
- **One check for which code counts:** panel, then `.env`, then the temporary startup code (first-time setup only).
- Changes and failed attempts are audited. The code is never logged.

## Errors found (each fixed)

| Problem | Reason | Fix |
|---|---|---|
| Valid requests were refused with 400 | A script dropped the backslashes in the 6-digit and no-spaces patterns | Restored with the editor tool |
| The correct password was reported as wrong | User records hide the password hash by default | The check loads it with the `withPassword` scope |
| Page tests lost their faked answers | Test mode loads each page twice | Fakes answer from what has happened |
| A full test run reported 2 errors, and only 318 tests ran | The computer slept (the run took 24.6 hours), so two test workers timed out | Stopped and repeated the whole sequence |

## Tests (final run)

- **Frontend:** 341 passed, 0 vulnerabilities, bundle within budget.
- **Backend:** 390 passed (+4 skipped by design), 0 vulnerabilities.
- **Security:** 42 / 42 and 9 / 9.
- **Load:** 12 / 12.
- **Page speed:** layout shift ≤ 0.023. Slow-phone content time: home 2.6–2.7 s (2.3 s in earlier runs), Ritucharya 3.1–3.3 s, article page 2.9 s, articles list 2.4 s. The test server doesn't compress files.
- **Browser journey:** 35 / 35, including changing the code in the panel, the old code being refused, and recovery with the new code.

## Owner action

After merging, run `npm run db:migrate` in `backend/` to create `admin_security`.
