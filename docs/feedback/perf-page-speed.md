# Feedback log: `perf/page-speed`

Owner request, 2026-11-04: page speed on phones, next after the build scripts. Plan, decisions and results:
[page-speed.md](../page-speed.md).

## Round 0: what was built

- **Prerendering:** at build time, Home, Ritucharya, Articles, Terms and Privacy are rendered to HTML and put in
  each page's file; the browser hydrates it. No new packages.
- **Hydration-safe components:** one clock (`useNow`) that uses the build time until hydration; the season strip,
  Home's season card, Ritucharya and the footer year use it. Saved place, reduced motion and the Ritucharya
  address are read after hydration. The theme switcher shows the theme through CSS.
- **No inline styles** in prerendered pages: the logo size and theme swatches are CSS classes.
- **Start-up:** `startApp()` hydrates a page built for this address, and starts empty otherwise;
  `theme-init.js` hides a page built for another address before first paint; `app.html` is an empty fallback.
- **API:** the article template has the prerendered HTML taken out.
- **Preview:** `vite preview` serves each page at its own address and sends the recommended CSP.

## Feedback → change

| Feedback from | Problem | Reason | Fix |
|---|---|---|---|
| Measurement (trace) | Phones saw a blank page for 2–2.6 s | Nothing could paint until the whole app had downloaded, run and laid out | Prerender the public pages |
| Measurement | Compression and fonts looked like suspects | Files were already compressed; fonts loaded after first paint | Left alone; measured instead of guessed |
| Measurement | Small CSS changes didn't help | Each moved Home less than the 200–400 ms the page varies by between runs | Dropped (`content-visibility`, `optimizeLegibility`) |
| Design check | The CSP blocks inline `style` attributes | React does not reapply them after hydration, so they would stay broken | Logo and swatches use classes; the build refuses `style="` |
| Design check | `/signin` would show Home's text from a host's fallback | Hosts answer unknown addresses with `index.html`, now Home's page | A path marker, hidden before paint by `theme-init.js`; `app.html` |
| Design check | Article pages would lose their `<noscript>` text | The API looks for an empty `<div id="root">`, which is now filled | The API empties the root first |
| Build | `siteOrigin()` would crash while prerendering | It read `window`, which does not exist at build time | Falls back when there is no window |
| Type check | Three `dataset.x` reads were refused | The strict settings require `dataset['x']` | Changed |
| Lint | An empty function, and `new Function` in a test | The rules forbid both | `() => undefined`; the test runs the script with `vm` |
| Unit test | The theme test found four "Kesar" buttons | The toggle now holds every theme and CSS hides three; tests skip CSS | The test loads the real CSS (and now checks the accessible name) |
| Hydration test | "Router inside another Router" | React's development build leaves a context set after prerendering, in the same process | The test renders with a separate production server build, as the real build does |
| Hydration test | Pages showed the loading spinner, content hidden | React moved large sections to the end with an inline script, which the CSP blocks | `progressiveChunkSize: Infinity`; the build refuses inline scripts and unfinished sections |
| Hydration test | No "My path" after signing in | The fake API had no `GET /auth/csrf` | Added to the test |
| Measurement | Ritucharya measured Home's page | `vite preview` serves `ritucharya/index.html` only for `/ritucharya/` | The preview maps each page's address, like a real host |
| Measurement | Ritucharya's content vanished for a second, LCP 3.3 s | Its code was still loading when the sign-in check updated the page, so React threw the HTML away, silently | The page links its code and CSS; the browser loads the code before hydrating; the test checks the heading is the same element |
| Measurement | Desktop text moved 3 px (CLS 0.067) | The page now paints before the fonts arrive, then they swap in | The two main fonts are preloaded: CLS 0 |

## Test results

| Stage | Result |
|---|---|
| Build + unit + integration | Frontend 407 passed (24 new); backend 430 passed, 4 skipped; types clean; 0 audit findings; bundle within budget |
| Page speed | Phone (Slow 4G): Home LCP 1.7 s, Ritucharya 2.1 s (Hindi 1.9 s), Articles 1.4 s, CLS 0.023 or lower. See [page-speed.md](../page-speed.md) |
| Load | First run: 3 scenarios over the 3 s p99 line while the computer was busy (every scenario at about half its usual speed, including ones this change does not touch). Rerun on a quiet machine: 14 of 14 passed, 0 errors; the crawler page at 351 requests/s, as before |
| Security | 72 backend + 16 frontend passed |
| Live check | 34 of 34 (12 new), with the recommended CSP: pages readable without JavaScript, hydrated without being rebuilt, `/signin` never shows Home's text, no console or CSP errors |
| Regression | 35 of 35 Edge steps passed |
