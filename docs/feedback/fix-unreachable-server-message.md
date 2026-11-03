# Feedback log: `fix/unreachable-server-message`

Owner report, 2026-11-02: the admin recovery page said "Can't reach Healthmarg right now. Check your internet connection" while the internet was working.

## What happened

- **Problem:** every form blamed the visitor's internet whenever a request got no answer.
- **Reason:** the API allows only the sites in `CLIENT_ORIGIN`. The owner's `backend/.env` listed `http://localhost:5174`, but the site was open on `http://localhost:5173`, so the browser blocked the reply. A browser reports "offline", "server down" and "site not allowed" as the same error, and the form assumed "offline".
- **Fix:**
  - Forms now check the browser's online flag. Offline: "You're offline". Online: "Healthmarg's server didn't answer. Your internet is working". The full-page error screens already made this distinction.
  - In development only, the message adds a hint naming `CLIENT_ORIGIN` and the site's exact address. Production builds leave the hint out.
  - `backend/.env.example` now lists both Vite ports, 5173 and 5174.
  - The admin guide's troubleshooting table explains both messages.
- **Owner step:** the owner's own `backend/.env` is left alone. Its `CLIENT_ORIGIN` needs `http://localhost:5173` added, followed by an API restart.

## Test results

| Stage | Result |
|---|---|
| Build + unit + integration | Frontend 384 passed; backend 418 passed, 4 skipped; types clean; 0 audit findings; bundle within budget |
| Production build check | The new message is in the build; the developer hint is not |
| Page speed | Slow 4G: Home LCP 2524 ms, article 2744 ms (no change from this fix; normal run-to-run variation) |
| Load | 14 of 14 scenarios passed, 0 errors, 0 timeouts |
| Security | 70 backend + 16 frontend passed |
| Live SEO check | 22 of 22 |
| Regression | 35 of 35 Edge steps passed |
