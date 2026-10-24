# Nerve and Nector

A yoga and Ayurveda wellness web app. Signed-in users read or listen to articles on diseases, their causes and Ayurvedic solutions. Subscribers get personal routine guidance. Admins write and design articles and upload photos.

## Stack

| Part     | Tech                     | Folder    |
| -------- | ------------------------ | --------- |
| Frontend | React                    | `client/` |
| Backend  | Node.js + Express        | `server/` |
| Database | MySQL                    | —         |

Client and server are separate apps: they are installed, tested and deployed independently, and talk only over the REST API.

## Repository layout

```
.
├── client/     React app (see client/README.md)
├── server/     Express API (see server/README.md)
├── docs/       Architecture notes, API reference, DB schema
└── .github/    CI workflows
```

## Getting started

Needs Node 20+ and a MySQL 8 database.

```bash
# API: copy server/.env.example to server/.env and fill in DB + JWT values first
cd server && npm install && npm run dev     # http://localhost:5000/api/v1/health

# Web app (second terminal)
cd client && npm install && npm run dev     # http://localhost:5173
```

Run `npm test` in either folder for unit + integration tests, `npm run test:coverage` for a coverage report.

## Goals

- Lightweight and cheap to run
- Secure by default (hashed passwords, JWT with refresh tokens, role checks, input validation, rate limiting)
- Unit and integration tests for both apps, run in CI on every push
