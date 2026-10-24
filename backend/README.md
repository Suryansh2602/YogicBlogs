# Nerve and Nector — Backend

REST API for the Nerve and Nector app. Node.js + Express + MySQL.

## Layout

```
backend/
├── src/
│   ├── config/         Env loading, DB pool, app constants
│   ├── db/
│   │   ├── migrations/ Versioned schema changes (one file per change)
│   │   └── seeds/      Dev/test seed data (admin user, sample articles)
│   ├── middlewares/    Auth (JWT), role checks, validation, rate limiting, error handler, uploads
│   ├── utils/          Logger, error classes, helpers
│   └── modules/        One folder per feature: routes → controller → service → repository
│       ├── auth/           Register, login, refresh, logout, password reset
│       ├── users/          Profiles, roles (user / subscriber / admin)
│       ├── articles/       Disease articles: causes, Ayurvedic solutions, drafts & publishing
│       ├── conditions/     Disease / condition categories articles belong to
│       ├── audio/          Listen mode: audio versions of articles
│       ├── subscriptions/  Paid plans, payment webhooks, access checks
│       ├── guidance/       Personal routine guidance for subscribers
│       └── media/          Admin photo uploads, image processing
├── tests/
│   ├── unit/           Services and utils, DB mocked
│   ├── integration/    HTTP tests against a real test MySQL database
│   └── fixtures/       Shared test data
├── uploads/            Local uploaded files in development (git-ignored)
└── logs/               Runtime logs (git-ignored)
```

Each module keeps its own files together, e.g. `modules/articles/`:
`articles.routes`, `articles.controller`, `articles.service`, `articles.repository`, `articles.validation`.
