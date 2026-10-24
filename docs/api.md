# API Reference

REST + JSON API served by `backend/`. The frontend (and Postman) are the only clients.

- **Base URL:** `http://localhost:5000/api/v1` (dev), `https://api.nerveandnectar.com/api/v1` (prod)
- **Postman:** import `backend/postman/nerve-nector.postman_collection.json` and `backend/postman/local.postman_environment.json`. The collection is updated with every API change.
- **Status legend:** ✅ built · 🔜 planned (phase in [plan.md](plan.md))

---

## 1. Conventions

### Requests
- `Content-Type: application/json` for every body (planned: other types get `415`). Max body is 100 kB (admin article saves will allow 1 MB).
- Unknown fields are rejected (`zod .strict()`), so mass-assignment such as sending `"role": "admin"` fails with `400`.
- IDs are UUID v7 strings. Public URLs use slugs.

### Authentication 🔜
| Credential | Where | Sent to |
|---|---|---|
| Access token (JWT, 15 min) | `Authorization: Bearer <token>` | Every protected endpoint |
| Refresh token | `HttpOnly` cookie set by the API | Only `POST /auth/refresh` and `POST /auth/logout` |
| CSRF token | `X-CSRF-Token` header (from `GET /auth/csrf`) | Cookie endpoints only |

### Responses
Success returns the resource directly, or `{ data, page }` for lists.

Errors always have this shape:
```json
{ "error": { "message": "Validation failed", "code": "VALIDATION_FAILED", "details": [{ "path": "email", "message": "Invalid email" }] } }
```
Messages are safe to show users. Internals (SQL, stack traces, hosts) are never returned.

| Status | Meaning |
|---|---|
| 200 / 201 / 204 | OK / created / no content |
| 202 | Accepted. Used where the answer must not reveal whether an email exists (register, forgot password). |
| 400 | Invalid input (`details` lists fields) |
| 401 | Not signed in / token invalid or expired |
| 403 | Signed in but not allowed (wrong role, 2FA required, CSRF failed) |
| 404 | Not found, also used instead of 403 when revealing existence would leak information |
| 409 | Conflict (duplicate slug, stale `version` on save) |
| 413 / 415 | Body too large / wrong content type |
| 429 | Rate limited (`RateLimit` + `Retry-After` headers) |
| 503 | A dependency (MySQL/Redis) is unavailable |

### Pagination 🔜
Cursor-based: `?limit=20&cursor=<opaque>` returns `{ "data": [...], "page": { "nextCursor": "..." | null } }`. `limit` is capped at 50.

### Rate limits ✅
| Scope | Limit | Store |
|---|---|---|
| Every request, per IP | 300 / 15 min | Redis (fails open) |
| Auth endpoints, per IP | 10 / 15 min | Redis (fails closed) |
| Login failures, per IP + account 🔜 | Progressive lockout | Redis |

Headers follow the IETF draft-8 standard (`RateLimit`, `RateLimit-Policy`).

---

## 2. Health ✅

### `GET /health`
Public. Reports whether dependencies are reachable, and never reveals versions, hosts or errors.

`200`
```json
{ "status": "ok", "database": "up", "redis": "up" }
```
`503`
```json
{ "status": "degraded", "database": "up", "redis": "down" }
```

---

## 3. Auth 🔜 (phase P1)

All auth endpoints use the strict auth rate limit. Steps marked 🤖 require a reCAPTCHA v3 token (`captchaToken` in the body).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/auth/csrf` | — | Issue a CSRF token for the cookie endpoints |
| POST | `/auth/register` 🤖 | — | Create account → always `202`, verification email sent |
| POST | `/auth/verify-email` | — | `{ token }` → marks email verified |
| POST | `/auth/verify-email/resend` 🤖 | — | Always `202` |
| POST | `/auth/login` 🤖 | — | Password login → tokens, or a 2FA challenge |
| POST | `/auth/login/2fa` | — | `{ mfaTicket, code }` (TOTP or backup code) |
| POST | `/auth/refresh` | cookie + CSRF | Rotate the refresh token, get a new access token |
| POST | `/auth/logout` | cookie + CSRF | End this session |
| POST | `/auth/logout-all` | Bearer | End every session (bumps `token_version`) |
| POST | `/auth/password/forgot` 🤖 | — | Always `202` |
| POST | `/auth/password/reset` | — | `{ token, password }` → all sessions revoked |
| GET | `/auth/google/start` | — | Redirect to Google (PKCE, state, nonce) |
| GET | `/auth/google/callback` | — | Google redirects here; never call it directly |
| POST | `/auth/2fa/setup` | Bearer | Returns `{ otpauthUrl, qrDataUrl }` (secret pending) |
| POST | `/auth/2fa/enable` | Bearer | `{ code }` → enables 2FA, returns backup codes once |
| POST | `/auth/2fa/disable` | Bearer + recent auth | Not allowed for admins (2FA is mandatory) |
| POST | `/auth/2fa/backup-codes` | Bearer + recent auth | Regenerate (old codes stop working) |
| GET | `/auth/sessions` | Bearer | List my active sessions (device, IP, last used) |
| DELETE | `/auth/sessions/:id` | Bearer | Revoke one session |

**`POST /auth/register`**
```json
// request
{ "email": "asha@example.com", "password": "correct horse battery staple", "displayName": "Asha",
  "acceptTerms": true, "acceptPrivacy": true, "captchaToken": "..." }
// 202 — same response whether or not the email already exists
{ "message": "Check your email to verify your account" }
```

**`POST /auth/login`**
```json
// request
{ "email": "asha@example.com", "password": "...", "captchaToken": "..." }
// 200 — no 2FA
{ "accessToken": "eyJ...", "user": { "id": "0190...", "email": "asha@example.com", "displayName": "Asha", "role": "user", "twoFactorEnabled": false } }
// 200 — 2FA required (always for admins)
{ "mfaRequired": true, "mfaTicket": "opaque-random" }
// 401 — same message for unknown email and wrong password
{ "error": { "message": "Invalid email or password", "code": "INVALID_CREDENTIALS" } }
```

Password rules: 12–128 characters, checked against known-breached passwords, hashed with argon2id.

---

## 4. Current user (user dashboard) 🔜 (P1/P2)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/users/me` | Bearer | Profile, role, `twoFactorEnabled`, verified status |
| PATCH | `/users/me` | Bearer | `{ displayName }` |
| POST | `/users/me/password` | Bearer + recent auth | Change password (revokes other sessions) |
| POST | `/users/me/email` | Bearer + recent auth | Start an email change (confirm via link) |
| GET | `/users/me/bookmarks` | Bearer | My saved articles |
| GET | `/users/me/progress` | Bearer | "Continue reading" list |
| GET | `/users/me/export` | Bearer | Download my data (DPDP) |
| DELETE | `/users/me` | Bearer + recent auth | Delete my account (anonymised) |

---

## 5. Content (public + members) 🔜 (P2)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/conditions` | — | Published conditions (cached) |
| GET | `/conditions/:slug` | — | One condition + its published articles |
| GET | `/articles?condition=&q=&cursor=` | — | Published article list; `q` uses full-text search |
| GET | `/articles/:slug` | optional | Full content if allowed, otherwise `{ locked: true }` teaser |
| GET | `/articles/:slug/audio` | Bearer | Short-lived signed URL for the audio file |
| PUT | `/articles/:slug/progress` | Bearer | `{ progressPercent, audioPositionSeconds }` |
| PUT | `/articles/:slug/bookmark` | Bearer | Save |
| DELETE | `/articles/:slug/bookmark` | Bearer | Unsave |

**`GET /articles/:slug`** for a signed-out visitor on a members-only article:
```json
{ "slug": "calming-migraine", "title": "Calming migraine", "summary": "...", "coverImage": { "url": "...", "alt": "..." },
  "condition": { "slug": "migraine", "name": "Migraine" }, "locked": true, "reason": "SIGN_IN_REQUIRED" }
```

---

## 6. Admin dashboard 🔜 (P2)

Every admin endpoint requires: `Bearer` → role `admin` → **2FA enabled and used for this session**. Every change writes an audit log entry.

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/admin/conditions` | List (incl. drafts) / create |
| GET / PATCH / DELETE | `/admin/conditions/:id` | Read / edit / soft delete (refused while articles exist) |
| GET / POST | `/admin/articles` | List with filters / create draft |
| GET / PATCH | `/admin/articles/:id` | Read / save (send `version`; `409` if stale) |
| POST | `/admin/articles/:id/publish` | Publish (sets `published_at`, clears cache) |
| POST | `/admin/articles/:id/unpublish` | Back to draft |
| POST | `/admin/articles/:id/archive` | Archive |
| DELETE | `/admin/articles/:id` | Soft delete |
| POST | `/admin/media/images` | Upload image (multipart; re-encoded to WebP) |
| POST | `/admin/media/audio` | Upload audio (multipart) |
| GET / PATCH / DELETE | `/admin/media[/:id]` | List / edit alt text / delete (`409` if in use) |
| GET | `/admin/users` | Search users |
| GET | `/admin/users/:id` | User detail + sessions |
| PATCH | `/admin/users/:id` | `{ status }`: suspend or reactivate (revokes sessions) |
| PUT | `/admin/users/:id/role` | Change role (recent auth; can't demote yourself or the last admin) |
| POST | `/admin/users/:id/revoke-sessions` | Force logout everywhere |
| POST | `/admin/users/:id/reset-2fa` | Reset another user's 2FA (never your own) |
| GET | `/admin/audit-logs` | Filter by actor, action, entity, date |
| GET | `/admin/stats` | Dashboard numbers (users, articles, reads) |

---

## 7. Planned later (not in current scope)

Subscriptions and payments (`/plans`, `/subscriptions/*`, `/webhooks/razorpay`), personal guidance (`/guidance/*`), and the AI assistant (`/assistant/*`). They'll be designed in their own phase. See [plan.md](plan.md).
