# FestiveOS backend: working agreements

Read `README.md` first (setup, layout, production notes). This file is the short list of rules for changing the code,
for people and for AI assistants alike. Nothing here is aspirational: each rule is checked by a command below.

## Before you say a change is done

```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest -q
TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:<port>/festive_test uv run pytest -q   # when touching SQL, models or migrations
```

Never report something as passing unless you ran it. SQLite hides real Postgres behaviour (locking, constraints,
timezones), so anything involving transactions, concurrency or migrations needs the Postgres run.

## Structure rules (enforced by `tests/test_architecture.py`)

* One feature = one folder under `src/festiveos/`: `models, schemas, repository, service, dependencies, router`.
* Layers import only downward: `router -> dependencies -> service -> repository -> models`. Routers never import
  repositories or models; repositories never import services or schemas.
* Features depend one way (see the table in the test). Do not add an import that creates a cycle. If two features need
  each other, move the shared piece down a level.
* `core/`, `db/`, `integrations/` and `config.py` are the shared kernel: they never import a feature
  (`db/registry.py` is the one exception, on purpose).
* Imports are absolute (`from festiveos.x.y import ...`). No `sys.path` tricks. No relative imports.

## Rate limiting rules (details in `docs/rate-limiting.md`)

* Every route carries a policy from `core/limits.py` (`dependencies=[Depends(limits.read)]` and friends). A route without
  one fails `tests/test_rate_limits_api.py`. Pre-authentication routes are limited per address, the rest per user.
* Never log or store a raw address, token or id in a limiter key; use the digest helpers already in `core/ratelimit.py`.
* `X-Forwarded-For` is only trusted through `TRUSTED_PROXY_COUNT`. Do not read it anywhere else.
* The limiter must never fail a request because Redis did, and never block the event loop with a network call.
* `TEST_REDIS_URL` runs the Redis tests against a real server; without it they are skipped, not faked.

## AI rules (details in `docs/ai.md`)

* The model never writes data and never does arithmetic: writes go through `propose_action` + a human-approved confirm
  card, numbers through `calculate_hosting`. Add a new write as an entry in `ai/actions.py`, not as a new tool.
* The cached prefix (tools + instructions) must be identical for every user and request: no dates, names, ids or
  flags in `ai/prompts/`, no per-user tool list. Change a prompt by adding a new `v<N>` folder.
* Conversation history is append-only and stored as `json` (not `jsonb`). Never edit or delete an earlier message.
* Release the database connection before a model call. Never log message content.
* Every new AI route carries the `ai_turn` and `ai_daily` limits if it reaches the model.

## Money rules (details in `docs/groups-and-expenses.md`)

* Money is integer minor units (paise) in the database, the API and every calculation. Never a float.
* Splits go through `expenses/splits.py` so shares always sum to the total; never divide money inline.
* Balances are computed from the ledger on read, never stored.
* A ledger row that references a user must survive that user's deletion (`ON DELETE SET NULL`).
* Every search query is scoped to the caller's groups; user input in a `LIKE` is escaped.

## Calendar rules (details in `docs/religions-and-calendars.md`)

* Never type a festival date into code or a test from memory or from this codebase's own output. Golden dates in
  `tests/panchang/` must be confirmed against a published source (Drik Panchang, a government or community
  committee) and named as such. If a rule disagrees with a published date, fix the rule, not the expectation.
* The panchang is computed, not stored. Sunrise decides the day, so every panchang call needs a place.
* Islamic dates are *expected* and must be labelled so. Do not present a sighting estimate as certain.
* Do not use sacred symbols (Om, Khanda, Ik Onkar, the cross, calligraphy of divine names) as decoration.
* A person's coordinates are never stored or logged server-side; only a city key is. Detected location lives on the phone.
* Show a person only the calendar blocks for their own faiths (no Rahu Kalam for a Muslim or Christian user).
* Audio is link-out only. Add well-known works only; do not invent performers, albums or URLs.

## Concurrency rules (details in `docs/concurrency.md`)

* Lock order, never reversed: household -> household members -> auth session -> refresh tokens -> user. Lock several rows
  of one kind in id order. Housekeeping uses `SKIP LOCKED`.
* One database connection per request; never hold a lock across a network call.
* A new multi-row lock sequence needs a forced-interleaving test in `tests/db/test_concurrency.py`.
* A new table with a second `ON DELETE CASCADE` path must be reviewed and added to `KNOWN_CASCADE_DIAMONDS`.

## Dependencies

`uv.lock` is the source of truth. After `uv add`, update `requirements.txt` / `requirements-dev.txt` (exact pins, grouped
by purpose, no prose). `tests/test_dependencies.py` enforces that they match.

## Code rules

* Errors: raise the domain errors in `core/errors.py` (`NotFoundError`, `ConflictError`, ...); `main.py` maps them to
  HTTP. Never catch and swallow. Preserve the cause (`raise ... from exc`).
* Authorization is enforced in services on every object access, not only in the router. A non-member gets **404**, never
  403, so ids cannot be probed. Use `HouseholdAccess`.
* Request bodies subclass `core.schemas.InputModel` (strips whitespace, rejects unknown fields).
* Transactions: the service commits. Take row locks (`with_for_update`) when a rule spans rows, e.g. "keep one admin".
* No N+1: relationships are `lazy="raise"`; load them explicitly with `selectinload`. Add a query-count test.
* Never log secrets or personal data. The logging aspect already replaces every string argument with `<str>`.
* Migrations: one numbered file in `migrations/versions/`, reversible, safe on existing data. Test up and down on Postgres.
* Tests: a bug fix starts with a test that fails first. Tests assert behaviour, not implementation. Helpers go in
  `tests/support.py`, fixtures in `tests/conftest.py`; test files never import from each other.
* Configuration is environment variables, validated at startup, documented in the README by **name only**. Never read,
  print or commit `.env` values.

## Things deliberately not done yet

Rate limiting (see `docs/rate-limiting.md`), a Dockerfile / CI pipeline, and static type checking (mypy/pyright).
There is deliberately no `scripts/` folder: developer-only tooling that mints sessions or seeds data does not belong in
the production repository.
