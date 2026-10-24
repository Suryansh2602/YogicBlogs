## What and why

<!-- One or two sentences: what this branch does and why. -->

## 1. Developer

- [ ] Follows the module structure; client and server stay separate
- [ ] Input validated, SQL parameterised, no secrets in code
- [ ] Tests written for new code

## 2. Reviewer

<!-- Findings: severity, what, fixed / accepted (why) -->

- [ ] Correctness reviewed
- [ ] Security reviewed (auth/roles, validation, injection, XSS, leaks)
- [ ] All findings fixed or accepted with a reason

## 3. Tester

- [ ] `npm run qa` passes in each changed app (lint, coverage, audit, client build)
- [ ] No `.env`, keys or credentials in the diff
- [ ] Abuse cases tested (bad input, missing auth, wrong role)
