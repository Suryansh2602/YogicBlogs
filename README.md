# Healthmarg

A yoga and Ayurveda wellness web app. Signed-in users read or listen to articles on diseases, their causes and Ayurvedic solutions. Subscribers get personal routine guidance. Admins write and design articles and upload photos.

## Stack

| Part     | Tech                     | Folder    |
| -------- | ------------------------ | --------- |
| Frontend | React                    | `frontend/` |
| Backend  | Node.js + Express        | `backend/` |
| Database | MySQL                    | —         |

Frontend and backend are separate apps: they are installed, tested and deployed independently, and talk only over the REST API.

## Repository layout

```
.
├── frontend/     React app (see frontend/README.md)
├── backend/     Express API (see backend/README.md)
├── docs/       Architecture notes, API reference, DB schema
└── .github/    Pull request template
```

## Getting started

Needs Node 20+ and a MySQL 8 database.

```bash
# API: copy backend/.env.example to backend/.env and fill in DB + JWT values first
cd backend && npm install && npm run dev     # http://localhost:5000/api/v1/health

# Web app (second terminal)
cd frontend && npm install && npm run dev     # http://localhost:5173
```

Run `npm test` in either folder for unit + integration tests, or `npm run qa` for the full check (lint, coverage, audit, and build for the client).

## Goals

- Lightweight and cheap to run
- Secure by default (hashed passwords, JWT with refresh tokens, role checks, input validation, rate limiting)
- Every change goes Developer → Reviewer → Tester on its own branch (see docs/workflow.md); `npm run qa` in each app runs lint, tests with coverage gates and a dependency audit
