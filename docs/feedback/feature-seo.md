# Feedback log: `feature/seo`

Owner request, 2026-11-01: "Do the SEO (Search Engine Optimisations) also". Plan and decisions: [seo.md](../seo.md).

## Round 0: what was built

- **Every page has its own head:** title, description, canonical address and link preview, from one hook, `useSeo`.
- **Private pages are `noindex`:** sign-in, dashboard, admin, password reset, error pages and unknown addresses.
- **Build step:** `robots.txt` with the sitemap line, and copies of `index.html` with the right head for Articles, Ritucharya, Terms and Privacy.
- **Structured data:** `Organization` and `WebSite` on Home; `Article` and `BreadcrumbList` on articles, with paywall markup for members articles.
- **Ritucharya:** each season has its own title and description, in English and Hindi, linked with `hreflang`, and the page language follows.
- **Server:** `/sitemap.xml`, and `/articles/:slug` with the real head and the text in `<noscript>`.
- **Honest status codes:** `301` from old addresses, `404` for missing articles, `503` when the database is down.
- **Images:** a 1200×630 preview image and a phone icon.

## Feedback → change

| Feedback from | Problem | Reason | Fix |
|---|---|---|---|
| Google's guidance | A bot-only page was the obvious shortcut | Google calls dynamic rendering a deprecated workaround | One page for everyone; the text is added in `<noscript>` |
| Design check | React's own `<title>` would not have worked | It lands after the title in `index.html`, and browsers use the first | One hook updates the existing tags in place |
| Design check | A canonical in the root `index.html` would be wrong | That file also answers every other address, such as `/signin` | Only the page copies carry one; Home gets its canonical in the browser |
| Design check | `robots.txt` blocking private pages would backfire | A blocked crawler never sees the `noindex` | Nothing is blocked; private pages use `noindex` |
| Design check | A proxy rule for `/articles/*` could loop | Static hosts send `/articles` to `/articles/`, which the rule would catch | The rule needs at least one character after the slash |
| Security review | Article text goes into raw HTML | A title containing `</script>` could become code | Everything is escaped, and `<` is escaped inside JSON-LD; tested with hostile titles |
| Security review | `$&` in a title could scramble the page | JavaScript's `replace` treats `$` patterns as commands | Every replacement uses a function |
| Fact check | Claiming a reviewer would help ranking but is untrue | No reviewer is shown on the site | No `reviewedBy`; the organisation is the author |
| Unit test | The settings stub crashed the test file | The real settings object is frozen | The test stubs a copy |
| Build output | A new Vite warning about an import | Vite's future loader needs the file extension | Added `.ts`, and allowed it in `tsconfig.json` |

## Test results

| Stage | Result |
|---|---|
| Unit + integration | Frontend 366 passed; backend 418 passed, 4 skipped; types clean; 0 audit findings; bundle within budget |
| Page speed | Slow 4G: Home LCP 2328 ms, article LCP 2628 ms, CLS 0.002 or lower on both |
| Load | 14 scenarios, 0 errors, 0 timeouts. Crawler page 350 requests/s uncached at 500 connections; sitemap 3075 requests/s |
| Security | 70 backend + 16 frontend passed: hostile titles and addresses, no leaked paths or database errors |
| Live check | 22 of 22 on the production build, real API, test database and Edge, including with JavaScript off |
| Regression | 35 of 35 Edge steps passed |

**Not done yet:**
- Nothing here has met a real search engine: there is no domain yet, so Search Console and the Rich Results Test wait for launch.
- Season tabs are buttons, so crawlers find those pages through the sitemap only.
- Static pages other than articles send their head but not their text without JavaScript.
- Terms and Privacy are placeholders until the legal texts arrive.
