# Feedback log: `feature/hero-typing`

Owner requests, 2026-11-01 (design and reasons in [design-refresh.md](../design-refresh.md)):
- "I want these fonts to be animated, I want it like typing animation and like this create multiple slogans or titles or headings."
- "do it with this also" (the Sanskrit verse band on the home page).

## Round 0: what was built

- **Hero:** six slogans type, hold, erase and loop. The first shows complete at once, so typing never delays the page.
- **Verse band:** the seven classical lines type in turn: Sanskrit, transliteration, meaning. It starts when it scrolls into view and holds each verse for 6 seconds.
- **Shared clock:** `useTypedCycle` runs both, so they behave alike.
- **Both:** a Pause button, one steady text for screen readers, a still version for "reduce motion", and reserved space so nothing below moves.

## Feedback → change

| Feedback from | Problem | Reason | Fix |
|---|---|---|---|
| Unit test | Two timing tests failed with empty text | The test clock jumped 20 ms at a time, so 28 ms steps took 40 ms and fixed sums drifted | The test clock steps 5 ms at a time; verse tests step until the expected text appears |
| Screenshots | A large empty gap under the hero heading | Three long slogans wrapped to three lines, and the hero keeps the tallest slogan's height | Shortened them; every slogan now takes two lines from 360px up (measured at 1366, 1024, 768, 390 and 360) |
| Owner request | Plain slicing would break Sanskrit letters while typing | One visible letter is several code units (letter + vowel sign) | Split text with `Intl.Segmenter`, tested on all seven verses |
| Fact check | Sources disagree on the Suśruta verse number (15.41 or 15.48) | Editions number it differently | Cited as "Sūtrasthāna 15"; the chapter is agreed |
| Lint | Changing a variable during render was refused | React may render a component more than once | Moved the sum into a plain function, `splitTyped` |

## Test results

| Stage | Result |
|---|---|
| Unit + integration | Frontend 357 passed; backend 390 passed, 4 skipped; types clean; 0 audit findings; bundle within budget |
| Real browser | Four themes at 1366 and 390: no sideways scroll, no console errors, band height constant across a full loop |
| Page speed | Home on Slow 4G: LCP 2600 ms, CLS 0.001; this machine, warmed up: LCP 488 ms |
| Load | 12 scenarios, 0 errors, 0 timeouts (no API change) |
| Security | 42 backend + 16 frontend passed |
| Regression | 35 of 35 Edge steps passed |

Slow 4G home LCP rose from 2460 ms to 2600 ms compared with the last run. It stays under the 2500–4000 ms "needs improvement" ceiling but above the 2500 ms "good" line. CLS improved from 0.002 to 0.001. Both typed texts are hidden from screen readers while moving, and the first slogan is the LCP element, so the page paints it as soon as the code runs.

**Limit:** at 320px, three slogans take three lines. Nothing overflows; the hero is only a little taller there.
