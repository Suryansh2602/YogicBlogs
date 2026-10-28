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
- [ ] Load test (`npm run test:load`) meets thresholds; flood answered with 429s
- [ ] Attack-prevention tests pass (`tests/security/`)
- [ ] Credential check: no `.env`, keys or secret values in the diff

## 4. Feedback

- [ ] Feedback log `docs/feedback/<branch>.md` updated; every item fixed or accepted

## 5. Owner review

- [ ] Diff reviewed on GitHub
- [ ] Tested in Postman (`backend/postman/`)
- [ ] Approved for merge
