# Healthmarg — Frontend

React single-page app in strict TypeScript. Talks to the backend only through its REST API.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run typecheck` | Strict TypeScript check (app, tests and build config) |
| `npm run lint` | ESLint with type-aware TypeScript rules |
| `npm test` | Vitest unit + integration tests |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run check:bundle` | Performance budget on the built files (run after a build) |
| `npm run qa` | Everything above plus coverage and `npm audit`; must pass before a push |

## Running locally

1. Start the API (in `backend/`: `npm run dev`). Its `CLIENT_ORIGIN` must include `http://localhost:5173`.
2. Run `npm run dev` here, then open **http://localhost:5173**. Use `localhost`, not `127.0.0.1`: the API's CORS allow-list and cookies expect it.
3. Emails are not sent locally. Open the newest file in `backend/.local/outbox/` (the link is also printed in the API terminal).
4. First admin: open **/admin/setup** and enter the one-time setup code printed in the API terminal. At the first admin sign-in you set up two-step sign-in with an authenticator app.

## Layout

```
frontend/
├── public/               Logo mark, theme-init.js (applies the saved theme before first paint)
├── scripts/              check-bundle-size.mjs (performance budget, part of npm run qa)
├── src/
│   ├── components/
│   │   ├── brand/        Logo (theme-aware), Mandala, LotusBloom, Nakshatra (stars), Yantra
│   │   ├── motion/       BlurReveal, ShinyText, SpotlightCard, Aurora (CSS-only animation)
│   │   ├── ui/           Button, TextField, PasswordField, Checkbox, Alert, OtpInput, ThemeSwitcher, Spinner
│   │   └── layout/       Site shell (header/footer), AuthLayout (split screen with a verse)
│   ├── features/auth/    Session (in-memory token, refresh), AuthProvider, guards, API calls,
│   │                     password policy, 2FA step and enrolment, reCAPTCHA hook
│   ├── pages/            Home, auth/, dashboard/, admin/ (sign-in, setup, overview, members, audit)
│   ├── routes/           Route table and lazily loaded pages
│   ├── services/         apiClient (the only way to reach the backend)
│   ├── styles/           tokens.css (the four themes), global.css
│   └── theme/            Theme provider and the theme list
└── tests/
    ├── helpers/          Scripted fake API, full-app render helper
    ├── unit/             Session logic, password policy, errors, API client, env guard
    └── integration/      Every page flow with the API mocked (sign-up, sign-in + 2FA, dashboard, admin)
```

## Themes

| Theme | Feel | Default |
|---|---|---|
| Ushas (dawn) | Cream, navy, lotus pink, teal: the logo's palette | Light-mode devices |
| Ratri (night) | Warm near-black, temple-lamp gold | Dark-mode devices |
| Kesar (saffron) | Marigold and terracotta | — |
| Vana (forest) | Tulsi greens and river teal | — |

Components use only the CSS variables in `src/styles/tokens.css`, so a new theme is one more block of variables.

## Motion and performance

- The animated components (blur-in text, shimmer, spotlight cards, aurora, mandala, lotus bloom) are small in-house TypeScript + CSS pieces in the style of ReactBits. There's no animation library, canvas or WebGL.
- Every animation stops when the device's "reduce motion" setting is on.
- Every page except Home loads on demand. `npm run check:bundle` fails QA if the first load grows past 115 kB gzip or any page past 25 kB.
