# Feedback log: `fix/pending-migrations-warning`

Owner report, 2026-11-02: admin recovery failed with "Table 'healthmarg.admin_security' doesn't exist".

## What happened

- **Problem:** recovery failed with a server error, and nothing said why.
- **Reason:** the `admin_security` table arrived in a migration on 2026-10-30. The code reached the owner's computer through Git, but `npm run db:migrate` hadn't been run, so the table didn't exist. The API started without a word about it.
- **Fix:**
  - At startup, the API compares the migration files with `schema_migrations`. If any haven't run, it names them and says to run `npm run db:migrate`: a warning in development, an error in production. The server still starts.
  - The check only reads. Umzug's own check creates its history table, which the runtime user isn't allowed to do.
  - `docs/database.md` says to migrate after every `git pull`, and explains the warning.
- **Owner step:** run `npm run db:migrate` in `backend` once. It adds the one missing table.

## Test results

| Stage | Result |
|---|---|
| Build + unit + integration | Frontend 382 passed; backend 428 passed, 4 skipped (10 new: 9 unit, 1 on real MySQL as the runtime user); 0 audit findings; bundle within budget |
| Real dev database | The check, run as `healthmarg_app`, named the one missing migration (`20261030000100-admin-security.js`) |
| Feedback → change | The live warning read "1 setup step. Features that need them": reworded to "Some features will fail", and every stage rerun |
| Page speed | Slow 4G: Home LCP 2776 ms, article 3112 ms. This change is backend-only and touches no page; the whole run was slower (first paint up on every page), so it is machine noise |
| Load | 14 of 14 scenarios passed, 0 errors |
| Security | 70 backend + 16 frontend passed |
| Live SEO check | 22 of 22 |
| Regression | 35 of 35 Edge steps passed |
