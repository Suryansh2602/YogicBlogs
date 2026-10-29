# Feedback log: `feature/season-strip-polish`

Owner requests, 2026-10-29 (design and reasons in [design-refresh.md](../design-refresh.md)):
- "I do not like this today tab": a moving strip under the nav bar instead, coloured by the ritu.
- "I want the website to look professional … readable and clean."
- The Ritucharya page "looks unprofessional … like someone placed random boxes on the pages."
- "I want proper navigation."
- "Take references from the best blogging websites" ([detailed.com/50](https://detailed.com/50/)).

## Round 0: what was built

- **Navigation:**
  - header with Home · Articles · Ritucharya, the theme and the account at the right;
  - a **Menu** button on phones and tablets, which closes with Escape, an outside click, or when you choose a page;
  - a full **footer**: about line, Explore and Account columns, and the medical note.
- **Season strip** under the header on every page:
  - shows the date, ritu, ritusandhi, sunrise, sunset, place, "Use my location", and a link to the season;
  - tinted with the ritu's colour (16% into the page background);
  - moves slowly, pauses on hover, keyboard focus or its Pause button, and stands still for reduced motion;
  - the marquee's second copy is hidden from screen readers and skipped by the keyboard.
- **Home:**
  - a short hero with this season's picture;
  - **Latest articles**: one lead story, then a list;
  - "What you'll find here", divided by thin rules;
  - the sutra band, with no watermark behind its text.
  - The Aurora, mandala, yantra and twinkling stars behind the text were removed.
- **Ritucharya page:**
  - slim season tabs, the active one underlined in its colour;
  - each season set like an article: sections divided by thin rules, "At a glance" as label/value columns, coloured dots for dosha states, ✓/✕ for food, and notes as a margin line;
  - a styled English / हिन्दी switch (it was unstyled browser buttons);
  - no animated heading.
- **Articles:**
  - editorial cards: no box, a rounded image, the condition as a small coloured label, the title, a summary, then reading time;
  - a left-aligned page header with no mandala behind it.

## Errors found (each fixed)

| Problem | Reason | Fix |
|---|---|---|
| The language switch showed as raw grey buttons | `chips`/`chip` styles existed only for the articles and admin pages | A shared `.segmented` switch |
| An article's chosen card colour was ignored (all gold) | The card's default colour rule came later and overrode it | Default only when no colour is chosen |
| Sections and the footer sat too close | The shared `.container` rule resets top/bottom padding | Margins and stronger selectors |
| The phone menu stayed open after choosing a page until it loaded | It closed only when the address changed | Closes as soon as a link is chosen |
| **Pages other than home jumped while loading (layout shift 0.33–0.39)** | The new, taller footer showed before a lazily loaded page and was pushed down | The footer appears with the page; the article's loading area fills the screen; Latest articles keeps its space while loading |
| Ritucharya's main content counted late | Its heading faded in word by word | Heading shows at once |
| Home listed articles by an id the public list doesn't have | Type mismatch | Uses the slug |
| Strip contrast test read an empty stylesheet | Tests skip CSS except the theme tokens | The strip's stylesheet added to that exception |
| Screenshot tool opened "…5173C:/Program Files/Git/" | Git Bash rewrites arguments starting with "/" | Path conversion off for that command |
| End-to-end test found "Added to the library." twice | The media page repeats it in a hidden announcer for screen readers (correct) | The test looks inside the upload list |

## Tests

- **Unit, 170:**
  - 24 new contrast checks, one for each of the 4 themes × 6 seasons: strip text ≥ 7:1 and secondary text ≥ 4.5:1;
  - all pass.
- **Integration, 118:**
  - season strip: date, ritu and times; Ritusandhi; location refused or shared; pause; the copy hidden and out of the tab order; present on every page;
  - navigation: header links and the current page; the Menu opens, closes with Escape, and closes after choosing a page; footer links;
  - latest articles: lead + list; left out when there are none or the list can't load.
  - 4 old Today-panel tests were replaced, and 3 tests were scoped to the header or main because the footer repeats some links.
- **Frontend QA:**
  - 288 tests, coverage 86.9 / 80.5 / 82.4 / 88.3;
  - 0 vulnerabilities;
  - bundle within budget, with the first-load JS down from 106 to 85 kB.
- **Page speed** (Edge, production build, cold; mobile = Slow 4G, CPU 4× slower):
  - layout shift is now ≤ 0.03 on every page (home was 0.17);
  - home content appears in 2.0–2.4 s on mobile (was 2.8–3.0 s);
  - other pages 2.2–3.0 s, varying ±0.5 s between runs;
  - the test server doesn't compress files; a production server with gzip/brotli sends about a third as much.
- **Security:**
  - backend attack suite 32 / 32;
  - frontend reader attack tests 9 / 9;
  - 0 vulnerabilities;
  - credential check passed.
- **Regression:**
  - backend 351 passed (+4 skipped by design);
  - browser journey 30 / 30 steps.
- **Load test (backend):** not re-run on this branch. The owner stopped it, and this branch changes no server code. The last results are in [feature-article-editor.md](feature-article-editor.md).

## Open

- Compression (gzip/brotli) on the production server, and the production load test with Redis.
- Owner review of the new look (all four themes, phone and desktop).
