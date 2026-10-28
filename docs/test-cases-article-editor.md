# Test cases: article editor, reader pages and Ritucharya Hindi

Branch `feature/article-editor`. Each case lists where it is checked automatically. Run them with
`npm test` in `frontend/` (unit only: `npx vitest run tests/unit`). The last section is for checking by hand.

Files: **U-auto** `tests/unit/autosave.test.ts`, **U-api** `tests/unit/readerApi.test.ts`,
**U-ritu** `tests/unit/ritu.test.ts`, **U-doc** `tests/unit/articleContract.test.ts`,
**U-auth** `tests/unit/authLogic.test.ts`, **I-ed** `tests/integration/articleBodyEditor.test.tsx`,
**I-art** `tests/integration/articles.test.tsx`, **I-ritu** `tests/integration/ritucharya.test.tsx`,
**E2E** browser journey (Edge, test database), **I-sec** `tests/integration/articleSecurity.test.tsx`.

## 1. Autosave (unit)

| ID | Case | Expected | Test |
|---|---|---|---|
| AS-01 | Type three changes quickly | One save, 3 s after the last change; the next save uses the new version | U-auto |
| AS-02 | Any change | A copy is kept in this browser at once and removed once the server has it | U-auto |
| AS-03 | Someone else saved first (409) | Autosave stops and says who saved; nothing is overwritten | U-auto |
| AS-04 | Typing after a conflict | Still kept in this browser; never sent | U-auto |
| AS-05 | Article was deleted (410) | Autosave stops; "was deleted" message | U-auto |
| AS-06 | Network failure | Retries after 2 s, 4 s, …, then saves | U-auto |
| AS-07 | Server rate limit (429 + Retry-After 10) | Waits exactly 10 s, then saves | U-auto |
| AS-08 | Server refuses the draft (400) | Doesn't resend it; the next edit is saved | U-auto |
| AS-09 | Flush before publishing, save works | Returns the newest version | U-auto |
| AS-10 | Flush before publishing, save fails | Returns null, so publishing stops | U-auto |
| AS-11 | Reset after a reload | Starts from the new version; anything pending is dropped | U-auto |
| AS-12 | Leaving the page | Browser asks only while something is unsaved | U-auto |
| AS-13 | Damaged browser copy | Ignored, no crash | U-auto |
| AS-14 | Status line | Plain words for every state (Saved · time, Saving…, errors) | U-auto |

## 2. Reader API (unit)

| ID | Case | Expected | Test |
|---|---|---|---|
| RA-01 | Visitor never signed in | Asks anonymously, no sign-in check | U-api |
| RA-02 | Signed-in reader | Sends the token (members articles in full) | U-api |
| RA-03 | Session expired | Falls back to the anonymous view | U-api |
| RA-04 | Server error (503) for a signed-in reader | Shown as an error, not "sign in to read" | U-api |
| RA-05 | Article doesn't exist | 404 shown; asked only once | U-api |
| RA-06 | Sign-out | Unsaved drafts kept in the browser are deleted; other settings stay | U-auth |

## 3. Document safety (unit)

| ID | Case | Expected | Test |
|---|---|---|---|
| DOC-01 | Editor output | Trimmed so the server's own validator accepts it | U-doc |
| DOC-02 | Unknown blocks (code, strike) | Removed | U-doc |
| DOC-03 | Links | Only https and mailto; `javascript:` and passwords in links refused | U-doc |
| DOC-04 | Not a document | Becomes an empty document | U-doc |

## 4. Ritucharya (unit + page)

| ID | Case | Expected | Test |
|---|---|---|---|
| RC-01 | Date → ritu | Right ritu on boundary dates, across the new year | U-ritu |
| RC-02 | Ritusandhi | 7 days either side of a change | U-ritu |
| RC-03 | Sunrise/sunset | London within 2 min; New Delhi plausible; Tromsø winter has none | U-ritu |
| RC-04 | Six ritus | In order; looking up an unknown one throws | U-ritu |
| RC-05 | Home page names | Same as the full guide | U-ritu |
| RC-06 | Hindi guide | Every ritu complete, in Devanagari, with the medical note | U-ritu |
| RC-07 | Sources | Every source cited is in the list | U-ritu |
| RC-08 | हिन्दी button | Shows the Hindi guide; the choice stays when changing ritu | I-ritu |

## 5. Editor and admin pages (integration)

| ID | Case | Expected | Test |
|---|---|---|---|
| ED-01 | Headings, bold, italic, lists, quote, undo/redo | Server accepts the result | I-ed |
| ED-02 | Callout and divider | Added, tone changed, removed | I-ed |
| ED-03 | Sanskrit verse | Asks for Devanagari; shows the source | I-ed |
| ED-04 | Library image | Inserted, selected, alt/caption/size edited | I-ed |
| ED-05 | Unsafe web link | Refused with a clear reason; safe link applied | I-ed |
| ED-06 | Link to an article / "Also read" card | Chosen by search; draft warning shown | I-ed |
| AD-01 | Create an article | Title checked; opens the editor | I-art |
| AD-02 | Autosave in the page | Whole draft sent with its version; checklist shown | I-art |
| AD-03 | Publish refused | Every problem listed | I-art |
| AD-04 | Unpublish a linked-to article | Asks first, focus on "Keep it" | I-art |
| AD-05 | Restore the browser copy | Text comes back **and is saved to the server** | I-art |
| AD-06 | Browser copy older than the server's | Warns; offers "Restore anyway" and "Keep as a new article" | I-art |
| AD-07 | History fails to load or save | Says why | I-art |
| AD-08 | Publish with unsaved typing | Saves at once, then publishes with the newest version | I-art |
| AD-09 | Publish while the save is failing | Stops with "Your latest changes aren’t saved yet"; nothing published | I-art |
| AD-10 | Conflict → Load their version | Newest copy loaded; my text still offered, with the older-version warning | I-art |
| AD-11 | Delete | Asks first, deletes, back to the list with a message | I-art |
| RD-01 | Article list | Filters by condition, loads more | I-art |
| RD-02 | Article page | Headings, safe links, callouts, verse, related, disclaimer | I-art |
| RD-03 | Members article, signed out | Teaser with sign-in links | I-art |
| RD-04 | Old address | Redirects to the new one; missing article explained | I-art |

## 6. End to end (browser, test database)

| ID | Case | Expected |
|---|---|---|
| E2E-01 | Admin creates an article, writes, autosaves, publishes | "Published" shown |
| E2E-02 | Reader opens it | Title and text visible |
| E2E-03 | Article list | The new article is listed |

## 7. Security

| ID | Case | Expected | Test |
|---|---|---|---|
| SEC-01 | `<script>` or `<img onerror>` typed into article text | Shown as plain text; nothing runs | I-sec |
| SEC-02 | Script, iframe or raw-HTML blocks in an article | Not shown at all | I-sec |
| SEC-03 | Event handlers, styles, `javascript:` in any attribute | None reach the page | I-sec |
| SEC-04 | Links: javascript (any spelling), data, vbscript, //host, http, user:password | Shown as words, not links; only https and mailto become links, opened safely | I-sec |
| SEC-05 | Image address written in the article | Ignored; images load only from our own API | I-sec |
| SEC-06 | `__proto__` / `constructor` as ids | Ignored; no prototype tricks | I-sec |
| SEC-07 | Damaged or deeply nested document | No crash; good blocks still show | I-sec |
| SEC-08 | Card placeholder that isn't our own tiny image | Ignored | I-sec |
| SEC-09 | Signed-in member opens the editor address | Admin sign-in shown; no article data requested | I-sec |
| SEC-10 | Backend attack suite (floods, oversized/malformed requests, smuggling, CSRF, brute force) | All blocked | backend `tests/security` |
| SEC-11 | Known vulnerabilities in packages the site runs on | None (frontend and backend) | `npm run audit:prod` |
| SEC-12 | Secrets in changed files | None | `scripts/check-staged-secrets.js` |

## 8. Check by hand (owner)

1. Admin → Articles → New article. Type a title and create it.
2. Write a few lines, add a heading, an image and a callout. Wait for "Saved · time".
3. Close the tab while it says "Unsaved changes…", open the article again → **Restore them** → it should say "Saved" a few seconds later.
4. Publish → open `/articles/<address>` in a private window.
5. Ritucharya → हिन्दी → change ritu → the Hindi text stays.
6. Check on a phone-width window and in all four themes.

Last run (2026-10-29): frontend 255 tests passed (145 unit, 110 integration); backend 11 integration, 126 database and 32 attack tests passed; 0 known vulnerabilities.
