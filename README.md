# tech-phantoms

Application code lives in [`mobile/`](mobile/) and [`web/`](web/):

* `mobile/backend` is the FastAPI service (auth, groups, expenses, panchang, the Utsav AI assistant).
* `mobile/frontend` is the Expo (React Native) app.
* `web/server` is the Express service (outbound calling, approvals, knowledge retrieval).
* `web/client` is the Vite (React) operator console.

Secrets are never committed: copy each `.env.example` to `.env` and fill in your own values.
