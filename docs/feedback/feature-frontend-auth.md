# Feedback log: `feature/frontend-auth`

Owner request (2026-10-25): design the frontend from the logo. It should be modern and animated without losing the traditional, cultural feel, with components in the style of ReactBits, multiple themes, and no slowdown. Sign in and sign up should work end to end, members land on their dashboard, and `/admin` leads to the admin sign-in and panel.

## Round 0: what was built

- **Design system:**
  - Four themes: Ushas, Ratri, Kesar, Vana. The default follows the device's light or dark setting, and the choice is remembered.
  - Logo colours follow the theme.
  - Fraunces, DM Sans and Tiro Devanagari fonts.
  - Mandala and lotus motifs, a rangoli-style ornament, Sanskrit verses with transliteration and our own translations (all public-domain texts).
- **Motion:** blur-in text, a shimmer sweep, spotlight cards, an aurora glow, a slowly turning mandala, a self-drawing logo, a blooming lotus and a breathing loader. These are written in-house in the style of ReactBits, CSS only, with no animation library. "Reduce motion" turns them off.
- **Pages:**
  - Home.
  - Sign-up (validation that mirrors the server, a strength meter, consent).
  - Sign-in (2FA step, backup-code option, resend for unverified emails).
  - Check email, verify email (single request; token removed from the URL), forgot and reset password.
  - Member dashboard: time-of-day Sanskrit greeting, daily sutra, path tracker, profile edit, turning on 2FA, sign out everywhere.
  - `/admin`: sign-in, forced 2FA enrolment with backup codes, overview stats, members (search, pages), audit log (filters).
  - `/admin/setup`, and placeholders for the legal pages.

## Round 1: review, browser QA and tests

| Source | Finding | Change |
|---|---|---|
| Browser QA | "modern ease" was invisible: the clipped-text shimmer breaks when the inner words have their own blur layers | The shimmering phrase rises in instead of blurring |
| Browser QA | Mandala petals were clipped into a square (they reach past the SVG's drawing area) | viewBox widened from 340 to 390 |
| Browser QA | Phone header: "Sign in" and "Join free" wrapped onto two lines, and the logo shrank | No-wrap buttons and links, logo size set by a CSS variable, tighter mobile gutter |
| Browser QA | The aurora glow ended in a hard line at the hero's edge | Mask fade at the bottom |
| Browser QA | Every signed-out visitor made a failing `POST /auth/refresh` (401) on each page load | A non-secret "was signed in" hint: new visitors make no API call at all |
| Browser QA | The audit log showed the first 8 characters of UUIDv7 IDs, which are timestamps, so every account looked identical | The API returns `actorEmail` (one extra query; deleted accounts included); the UI shows the email or "Not signed in" |
| Tests | "Sign out" on the dashboard landed on the sign-in page (the page guard reacted before the redirect home) | Navigate home first, then sign out |
| Review | `<Link viewTransition>` and React's `FormEvent` are deprecated in the newest React Router / React types | Removed; form handlers use `SubmitEvent` |
| Review | Contexts and lazy pages in component files break fast refresh | Moved to their own modules |
| Review | `useAdminData` set state synchronously inside an effect (React rule) | Results are stored with the inputs they belong to; stale responses can't overwrite newer ones |
| Review | The legal placeholder promised data export and deletion, which aren't built or decided | Reduced to "being finalised" plus the medical disclaimer |
| Performance | msw and zod were installed but not needed in the browser | Removed from the frontend |
| Performance | No guard against the bundle growing | `check:bundle` budget in `qa` |

## Round 2: QA results

- **Unit and integration:** 65 tests, mocked API, the real app and routes. They cover single-flight refresh, the two-tab race, CSRF renewal, the retry after expiry, every page flow, guards and open-redirect protection.
- **Real-browser end-to-end** (Edge, against an isolated API on the test database): **16/16 steps passed with no console errors.** The run:
  1. Sign up → verify by the emailed link → sign in → dashboard → reload stays signed in.
  2. Turn on 2FA → backup codes → sign out → sign in with a backup code.
  3. A member visiting `/admin` sees only the sign-in → theme switch.
  4. Admin setup → forced 2FA → panel → members → audit filters.
- **Bundle:** first-load JS is 100.6 kB gzip (React and the router account for about 99 kB). Pages are 1–3 kB each and all CSS is 9.6 kB.

## Open

- Owner: create the first admin at `/admin/setup` with the code from the API terminal.
- Later: a reCAPTCHA v3 site key (`VITE_RECAPTCHA_SITE_KEY`); CSP header on the static host; making the Playwright E2E a permanent suite (it runs from a scratch folder today).

## Round 3: owner feedback

> "The error messages should disappear when the user starts typing, and say what the user did wrong."

| Feedback | Change |
|---|---|
| Messages linger after the person starts fixing the field | A shared `useFormErrors` hook on every form: editing a field clears that field's message and the form-level banner. This covers sign-up, sign-in, admin sign-in, forgot and reset password, admin setup, profile name and the 2FA code boxes. |
| Messages were generic ("Enter a valid email address", "Use at least 12 characters") | Exact reasons, in the same words on the frontend and the server, never repeating the password. Examples: "Your password has 8 characters. Use at least 12.", "Your email address is missing the “@”…", "“gmail” isn’t a complete domain…", "This password has appeared 21,613 times in leaked password lists…", "That code didn’t match… 3 tries left." |
| Lockouts said "for a little while" | The API exposes `Retry-After` to the browser, so the page says "Try again in about 15 minutes, or reset your password". |
| A server-rejected field showed the same message twice (banner and field) | Field problems appear only under the field; the banner is for everything else. |
| Disabled "Sign in" buttons couldn't explain what was missing | The buttons stay enabled; submitting with empty fields says "Enter your email address." / "Enter your password." without calling the API. |

Kept generic on purpose: a failed sign-in never says whether the email or the password was wrong. Saying either would let anyone test which emails have accounts.

QA: backend 190 tests (94.4% merged coverage); frontend 71 tests (91.3%); 0 vulnerabilities; bundle within budget. On the live API: a bad domain, a short password and a breached password (21,613 times) each produced the exact message.

Locally, emails are files: open the newest one in `backend/.local/outbox/` (Explorer, or `Get-ChildItem E:\YogicBlog\backend\.local\outbox | Sort-Object LastWriteTime | Select-Object -Last 1 | Invoke-Item` in PowerShell).

## Round 4: owner feedback ("read the logs, solve it" + "remove the email feature for now")

| Source | Finding | Change |
|---|---|---|
| Dev-server log | `page reload coverage/...html`, hundreds of times: every test run wrote its coverage report inside `frontend/`, Vite treated it as code and reloaded the owner's open tab | `server.watch.ignored` for `coverage/` and `dist/` |
| API log | `does not provide an export named 'isBreachedPassword'`: watch mode restarted mid-edit while the function was being renamed | Transient (recovered on the next restart). The API was healthy when checked |
| API log | The owner's confirmation email was waiting in the outbox, and opening local email files was awkward | Superseded by the next row |
| Owner | "Remove the email feature for now, we'll do it later" | Switched off, not deleted: `EMAIL_ENABLED=false` (API) and `VITE_FEATURE_EMAIL=false` (site). Sign-up now signs people straight in (`201`), a duplicate gets `409 EMAIL_TAKEN` under the email field, sign-in no longer needs a confirmed email, the email routes and pages don't exist (404), and no emails are sent. The finished, tested email code comes back by switching both flags on |

Trade-off accepted while email is off: sign-up reveals whether an email is registered. The strict rate limit slows down probing.

### Independent review of the email switch (ultracode workflow: 3 reviewers + 1 skeptic per finding)

12 findings raised: **4 confirmed**, 8 refuted on reading the code.

| Confirmed finding | Fix |
|---|---|
| **[medium]** With email off, someone can register *another person's* address and turn on 2FA. When email returns, the owner's password reset kept that 2FA, so the owner was locked out for good, with no route to remove it | A password reset on an account whose email was never confirmed now **removes any 2FA and backup codes** set up before that first proof of ownership, and audits it as `auth.2fa.cleared_unproven`. The DB test reproduces the attack, and removing the fix makes it fail |
| **[low]** The lockout message said "or reset your password", which doesn't exist while email is off | That clause is shown only when email is on |
| **[low]** The admin members list labelled every member "Unverified" (nobody can confirm while email is off) | Status shows Active or Suspended. "Email not confirmed" and the "Verified" stat appear only while email is on |
| **[low]** No test exercised the "send nothing" guard in `sendMail` | A unit test loads the mailer with the switch off; removing the guard makes it fail |

Results:
- **Backend QA:** 201 tests, 94.3% merged coverage.
- **Frontend QA:** 80 tests, 91.3% coverage.
- **Vulnerabilities:** 0.
- **Real browser, email off:** 18/18 steps, no console errors.
- **Dev server:** no more coverage-triggered reloads since the config fix.

## Round 5: owner feedback ("hover text invisible, too glowy; make it engaging, clean, readable" + "a little mystic essence")

| Source | Finding | Change |
|---|---|---|
| Owner, reproduced in screenshots | Hovering "Begin free" / "Join free" made the label vanish | Cause: the global `a:hover` colour also applied to link-buttons, turning the text the same colour as the button. Plain-link rules are now `:where(a:not(.btn))`, and button text colour is set for every state |
| Owner | Too glowy | Removed the button glow and sheen (now a clean lift plus a sliding arrow). Aurora at about half strength, quieter mandala, card hover is a lift with a tinted edge (no wash), the sutra card has a crisp gold edge (no haze). The hidden skip-link's shadow, which had smudged the top-left corner, is gone |
| New test | WCAG contrast had never been checked | `themeContrast.test.ts` checks 17 text pairs × 4 themes. It found 5 failures on its first run (links 4.42:1, pink/saffron accents 2.9/2.4:1, two success greens); all fixed |
| Visual review panel (3 reviewers + judge, 8 kept) | Gold small text 1.9:1 on light themes; cards never lifted (the entrance animation pinned `transform`); disabled buttons washed out; OTP boxes overflowed the card (clipped at 390px); sutra-card haze; mobile sign-in floated mid-screen; unstyled Ratri checkbox; faded "Soon" link and a stranded stat card | All fixed: `--gold-text` per theme (≥ 5:1), `backwards` animation fill, readable disabled states, shrinking OTP boxes, gold top edge, top-aligned mobile form, a styled checkbox, a 5-across stat grid. Also fixed: pressed-button feedback was being overridden |
| Owner | "A little mystic essence" | **Nakshatra** (64 tiny stars twinkling by opacity), **Yantra** (shatkona in a circle with a bindu, turning slowly and breathing about 6 times a minute) behind the lotus, an **ॐ** watermark behind the sutra band, and **॥ … ॥** danda marks. Fine lines and slow motion only: no glow, and nothing over text |
| Browser runs (intermittent) | Opening a page right after another sometimes **signed the user out** | Measured with request logs: an aborted page load made the session restore reject, which erased the "was signed in" hint, so the next page didn't even try. Only a definite 401 now forgets the session; network errors and aborts keep it |
| Browser runs | A reload during a refresh could leave the browser holding a just-rotated token (the reply was lost) | A 10 s **refresh reuse interval**: the just-rotated token is exchanged once more for a sibling token in the same session, never after sign-out, password reset or theft. Tested, including "a signed-out session is never revived" |
| Browser runs | Turning on 2FA sometimes failed with a wrong code | Two `POST /2fa/setup` fired at once (effects run twice); the second secret replaced the QR's. The panel now requests setup once per opening. Page tests render in StrictMode like the app, so effects that aren't safe to repeat get caught |

Every fix above was mutation-checked: removing it makes its test fail.

Results:
- **Backend QA:** 202 tests, 94.3% coverage.
- **Frontend QA:** 150 tests, 91.6% coverage.
- **Vulnerabilities:** 0.
- **Bundle:** within budget.
- **Real browser:** 6 runs in a row, all 18 steps each, no console errors.
