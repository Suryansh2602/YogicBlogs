# Healthmarg — Frontend

React single-page app. Talks to the server only through its REST API.

## Layout

```
frontend/
├── public/             Static files served as-is (favicon, lotus logo)
├── src/
│   ├── assets/         Images, icons, fonts bundled by the build
│   ├── components/
│   │   ├── common/     Reusable UI: Button, Input, Card, Modal, Loader
│   │   └── layout/     Header, Footer, Sidebar, page shells
│   ├── features/       Feature-specific components, hooks and API calls
│   │   ├── auth/           Login, register, session handling
│   │   ├── articles/       Article list, reader, search by condition
│   │   ├── audio/          Listen-to-article player
│   │   ├── subscription/   Plans, checkout, subscription status
│   │   ├── guidance/       Personal routine view for subscribers
│   │   └── admin/          Article editor, photo uploads, user management
│   ├── pages/          Route-level screens (pages/admin/ for the admin panel)
│   ├── routes/         Router setup, protected and admin-only routes
│   ├── services/       Shared API client (base URL, auth headers, token refresh)
│   ├── hooks/          Shared custom hooks
│   ├── context/        App-wide state (auth user, theme)
│   ├── styles/         Global styles and theme tokens (blue lagoon palette)
│   └── utils/          Formatting and helper functions
└── tests/
    ├── unit/           Component and hook tests
    └── integration/    Page flows with the API mocked
```
