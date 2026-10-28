# Feedback log: `feature/ritucharya`

Owner request, 2026-10-28 (see [ritucharya.md](../ritucharya.md)):
- **Home page:** today's ritu, date, sunrise and sunset on the left, and the first card replaced with Ritucharya.
- **Ritucharya page:** 6 season tabs that look like their seasons, with full seasonal guidance and references.

## Round 0: what was built

- **Today panel** (home, left column on wide screens, below the hero's message on phones):
  - the date in Indian format;
  - the current ritu with its art, plus a Ritusandhi note when seasons are changing;
  - sunrise and sunset;
  - "Use my location" / "Use New Delhi";
  - a link to that season's guidance.
- **Ritucharya page** (`/ritucharya`, linked from the header, the home card and the panel):
  - an introduction (Adana/Visarga kala, Ritusandhi);
  - 6 illustrated season tabs (WAI-ARIA tabs: arrow keys, Home/End; the choice is kept in the address);
  - a detail panel per season;
  - "Doshas through the year" table, two classical principles, numbered sources, and the medical note.
- **Content:** 6 ritus × (at a glance, Vata/Pitta/Kapha, body physically/mentally/emotionally, food to favour and avoid, routine, asanas, pranayama with safety notes, exercise, protecting against BP/diabetes/arthritis/asthma/digestive/skin problems), with numbered citations.
- **Sources:** 6 classical texts and 7 research papers. **Every paper was checked to exist with a web search before citing**, and details and links were corrected from what was found (e.g. the Chaddha 2019 volume and pages). One paper contradicts folk belief (Jena 2017: rain does not raise joint-pain visits), and the page says so.

## Errors found while building (each fixed)

| Error | Cause | Fix |
|---|---|---|
| The two parallel builders for branch 4 stopped part-way | The session limit ("resets 4am") hit both agents | Their partial files were set aside with `git stash` (nothing deleted); branch 4 continues by hand |
| The owner's API stopped with exit code 1 and no error | Background tasks were ended when the session hit its limit (the log shows a clean start, then the exit) | Restarted; no code fault |
| The owner's `import 'dotenv/config'` didn't help `nodemon src/server.js` | It came *after* the settings module, which already read an empty environment | Moved to the first line; verified with a direct start (health OK, database up) |
| The owner's dotenv 18.0.9 was 6 days old | Under the project's two-week age rule for new packages | Pinned 17.4.2 |
| **`sanitize.ts` and `api.ts` (already committed groundwork) failed strict type-check and lint** | I ran their tests but not `tsc`/`eslint` before committing | Fixed in its own commit on the editor branch; every check is now run before each commit |
| The builders' unfinished files broke the whole project's type-check | They belong to branch 4 but sat in the shared working folder | Stashed until the editor branch resumes |
| On phones the new "Ritucharya" header link pushed "Sign in" and "Join free" off screen | The header had no room at 390 px | Hidden on small screens like "Home"; phone users reach it from the home card and the Today panel |
| Screenshot names with `?` failed on Windows, and PowerShell split the comma lists | Path characters, and unquoted arguments | Safe file names; quoted arguments |

## Tests

- **Unit, 14:**
  - ritu dates, including the year's edges;
  - Ritusandhi, including across the new year;
  - sunrise/sunset within 2 minutes of published London times;
  - plausible New Delhi times;
  - Tromsø polar night;
  - the date in a time zone.
- **Page, 7:**
  - the Today panel (date, ritu, times, link, the Ritucharya card);
  - Ritusandhi;
  - location only on click, refusal explained, a shared location used and remembered, back to New Delhi;
  - the Ritucharya page on the current season, with doshas, food, breathing safety, sources and the medical note;
  - tabs by click and by arrow keys, with the address kept;
  - a made-up season in the address ignored.
- **Real browser (Edge):** home and Ritucharya pages in Ratri and Ushas at 1366 and 390 px, no console errors. Today's panel showed Sharad, 6:29 am / 5:39 pm for New Delhi (published: about 6:31 / 5:38).

## Open

- **Content review** by the site's practitioners / an Ayurveda doctor before launch (owner).
