# tech-phantoms

All application code lives in [`mobile/`](mobile/):

* `mobile/backend` is the FastAPI service (auth, groups, expenses, panchang, the Utsav AI assistant).
* `mobile/frontend` is the Expo (React Native) app.

Secrets are never committed: copy each `.env.example` to `.env` and fill in your own values.
