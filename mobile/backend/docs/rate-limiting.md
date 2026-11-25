# Rate limiting

Implemented in `src/festiveos/core/ratelimit.py` (limiter), `core/limits.py` (policies) and `core/guards.py`
(global backstop and body-size cap). Every route has a policy; `tests/test_rate_limits_api.py` fails the build if one
is added without it.

## Policies

| Policy | Endpoints | Charged to | Limit |
|---|---|---|---|
| `auth.sign_in` | `POST /auth/google` | client address | 10 / minute |
| `auth.refresh` | `POST /auth/refresh` | client address | 30 / minute |
| `auth.logout` | `POST /auth/logout` | client address | 30 / minute |
| `households.create` | `POST /households` | user | 5 / day |
| `members.invite` | `POST /households/{id}/members` | user | 10 / hour |
| `write` | other `POST` / `PATCH` | user | 60 / minute |
| `destructive` | `DELETE /users/me`, `DELETE /households/{id}`, remove member | user | 5 / hour |
| `read` | every `GET` | user | 300 / minute |
| `health` | `/health`, `/health/live`, `/health/ready` | client address | 60 / minute |
| `global` | everything, including unknown paths | client address | 1200 / minute |

The numbers are starting points reasoned from the endpoints, not measurements; there is no production traffic to tune
against. Why each exists: sign-in and refresh are unauthenticated and cost CPU, database writes and outbound calls;
`members.invite` caps the email-existence probe (its answers differ for "no such user" and "added"); `households.create`
and `write` cap spam; `destructive` is rare for real people, so a tight cap costs them nothing; `health` and `global`
protect the process itself.

## Who is charged

* **Pre-authentication endpoints** are charged to the client address.
* **Everything else is charged to the user** (from a signature-verified token, no database lookup), so people behind one
  carrier address do not throttle each other. A caller with a missing or invalid token is charged to their address, which is
  also what stops floods of junk tokens.
* **`X-Forwarded-For` is only believed for the proxies you run.** `TRUSTED_PROXY_COUNT=N` takes the Nth entry from the
  right (the one your own proxy appended); anything a client wrote further left is ignored. With the default `0` the header
  is ignored entirely, so it cannot be used to dodge a limit. Set it to the number of proxies in front of the app, or every
  caller will share the proxy's address.
* **IPv6 callers are grouped by `/64`**, so rotating addresses inside one allocation does not reset the limit.
* Counters, Redis keys and log lines hold a hash of the caller, never the address or id itself.

## How it works

A **sliding-window counter**: usage is the current window's count plus the previous window's count weighted by how much of it
still overlaps, so there is no double burst at a window boundary (a fixed window allows 20 requests in 3 seconds at the
edge; this does not). Only **allowed** requests are counted, so an impatient client never lengthens its own wait, and the
`Retry-After` it is given is exact: waiting that long always succeeds.

Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. A rejection is `429` with
`Retry-After`, a request id, and a WARNING log line (policy, scope, caller hash).

## Backends

| | In-process (default) | Redis (`RATE_LIMIT_REDIS_URL`) |
|---|---|---|
| Scope of a limit | one process | every process and instance |
| Cost per decision | ~1.3 µs | ~113 µs median, ~200 µs p99 (localhost) |
| Memory | bounded: at most 100,000 tracked keys (~33 MB), least-recently-used forgotten first | counters expire after two windows |

Measured with two worker processes and a limit of 10: in-process let **18** requests through (each worker enforces its own
limit), Redis let **exactly 10**. Use Redis whenever more than one process or instance serves traffic.

**If Redis fails**, requests are not failed and limiting is not dropped: the limiter falls back to the in-process one, logs one
warning, and stays off Redis for 5 seconds so a dead Redis costs one timeout, not one per request. While degraded the limits
are per process again. Redis calls use 100 ms socket timeouts and never run on the event loop. Treat the Redis URL as a secret.

## Other guards

* **Request bodies are capped** (`MAX_REQUEST_BYTES`, default 256 KiB) by declared length and by counting streamed bytes: `413`.
* **Every response** is `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
* **Health**: `/health/live` touches nothing (poll it freely); `/health/ready` and `/health` include the database.

## Operating it

```bash
# several workers on one machine, or several instances: share the counters
RATE_LIMIT_REDIS_URL=redis://:password@host:6379/0 TRUSTED_PROXY_COUNT=1 \
  uvicorn festiveos.main:app --workers 4 --no-access-log
```

Set `RATE_LIMIT_ENABLED=false` only to diagnose. Tune a number in `core/limits.py` once there is real traffic: watch the
`rate limited` log lines by `policy` first.

## Not done

* Per-household quotas (a cap on festivals or traditions in total) are a product rule, not a request rate.
* Progressive penalties or block lists for repeat offenders, and bot detection. An edge firewall or CDN is the right layer
  for volumetric attacks; this protects the application, not the network.
* The Redis path uses `INCR` / `DECR` in one round trip rather than a script: it can reject a request a moment early under
  heavy contention at the boundary, but it can never admit more than the limit.
