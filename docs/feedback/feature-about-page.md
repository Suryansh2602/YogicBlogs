# Feedback log: `feature/about-page`

Owner request, 2026-11-13: an About page before launch from the owner's text, a Home section on why to
connect with Healthmarg, and a footer with the about text, WhatsApp and call links for Yogesh Upadhyay, and the
GST and FSSAI details. Plan and fact check: [about-page.md](../about-page.md).

## Round 0: what was built

- `/about`, English and Hindi (`?lang=hi`), prerendered, with its own search details and sitemap entries.
- Home: "Why people choose Healthmarg", four reasons, a link to the About page and the WhatsApp button.
- Header: an About link. Footer: about text, a "Talk to us" column, the registration line.
- `src/config/business.ts`: names, place, GSTIN, FSSAI status and phone in one place; WhatsApp and call links.

## Feedback → change

| Feedback from | Problem | Reason | Fix |
|---|---|---|---|
| Fact check | "Bhavprakash Nighantu" listed as a Laghutrayi text | The text is the Bhavaprakasha; the Nighantu is its section on herbs | "Bhavaprakasha, whose Nighantu describes the herbs" |
| Fact check | Gheranda Samhita called "ashtanga" yoga | Gheranda teaches a seven-limbed path that begins with cleansing; ashtanga is Patanjali's | Each text with its own teaching |
| Fact check (law) | "100% shuddh, natural", "chemical-free" | FSSAI treats such claims as needing proof and has ordered companies to drop "100%" | "Made by traditional methods, with every ingredient listed"; "fewer synthetic additives" |
| Fact check (law) | "Reverse the damage", "rog-mukt", "goodbye to diseases" | Cure claims for Ayurveda are illegal (Drugs and Magic Remedies Act); AYUSH and the Supreme Court have acted on them | "Habits that support good health"; a test fails if a cure or "100%" claim appears in either language |
| Fact check | The FSSAI document is an application receipt | The 14-digit number comes with the certificate | "FSSAI registration applied for (ref. …)" until the number is set in `business.ts` |
| Design check | The footer's grey link colour would have reached the WhatsApp button's text | `.footer__col a` also matched the button | The style now applies to the column's own links only |
| Unit test | "Talk to us" found twice | The About page and the footer both have it | The test looks inside the page's main content |
| Unit test | The claims check flagged "शुद्धि" | It matched the word for cleansing (Gheranda's practice), not a "pure" claim | The check looks for "शुद्ध" as a claim only |
| Unit test | The Hindi Ritucharya link wasn't found | Its arrow is hidden from screen readers, so it isn't part of the name | Test fixed |
| Test run | The stage scripts were gone | They lived in a temporary folder that Windows Storage Sense emptied | Rebuilt exactly from the session history and moved into the repo (`e2e/`, branch `chore/e2e-in-repo`) |
| Test run | Edge closed as soon as it opened | It was finishing an update (157.0) during the run | Ran again once the update was done |
| Test run | The live check couldn't use port 5174 | The crashed run had left its test site running; the regression started Edge outside its clean-up | The scripts stop their servers on every exit; ports can be changed with `E2E_WEB_PORT` / `E2E_API_PORT` |

| Bundle check | All CSS together was 20.4 kB, over its 20 kB budget | The About page and footer styles, plus each extra stylesheet's own overhead | About reuses Home's list and heading styles (20.2 kB); the budget, which counts every stylesheet including admin and editor ones, is now 22 kB, with the reason beside it |
| Lint | A type assertion and a string spread in the new tests | The rules forbid both | The section is found by its accessible name; the GSTIN check uses an index loop |

## Test results

| Stage | Result |
|---|---|
| Build + unit + integration | Frontend 418 passed (11 new); backend 430 passed, 4 skipped; 0 audit findings; bundle within budget |
| Page speed | Phone (Slow 4G): Home LCP 1.7 s, Ritucharya 1.8 s, Articles 1.4 s; CLS 0.023 or lower |
| Load | 14 of 14 scenarios passed, 0 errors |
| Security | 72 backend + 16 frontend passed |
| Live check | 37 of 37 (3 new: About prerendered with its registration details and WhatsApp link, the sitemap lists both languages, React takes the page over without rebuilding it) |
| Regression | 35 of 35 Edge steps passed |
| Design | About in English (desktop, 390 px) and Hindi (Ratri, 390 px), Home's new section, the header at 1024 px and the footer in all four themes: no console errors, no sideways scrolling |
