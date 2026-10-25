# Security

## Credentials

| Where                         | What goes there                                           |
| ----------------------------- | --------------------------------------------------------- |
| `backend/.env` (local only)    | DB password, JWT secrets, any API keys. Git-ignored.      |
| Host env vars (production)    | Same variables, set in the hosting dashboard. No file.    |
| `frontend/.env`                 | Public settings only (API URL). Everything here is public.|
| Git, chat, screenshots, logs  | **Never** a real credential.                              |

What enforces this:

- `.gitignore` ignores every `.env*` file except `.env.example`.
- The Tester stage checks staged files before every commit: no `.env`, key or certificate files, and no credentials in the diff.
- `backend/src/config/env.js` refuses to start with weak or missing secrets: JWT secrets under 32 chars, access and refresh secrets equal, and in production an empty DB password, the `root` DB user or a non-https client origin.
- Env validation errors name the variable, never its value; the logger redacts `authorization`, `cookie`, `password` and `token` fields.
- `frontend/config/envGuard.js` fails the client build if any `VITE_*` variable name looks like a secret.

Generate a secret (run once per secret, never reuse):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

If a secret is ever committed or pasted somewhere: rotate it immediately (generate a new one, update the host env). Deleting the commit is not enough.

## Database user

The app connects as its own user with only the rights it needs, never `root`:

```sql
CREATE DATABASE healthmarg CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'healthmarg_app'@'localhost' IDENTIFIED BY '<generated password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON healthmarg.* TO 'healthmarg_app'@'localhost';
```

Migrations run with a separate user that also has `CREATE, ALTER, INDEX, DROP, REFERENCES`.
All queries go through Sequelize models (parameterised); raw SQL, if ever needed, must use `replacements`/bind parameters. Multi-statement queries are disabled at the driver.

## Frontend / backend separation

- Two independent apps in `frontend/` and `backend/`: own `package.json`, lockfile, tests and `npm run qa`. Deployed separately.
- The frontend reaches the backend only over HTTPS through `services/apiClient.js`; ESLint blocks importing backend code.
- The API only accepts browser calls from origins in `CLIENT_ORIGIN` (CORS allow-list).
- Once auth is added: if client and API end up on different sites, auth cookies need `Secure; SameSite=None` plus CSRF protection. Hosting them on the same site (e.g. `app.example.com` + `api.example.com`) allows the stricter `SameSite=Lax`.

## HTTP hardening (backend)

helmet security headers, `x-powered-by` off, 100 kB body limit, rate limits (300 req / 15 min general, 10 / 15 min on auth routes), central error handler that never leaks internals.

## Before first deploy (tracked)

- Serve the client with a `Content-Security-Policy` header from the host (e.g. `default-src 'self'; connect-src 'self' https://api.<domain>; img-src 'self' data: https://api.<domain>`), plus `Strict-Transport-Security`.
- If uploaded images are served by the API to the client on another origin, relax helmet's `Cross-Origin-Resource-Policy` for the uploads route only.
- If CI is added later: secret scanning (gitleaks) and GitHub Actions pinned to commit SHAs.

## QA gates (`npm run qa` in each app, before every commit)

lint (incl. `eslint-plugin-security` on the backend) → unit + integration tests with ≥80% line coverage → `npm audit` for high-severity issues → frontend production build. No CI/CD yet; it can be added later.
