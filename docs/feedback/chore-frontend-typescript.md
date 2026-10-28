# Feedback log: `chore/frontend-typescript` (and `chore/rename-healthmarg`)

Owner request (2026-10-25): use TypeScript for React, and the project name is now **Healthmarg**.

## Round 0: what was built

- **Rename (`chore/rename-healthmarg`):** every "Nerve and Nector" reference was replaced in code, UI, docs, Postman, the DB setup SQL and the test fixtures. The databases became `healthmarg`, `healthmarg_audit`, `healthmarg_test` and `healthmarg_test_audit`; the users became `healthmarg_app` and `healthmarg_migrator`. Older feedback logs keep the old names as history.
- **TypeScript:** every frontend file moved to `.ts`/`.tsx`. The compiler runs `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `noPropertyAccessFromIndexSignature`. ESLint uses `typescript-eslint` `strictTypeChecked`, and the existing XSS, eval and backend-import rules still apply. `npm run build` and `npm run qa` type-check first.
- `apiClient` is now generic (`apiClient.get<T>()`) and exposes the backend's error `code` (needed for auth: `REFRESH_RACE`, `TOKEN_INVALID`).

## Round 1: review and tests

| Source | Finding | Change |
|---|---|---|
| Tester | TypeScript 7 (the Go-based compiler) is the latest, but `typescript-eslint` 8.71 supports only `<6.1` | Pinned TypeScript `~6.0.3`; revisit when typed linting supports 7 |
| Tester | `typescript-eslint` 8.72 was 6 days old, under the two-week supply-chain rule | Used 8.71.0 |
| Lint | `no-base-to-string` on a test helper; `no-confusing-void-expression` in the env-guard tests | Narrowed the fetch input type; added braces |
| Lint | The project service didn't find `vite.config.ts` (it lives in `tsconfig.node.json`) | ESLint `parserOptions.project` lists both tsconfigs |
| Build | Vite warns that its future native config loader needs explicit extensions | `import './config/envGuard.ts'` with `allowImportingTsExtensions` (node config only) |
| Tester | The typecheck could have been passing vacuously | A deliberate type error was rejected (TS2322) |
| Security | The secret guard could have been lost in the move | `VITE_DB_PASSWORD=x vite build` still fails with "Refusing to build" |
| Tester | `npm run qa` | Lint, typecheck, 18/18 tests (100% coverage), 0 vulnerabilities, build: all green |
| Security | Local DB passwords were printed in the assistant's own tool output during the rename | The new `healthmarg_*` users got freshly generated passwords, written only to the git-ignored files |

## Open

- The owner runs `backend/.local/create-db-users.local.sql` as root to create the `healthmarg` databases and users. Then the migrations and seed are applied again.
- Optional, after that works: `backend/.local/drop-old-nerve-databases.local.sql` removes the old databases and users.
