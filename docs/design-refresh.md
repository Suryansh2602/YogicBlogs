# Design refresh: professional, readable, clean

Branch `feature/season-strip-polish`, owner requests of 2026-10-29:
- "I do not like this today tab": replace it with a moving strip under the nav bar, coloured by the ritu.
- "I want the website to look professional … readable and clean".
- The Ritucharya page "looks unprofessional … like someone placed random boxes on the pages".
- "I want proper navigation".
- "Take references from the best blogging websites" ([detailed.com/50](https://detailed.com/50/)).

## What the reference sites have in common

From the list, the closest to a health and learning site are Men's Health, Harvard Business Review, Wired,
The Verge, Fast Company and Ars Technica. We take their shared patterns, not any one site's look:

| Pattern | What it means for Healthmarg |
|---|---|
| Simple header: logo, a few section links, account action at the right; a menu button on phones | Home · Articles · Ritucharya, then theme and Sign in / Join; "Menu" on phones and tablets |
| A thin ticker under the header (MarketWatch, CoinDesk, Seeking Alpha) | The **season strip**: date, ritu, sunrise, sunset, place, link; tinted by the ritu, pausable, still for reduced motion |
| Home leads with content, not decoration | Short hero, then **latest articles** (one lead story, then a list), then the Ritucharya feature |
| Sections divided by thin rules and headings, not boxes | No nested cards, thick coloured borders or filled tiles; hairlines and white space |
| A small coloured label (kicker) above each title | The condition name above article titles; the section name above page titles |
| One readable column for long text (~65–75 characters) | Article body and Ritucharya guidance in a column; long text left-aligned |
| Full footer | About line, Explore and Account columns, legal line |

## Rules (also in the design memory)

- Typography, white space and thin dividers structure the page, not boxes.
- No decoration behind headings or body text. Low-opacity line art may frame a section, never sit under text.
- Every colour passes the contrast test in all four themes; check 390 px width.
- Motion is calm and stops for reduced motion; anything that moves on its own can be paused (WCAG 2.2.2).

## Flow: the season strip

```mermaid
flowchart LR
  A[Page loads] --> B{Saved place?}
  B -- yes --> C[Use it]
  B -- no --> D[New Delhi]
  C --> E[Date, ritu, ritusandhi, sunrise, sunset]
  D --> E
  E --> F{Prefers reduced motion?}
  F -- yes --> G[Still strip, scrolls sideways]
  F -- no --> H[Slow marquee, two copies, second hidden from screen readers]
  H --> I{Hover, keyboard focus or Pause?}
  I -- yes --> J[Paused]
  E --> K[Use my location → browser asks → saved in this browser only]
```

## Order of work

1. Navigation: header, phone menu, footer.
2. Season strip (replaces the Today card).
3. Home page: short hero, latest articles, Ritucharya feature.
4. Ritucharya page without boxes; styled language switch.
5. Articles list and article page: kickers, reading column, rules instead of cards.
6. Tests at every stage: unit → integration → performance/load → security → regression; then push.

## Hero typing animation

Owner request, 2026-11-01: "I want these fonts to be animated, I want it like typing animation and like this create multiple slogans".

- The hero heading types a slogan, holds it, erases it and types the next, in a loop. Accent words stay in the italic colour.
- **Fast first paint:** the first slogan shows complete at once, so typing never delays the page.
- **No layout shift:** every slogan sits invisibly in the same space, so the hero keeps the height of the tallest one.
- **Accessible:**
  - screen readers get one steady heading (the typed text is hidden from them);
  - a Pause button stops the motion (WCAG 2.2.2);
  - with "reduce motion" on, the first slogan stands still and there is no button.
- Slogans describe the site and make no health claims. Keep them short: each must fit two lines from 360px up, because the longest one sets the hero's height.

## Verse typing animation

Owner request, 2026-11-01: "do it with this also" (the Sanskrit band on the home page).

- The band types the Sanskrit, then the transliteration, then the meaning; holds for 6 seconds so it can be read; erases; and moves to the next verse.
- **Starts on arrival:** it begins blank and types when it scrolls into view, so visitors see it happen.
- **Whole letters:** Sanskrit is split by what a reader sees as one letter (`Intl.Segmenter`), never by code unit, so vowel signs are not cut from their letters. Browsers without it fall back to code points.
- **Same safeguards as the hero:** all verses reserve their space, screen readers get the first verse, there is a Pause button, and "reduce motion" shows the first verse standing still.
- **Same verses as the dashboard:** the seven lines in `pages/dashboard/wisdom.ts`. Checked 2026-11-01 before showing them to every visitor. Sources disagree on the Suśruta verse number (15.41 or 15.48), so it is cited by chapter only.

```mermaid
flowchart LR
  A[Scrolled into view] --> B[Type Sanskrit]
  B --> C[Type transliteration]
  C --> D[Type meaning]
  D --> E[Hold 6 seconds]
  E --> F[Erase]
  F --> G[Next verse]
  G --> B
```
