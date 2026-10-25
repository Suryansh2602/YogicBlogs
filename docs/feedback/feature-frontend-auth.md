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
