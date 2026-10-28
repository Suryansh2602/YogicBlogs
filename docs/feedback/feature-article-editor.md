# Feedback log: `feature/article-editor`

Owner request, 2026-10-27: "create a tab when admin clicks on it he/she can write and design articles that
will be visible to the users", plus the Hindi translation of Ritucharya from the owner's own guide
(2026-10-28). Design: [editor-and-reader.md](../editor-and-reader.md), API: [articles.md](../articles.md).
Test cases: [test-cases-article-editor.md](../test-cases-article-editor.md).

## Round 0: what was built

- **Admin → Articles (लेख):** list with status, search and filters; "New article" (title + condition).
- **Editor:**
  - card and thumbnail designer (title, short description, web address, condition, members/public, language, accent colour, cover with focal point);
  - TipTap 3 body (headings, bold/italic, lists, quote, callouts, Sanskrit verse, dividers, library images with alt/caption/size, web links and links to other articles, "Also read" cards, undo/redo);
  - related articles, SEO fields;
  - publish checklist (blocking problems and warnings);
  - preview, publish, unpublish, archive, delete, discard changes;
  - history (save a revision, restore one).
- **Autosave:**
  - 3 s after the last change, sent with the version it was based on, so nothing is ever overwritten silently;
  - retries with growing pauses and honours the server's Retry-After;
  - a crash copy is kept in the browser until the server has the change;
  - conflict and deleted-article handling ("Load their version", "Keep mine as a new article").
- **Reader:** `/articles` (condition filter, search, load more) and `/articles/:slug`, rendered by React components from the allow-listed JSON (no HTML strings), with members teaser, old-address redirects, related articles and the medical disclaimer. Reader pages never load editor code.
- **Ritucharya in Hindi:** English / हिन्दी switch (`?lang=hi`), the owner's guide for all six ritus, the ritusandhi rule and the medical note in Hindi.

## Review (2 reviewers + verifier): 8 findings, all fixed

| # | Problem (simple words) | Reason | Fix |
|---|---|---|---|
| 1 | "Restore them" brought the unsaved text back on screen, but **never saved it**; the next Publish published the older text | Restoring restarted the editor, and the restart cancelled the save that had just been scheduled | The restarted editor is told the text is unsaved and saves it at once (test AD-05) |
| 2 | A browser copy made **before someone else's save** could silently overwrite their newer work | The copy's version was stored but never compared | If the versions differ, a warning is shown with "Restore them anyway" and "Keep them as a new article" (AD-06) |
| 3 | **Publish/Preview went ahead even when the latest save had failed**, publishing older text and saying "published" | `flush()` returned the old version whether the save worked or not | `flush()` now returns nothing when the save failed; publish, preview, delete, history and restore stop with "Your latest changes aren't saved yet" (AS-10, AD-09) |
| 4 | "Load their version" **deleted my unsaved text**, though the message said it was kept | The reload cleared the browser copy | The copy is kept and offered again after loading (AD-10) |
| 5 | Typing after a conflict or deletion **wasn't kept** anywhere | Autosave stopped before writing the browser copy | The browser copy is still updated; only sending stops (AS-04) |
| 6 | A signed-in member saw "**sign in to read**" when the server simply had an error | Every failure fell back to the anonymous view | Only an expired/missing session falls back; other errors show the error page (RA-03, RA-04) |
| 7 | Unsaved drafts stayed in the browser **after sign-out** (shared computers) | Nothing removed them | Sign-out deletes all `hm-draft-*` copies (RA-06) |
| 8 | History buttons failed **silently** | No error handling | They show the reason (AD-07) |

## Errors found while building (each fixed)

| Problem | Reason | Fix |
|---|---|---|
| Notices ("Published", …) vanished right after an action | The editor restarts after each action and the message was set on the old one | The message is carried into the restarted editor |
| Typing in an image caption jumped the cursor back into the text | Each attribute update focused the editor | Attribute updates no longer move focus; inserted images are selected so their settings open |
| Home page bundle 115.7 kB (limit 115) | The Today panel imported the whole Ritucharya guide for six names | Names moved to `names.ts`; entry now 106 kB |
| A formatting command reformatted the editor page in a foreign style | The project doesn't use Prettier; its defaults (double quotes, short lines) were applied | Re-formatted to the house style; no logic changed |
| Function coverage 79.97% (limit 80%) | New error handlers had no tests | Tests added, not the limit lowered (now 82%) |
| A conflict test failed | In test mode the page loads twice, and the fake server already served "their" copy on the second load | The fake server serves it only after the conflict really happens |
| Two security checks reported "unexpected" drawings and admin requests | They were the site's own decorations and the sign-in page's public "is there an admin yet?" check | Checks now test what matters (drawings decorative only; no article data requested) |
| **A damaged article document crashed the whole reader page** (found by the new security tests) | The renderer assumed well-formed JSON | Each block is guarded; a broken block is skipped and the rest still shows (SEC-07) |
| The speed test waited forever for the preview server | Its "ready" line has colour codes in the middle of the word | Matches a simpler word |
| A type-check ran in the wrong folder and fetched an unrelated `tsc` package into the npx cache | Two commands run in parallel, one changed folder | Re-run in the right folder; project untouched; such checks now run one at a time |

## Tests (final regression, 2026-10-29)

- **Frontend:** 255 tests (145 unit, 110 integration incl. 9 security). Coverage 86.8 / 80.2 / 82.4 / 88.3 (statements / branches / functions / lines). Bundle within budget. 0 vulnerabilities.
- **Backend:** 351 tests (+4 skipped by design), merged coverage 93.0 / 84.5 / 94.2 / 95.5. 0 vulnerabilities.
- **Browser journey (Edge, test database):** 34 / 34 steps pass, sign-up to publishing and reading an article.

## Load and speed

- **Load test:** 10 / 12 scenarios pass; 0 errors and 0 timeouts in all. The uncached article page and list at 500 simultaneous users: slowest 1% 3.5 s (limit 3 s). Same as the articles-API branch; locally there is no Redis cache and the laptop is slower than a server (baseline 1465 req/s). **Not loosened.** Re-run on the production server with Redis before launch.
- **Page speed (production build, Edge, cold):** content visible in 0.7–1.1 s on this machine; on an emulated phone on slow 4G: articles 1.7–2.3 s, Ritucharya 2.3–2.4 s, **home 2.8–3.0 s and layout shift 0.17** (Google "good": ≤ 2.5 s, ≤ 0.1).

## Open

- Home page on slow phones: reserve space for the Today panel and paint the main content sooner (owner to decide).
- Load test on the production server with Redis.
- Raghvendra (`raghvendrapratap1`) to be added as a reviewer: needs the GitHub CLI or the owner adding them in GitHub settings.
