# tech-phantoms

Application code lives in [`mobile/`](mobile/) and [`web/`](web/):

* `mobile/backend` is the FastAPI service (auth, groups, expenses, panchang, the Utsav AI assistant).
* `mobile/frontend` is the Expo (React Native) app.
* `web/server` is the Express service (outbound calling, approvals, knowledge retrieval).
* `web/client` is the Vite (React) operator console.
* `web/storefront-demo` is a static festive storefront used to try the embeddable enquiry widget.

Secrets are never committed: copy each `.env.example` to `.env` and fill in your own values.

## Website Enquiry Demo

`npm run dev` starts the operator console, API, and storefront. Open the festive storefront at
`http://localhost:5174`; the console remains at `http://localhost:5173` and the API at
`http://localhost:4002`.

The demo widget uses the `festive-mart` workspace installation. Apply the additive Prisma schema
change to the intended development database with `npm --prefix web/server run prisma:push`, then
run `npm --prefix web/server run prisma:seed-outbound` to seed/update the demo installation. Verify
`DATABASE_URL` points to the development database before applying the schema. Website enquiries are
stored separately from AI support tickets and do not grant outbound-call consent.

The storefront can also be built independently with `npm --prefix web/client run build:storefront`.
Its API base and public widget ID can be overridden with the `VITE_DIYA_API_BASE_URL` and
`VITE_DIYA_WIDGET_ID` values shown in `web/storefront-demo/.env.example`.
Run the database-backed widget-to-inbox flow with `npm --prefix web/server run test:enquiry-integration`.
