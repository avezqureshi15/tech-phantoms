# Concurrency: cycle analysis, lock order, and what can still queue

## Cycle analysis

| Graph | Result | Guarded by |
|---|---|---|
| Python module imports (53 modules, 126 edges) | no cycles | `tests/test_architecture.py` |
| Feature-to-feature dependencies | one-way: `users < auth < households < festivals < traditions`, `accounts` on top | `tests/test_architecture.py` |
| Foreign keys (9 tables) | no cycles | `tests/db/test_schema.py` |
| `ON DELETE CASCADE` paths | two diamonds: `refresh_tokens` (via `users` and via `auth_sessions`) and `tradition_occurrences` (via `festivals` and via `traditions`) | `tests/db/test_schema.py` fails if a new one appears |
| Database connections per request | exactly one, so a request can never wait on the pool while holding a connection | `tests/db/test_resilience.py` |
| Lock acquisition order | had four cycles; fixed (below) | `tests/db/test_concurrency.py` |

A cascade diamond means Postgres deletes the shared child in an order of its own choosing. Any transaction that locks
those rows in a different order can deadlock with it, which is why the lock order below exists.

## The lock order

Every transaction acquires locks in this order and never goes back:

1. `households` row (`FOR UPDATE` to change membership or delete, `FOR KEY SHARE` to write things inside it)
2. `household_members` rows (actor first, then target)
3. `auth_sessions` row
4. `refresh_tokens` rows
5. `users` row (deleting it, last)

Where several rows of one kind are locked, they are locked in id order. Housekeeping that is allowed to be incomplete
(purging expired tokens) uses `FOR UPDATE SKIP LOCKED`, so it never waits and cannot take part in a cycle.

## Deadlocks found and fixed

All four were reproduced on real Postgres as `DeadlockDetected` before being fixed, by pausing one transaction at a
chosen statement while another ran.

| Scenario | Cause | Fix |
|---|---|---|
| Sign-in housekeeping vs logout of a dead session | purge deleted tokens then sessions; logout touches the session then its tokens | purge deletes sessions first (tokens follow by cascade), skipping locked rows |
| Token refresh vs account deletion | refresh held a token row and then needed its session; deletion held the session and needed the token | refresh locks the session row first |
| Logout vs account deletion | the user-delete cascade reached sessions and tokens in an order Postgres chose | account deletion removes the user's sessions explicitly, in id order, before the user row |
| A randomised mix of refresh, logout, sign-in and delete | the same causes | covered by the above; the test shuffles the order 25 times |

**Not reproduced:** recording a tradition (locks tradition then festival) racing a household deletion (cascades through
festivals and traditions). Twenty rounds never deadlocked, but the window exists in principle, so recording a tradition now
takes `FOR KEY SHARE` on the household first. That is the row every deleter already locks, so the two queue up before any
child row is held. `test_recording_a_tradition_locks_the_household_before_its_children` pins the order.

## Bounded waits

Every Postgres transaction starts with `SET LOCAL lock_timeout / statement_timeout / idle_in_transaction_session_timeout`
(defaults 5 s, 30 s, 60 s; `DB_LOCK_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`).
`SET LOCAL` lasts one transaction, so it also works behind a transaction-mode pooler. When a deadlock is detected, a lock
wait times out, a statement times out or a serialisation failure happens (SQLSTATE `40P01`, `55P03`, `57014`, `40001`),
the API answers **503** with `Retry-After: 1` and a request id, and logs a WARNING. Any other database error remains a
generic 500.

## Where it can still queue (and why that is acceptable)

* **One household serialises its own membership changes** (promote, demote, remove, leave, delete). It is a single row lock
  held for a few milliseconds, and only contends within one family.
* **Refresh and logout of one session serialise** on that session's row. A well-behaved client refreshes once at a time.
* **Every authenticated request does one extra indexed read** to check its session is still live. It is the price of
  revoking access tokens immediately.
* **The connection pool is the real ceiling**: 15 connections per worker (SQLAlchemy defaults), while the framework runs
  synchronous endpoints on a larger thread pool, so under heavy load requests wait for a connection. The timeouts above
  bound how long a connection can be held; size workers against the database plan's limit.
* **Google's signing keys are fetched on each sign-in**, but outside any database transaction, so a slow response holds no
  connection.

## Rules for new code

* Follow the lock order. If a new path needs two kinds of row, take them in that order, or lock the household first.
* Never hold a lock across a network call, and never take a second connection while holding one.
* Adding a table with a second cascade path is a design decision: add its lock order here and to `KNOWN_CASCADE_DIAMONDS`.
* Add a forced-interleaving test for any new multi-row lock sequence (`pause_before` in `tests/db/test_concurrency.py`).
