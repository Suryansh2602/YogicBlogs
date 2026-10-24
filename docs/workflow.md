# Development workflow

Every change flows through the same stream, one branch per feature or task.

```
main ──► branch ──► 1. Developer ──► 2. Reviewer ──► 3. Tester ──► commit ──► PR ──► merge to main
```

## Branches

One branch per feature or task, cut from an up-to-date `main`. Never commit to `main` directly.

| Prefix      | For                          | Example                   |
| ----------- | ---------------------------- | ------------------------- |
| `feature/`  | New functionality            | `feature/article-editor`  |
| `fix/`      | Bug fixes                    | `fix/login-rate-limit`    |
| `chore/`    | Tooling, config, deps        | `chore/eslint-rules`      |
| `docs/`     | Documentation only           | `docs/api-reference`      |

## 1. Developer

- Write the code following the existing structure (`backend/src/modules/<feature>`, `frontend/src/features/<feature>`).
- Validate all input with zod; parameterised SQL only; no secrets in code.
- Write unit and integration tests alongside the code.

## 2. Reviewer

Reviews the full diff before it moves on. Checks:

- **Correctness**: logic, edge cases, error handling, async/await mistakes.
- **Security**: auth and role checks on every protected route, input validation, SQL injection, XSS, data leaks in responses or logs, secrets.
- **Design**: fits the module structure, no duplication, clear names, client and server kept separate.

Findings are listed with a severity and fixed (or explicitly accepted with a reason) before the Tester stage.

## 3. Tester

- `npm run qa` in each changed app, which runs:
  - `npm run lint` (server includes `eslint-plugin-security`)
  - `npm run test:coverage` — unit + integration, coverage ≥ 80% lines / 75% branches
  - `npm audit --omit=dev --audit-level=high`
  - client only: `npm run build` (also checks no secret-like `VITE_*` variable exists)
- Checks staged files: no `.env`, keys or credentials.
- Adds missing tests for anything the review flagged, including abuse cases (bad input, missing auth, wrong role).

Only when all three stages pass is the work committed and a PR opened. There is no CI yet, so `npm run qa` must pass locally before every commit.
