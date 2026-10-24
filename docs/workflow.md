# Development workflow

Every change flows through the same stream, one branch per feature or task.

```
main ──► branch ──► 1. Developer ──► 2. Reviewer ──► 3. Tester ──► 4. Feedback ──┐
                         ▲                                            │ (fix / accept)
                         └────────────── loop until clean ◄───────────┘
                                          ──► push ──► 5. Owner review ──► merge to main
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
- Update `docs/` (architecture, api, database, plan status) and the Postman collection (`backend/postman/`) in the same branch.

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
- **Load test** (`npm run test:load` in `backend/`): thousands of concurrent requests against the real API; throughput, p99 latency and error rate must meet the thresholds, and a single-IP flood must be answered with fast `429`s while the server stays responsive.
- **Attack-prevention tests** (`backend/tests/security/`): hostile requests (oversized and deeply nested bodies, malformed JSON, prototype pollution, SQL-injection and XSS strings, path traversal, bad methods, foreign origins, huge headers, slow connections) plus feature-specific attacks (brute force, token tampering, privilege escalation, IDOR, CSRF).
- **Credential check before every commit/push:** `.env`, `.env.test` and `backend/.local/` are git-ignored and not staged; the real secret values from the local env files are compared against the staged diff (without printing them); staged files are scanned for keys, passwords and tokens.
- Adds missing tests for anything the review flagged, including abuse cases (bad input, missing auth, wrong role).

Only when every stage passes and the latest feedback round is clean is the work pushed (pushing means: tests pass and the code is production-ready). There is no CI yet, so `npm run qa` must pass locally before every commit.

## 4. Feedback

After **every** test run (unit, integration, attack, load, DB) and every review, the findings are written to `docs/feedback/<branch-name>.md`: round, source, finding, severity, decision, change. Each item is reviewed and either **fixed** or **accepted with a reason**. The branch loops back to the Developer until a round comes back clean. Only then is it pushed.

## 5. Owner review

- Every branch is pushed to GitHub; the owner opens the branch (or its pull request) and reviews the diff, and tests the API in Postman.
- The owner is notified before any merge, with: what the branch contains, the Reviewer findings, the Tester results (incl. load and attack tests), and where to look.
- **Nothing is merged into `main` without the owner's explicit approval for that branch.**
