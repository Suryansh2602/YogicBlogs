# Browser checks and the test stages

Every change goes through the same stages before it is pushed: build, unit, integration, page speed and load,
security, then regression (see `docs/workflow.md`). The browser stages run in Microsoft Edge through
`playwright-core`, against the production build, an API on port 5001 and the **test** database
(`backend/.env.test`). The dev database is never touched, and nothing is left behind.

| Script | What it checks |
|---|---|
| `run-stages.ps1` | Every stage in order; stops at the first failure and keeps the computer awake. `-From load` reruns from one stage on, only when nothing changed since the earlier stages passed. Each stage's output goes to `stage-*.log` |
| `flow.mjs` | Regression: 35 steps through the real site (sign-up, 2FA, sign-out, admin setup and recovery, media, articles, themes) |
| `seo-live.mjs` | What crawlers and readers get: sitemap, robots.txt, page heads, prerendered pages, the CSP, JavaScript off |
| `perf.mjs` | Page speed on this machine and on an emulated phone (Slow 4G, CPU 4× slower): first paint, LCP, layout shift |
| `perf-diag.mjs` | When a page is slow: every file's timing, the LCP element, and (with `TRACE=1` or `PROFILE=1`) where the main thread spends its time |
| `og-image.mjs` | Draws the 1200×630 link-preview image, `frontend/public/og-default.png` |

## Setup

```bash
cd e2e && npm install     # playwright-core only; it uses the Edge already on the computer
```

Run from the project folder: `npm run stages --prefix e2e`, or one script: `cd e2e && node flow.mjs`.

Ports: the test API uses 5001 and the test site 5174. If one is taken, set `E2E_API_PORT` or `E2E_WEB_PORT`
(for example `$env:E2E_WEB_PORT = '5176'` in PowerShell). The scripts stop their servers on every exit, even
when they crash.

These files used to live in a temporary folder, which Windows Storage Sense emptied. They were rebuilt from
the session history on 2026-11-13 and now live here, in git.
