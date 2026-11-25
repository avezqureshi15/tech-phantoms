# FestiveOS backend

FastAPI + SQLAlchemy 2 + PostgreSQL. Python 3.12.

## Setup

Dependencies are managed with [uv](https://docs.astral.sh/uv/) and pinned in `uv.lock`.

```bash
uv sync                        # creates .venv on Python 3.12 (see .python-version) from the lockfile
cp .env.example .env           # then fill in the values (names are documented below)
uv run alembic upgrade head    # apply migrations
uv run uvicorn festiveos.main:app --reload --no-access-log
```

## Dependencies

`uv.lock` is the source of truth. `requirements.txt` (runtime) and `requirements-dev.txt` (tests and lint) are the same
set as exact pins, grouped by purpose, for hosts and tools that only understand pip.
`pip install -r requirements.txt` gives the identical environment.

Change a dependency with `uv add <package>` (or `uv add --dev <package>`), then edit the matching requirements file to
the new pins. `tests/test_dependencies.py` fails if the two ever disagree, and tells you which pin is wrong.

Checks, all of which must pass before a change is done:

```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest -q                                     # fast: in-memory SQLite
TEST_DATABASE_URL=postgresql+psycopg://user@localhost:5432/festive_test uv run pytest -q   # real Postgres
TEST_REDIS_URL=redis://127.0.0.1:6379/0 uv run pytest -q                                   # also tests the Redis limiter
```

With `TEST_DATABASE_URL` set, the suite runs the real Alembic migrations (down to base, then up to head) on that
database, truncates every table between tests, and enables the concurrency tests that need real row locking.
**Use a throwaway database: it is wiped.**

## Layout

```
backend/
  pyproject.toml  uv.lock  alembic.ini  .python-version
  migrations/                    Alembic (versions/001..007)
  docs/                          design notes (rate-limiting, concurrency, ai, religions-and-calendars, groups-and-expenses)
  tests/                         mirrors src/festiveos; support.py = helpers, conftest.py = fixtures
  src/festiveos/
    main.py                      composition root: create_app(), routers, middleware, error mapping
    config.py                    environment settings; TLS enforcement for the database URL
    core/                        shared kernel: errors, logging aspect, security (JWT), rate limiting, pagination, InputModel
    db/                          Base, engine/session, SessionDep, registry (imports every model)
    integrations/                third-party adapters (Google ID-token verification)
    users/                       the User entity (model, schemas, repository)
    auth/                        Google sign-in, sessions, refresh tokens, `get_current_user`
    accounts/                    the signed-in user's own account: GET /users/me, DELETE /users/me
    households/                  households, members, roles, and the access rules the others reuse
    festivals/                   festivals and their events
    traditions/                  traditions, occurrences (history) and each festival's checklist
```

Each feature folder has the same files, and each layer may only import the one beneath it:

```
router.py  ->  dependencies.py  ->  service.py  ->  repository.py  ->  models.py
 HTTP only      wiring (Depends)     business rules   SQL only          tables
                 schemas.py = request/response shapes (no behaviour)
```

* **Features depend one way**: `users` < `auth` < `households` < `festivals` < `traditions`, with `accounts` on top.
  `tests/test_architecture.py` fails the build on a cycle, a skipped layer, or the shared kernel reaching into a feature.
* **Services own transactions.** Repositories flush; the service commits. Routers never touch the database.
* **Every public service method is logged by an aspect** (`@logged_service`), so services contain no logging code.
* To add a feature, copy the shape of an existing one, declare its dependencies in `tests/test_architecture.py`,
  and add its models to `db/registry.py`.

## Household and member rules

A household is the family group. Every rule below is enforced by the API (and covered by `tests/test_members.py`),
not just hidden in the app.

| Action | Endpoint | Who may do it |
|---|---|---|
| Add a member (by their Google email; they must have signed in once) | `POST /households/{id}/members` | admins |
| Change a member's **role** | `PATCH /households/{id}/members/{user_id}` | admins |
| Change relationship / notification setting | same | admins for anyone; a member for themselves |
| Remove a member | `DELETE /households/{id}/members/{user_id}` | admins |
| Leave a household | same, with your own `user_id` | any member |
| **Delete the household** | `DELETE /households/{id}` | **only its sole remaining member (who is necessarily an admin)** |

Rules to remember:

- **A household always keeps at least one admin.** The last admin cannot leave, be removed or be demoted (409).
  They must promote someone else first. Concurrent changes are serialised with a row lock on the household, so two
  admins cannot demote each other at the same instant.
- **Deleting a household is only possible when you are its only member.** If anyone else is still in it, the request
  fails with 409 ("remove them or ask them to leave first"), and a non-admin gets 403. This is deliberate: a household
  with other people in it should never vanish because one admin tapped a button.
- **Deleting is permanent.** It removes the household's members, festivals, events, traditions and their history via
  database `ON DELETE CASCADE`. User accounts are not touched.
- **Removed or departed members keep their history.** Traditions they created and "performed by" records stay; only
  their access ends. A user outside the household always gets 404, never 403, so household ids cannot be probed.
- The mobile app offers "Delete this family" (Family tab → Danger zone) only to a household's sole member, and hides
  "Leave family" for them, since leaving would be refused.

## Configuration

All settings are environment variables (a local `.env` is read automatically). Names only; never commit values.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres URL, e.g. `postgresql+psycopg://user:pass@host:5432/db`. Percent-encode special characters in the password. |
| `JWT_SECRET` | yes | 32+ characters; signs access tokens. |
| `GOOGLE_CLIENT_IDS` | yes | Comma-separated OAuth client IDs (the web client ID at minimum). |
| `RATE_LIMIT_ENABLED` | no | `true` (default) or `false`. |
| `RATE_LIMIT_REDIS_URL` | no | Shared counters for several workers or instances; a **secret** if it has a password. Unset = per-process limits. |
| `TRUSTED_PROXY_COUNT` | no | Reverse proxies in front of the app (default `0`). Required to see real client addresses behind a proxy. |
| `MAX_REQUEST_BYTES` | no | Largest accepted request body. Default `262144`. |
| `OPENAI_API_KEY` | no | Turns on Utsav, the AI layer (`OPEN_AI_API_KEY` also works). Without it the AI routes answer 503. Default model `gpt-6.2-sol`; other `AI_*` settings are in `docs/ai.md`. |
| `SARVAM_API_KEY` | no | Turns on receipt scanning and document reading (Sarvam Document AI) and translation. Without it those routes answer 503. |
| `FLAGSMITH_SERVER_KEY` | no | Flagsmith server-side key; empty means every feature is on. See `docs/feature-flags.md`. |
| `FLAGSMITH_API_URL` | no | Self-hosted Flagsmith API URL; empty means Flagsmith Cloud. |
| `DIYA_BASE_URL` | no | Address of the web support platform, for call-back requests. See `docs/web-integration.md`. |
| `DIYA_INTEGRATION_SECRET` | no | Shared signing secret with the web server. Both must be set for call backs to work. |
| `MAX_UPLOAD_BYTES` | no | Largest receipt or document upload, default 10 MB. Other routes keep the 256 KB JSON limit. |
| `ENABLE_API_DOCS` | no | `true` turns on `/docs`, `/redoc` and `/openapi.json`. **Off by default.** |
| `DB_LOCK_TIMEOUT_MS` | no | How long a transaction waits for a lock before failing with 503. Default `5000`. |
| `DB_STATEMENT_TIMEOUT_MS` | no | Longest a single statement may run. Default `30000`. |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | no | Longest a transaction may sit idle holding locks. Default `60000`. |
| `LOG_LEVEL` | no | `INFO` (default), `DEBUG`, `WARNING`... |
| `LOG_FORMAT` | no | `json` (default, one object per line) or `text` for local reading. |

## Production notes

* **API docs are not public.** Swagger UI, ReDoc and the OpenAPI schema all return 404 unless `ENABLE_API_DOCS=true`.
  The schema describes every endpoint, so it should stay off on anything reachable from the internet. Turn it on
  locally with `ENABLE_API_DOCS=true uvicorn festiveos.main:app`.
* **TLS to the database is enforced in code** (`festiveos.config.get_database_url`). For any host that is not `localhost`,
  `127.0.0.1` or `::1`: a URL with no `sslmode` gets `sslmode=require` added; `disable`, `allow` and `prefer` (which can
  silently fall back to plaintext) make startup fail. `require` encrypts the connection but does not verify the server's
  certificate; for that, use `sslmode=verify-full` with the provider's CA.
* **Connection pool uses SQLAlchemy's defaults**: 5 connections kept open plus up to 10 overflow, so at most
  **15 per worker process**. Multiply by your worker count and keep it under your database plan's connection limit
  (check the plan; with Supabase prefer its pooler). On a small plan, run one or two workers rather than raising the pool.
* **Logging**: every request logs one line (method, route template, status, duration, user id) and carries an
  `X-Request-ID` header (an inbound one is reused if it is a sane token). Every public service method is logged by an
  aspect (`src/festiveos/core/log.py`, `@logged_service`): outcome, duration and identifiers only. **String arguments are never logged**
  because they can be tokens or emails. Refusals (401/403) log at WARNING, expected rejections at INFO, bugs at ERROR with
  a traceback. Unhandled errors return a generic 500 with the request id and no internals. Run uvicorn with
  `--no-access-log` since the middleware already logs requests.
* **Logout revokes access tokens immediately.** Each sign-in is a server-side session; access tokens carry its id and
  every request checks the session is still live, at the cost of one indexed lookup. Logging out, a replayed refresh
  token (theft), or deleting the account ends the session. Logging out on one device does not affect the others.
  A refresh keeps the same session. Migration `006` discards existing refresh tokens, so everyone signs in once more.
* **Deleting your own account** (`DELETE /users/me`): removes the account, its sessions and its household memberships.
  Households where the user is the only member are deleted with them. A user who is the **only admin of a household that
  still has other members** is refused with 409 until they promote someone or remove the others; nothing is changed in
  that case. Traditions and households they created stay with the family and keep no link to them
  (`created_by` becomes null; migration `007`).
* **Time zones.** Festival and event dates are calendar dates, and event times are wall-clock times, both *in the
  household's time zone* (`households.timezone`, set from the creator's device at signup and changeable by an admin with
  `PATCH /households/{id}`). The app computes "today" in that zone, so a family and a faraway cousin agree on the day.
  Timestamps (`completed_at`, `created_at`) are UTC instants, shown in the household's zone. Every response carries
  `X-Server-Time` (UTC); the app uses it to correct a wrong device clock.
* **Deadlocks and waits.** Locks are always taken in one fixed order, every transaction has lock, statement and idle
  timeouts, and a busy database answers 503 with `Retry-After` instead of hanging or returning a 500. The cycle analysis, the
  lock order and the four deadlocks that were found and fixed are in `docs/concurrency.md`.
* **Rate limiting** applies to every route, per user once signed in and per address before that, with exact `Retry-After`
  answers, a bounded in-process backend and an optional shared Redis backend that is exact across workers and instances.
  Request bodies are capped and every response is `no-store`. Policies, identity rules, failure behaviour and measured
  costs are in `docs/rate-limiting.md`.
* **Running more than one worker or instance?** Set `RATE_LIMIT_REDIS_URL` (otherwise each process enforces its own limit)
  and `TRUSTED_PROXY_COUNT`, poll `/health/live` for liveness and `/health/ready` for readiness.

