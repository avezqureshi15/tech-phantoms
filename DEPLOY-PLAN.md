# AWS Deployment Plan — single EC2, Docker Compose

**Target account:** `265544357949` (IAM user `recruit-deploy`, profile `recruit`)
**Region:** `ap-south-1` (Mumbai)
**Account state:** empty — no ECS, RDS, S3, ECR. Only the default VPC `vpc-0d011f113516d3c7e`.
**Repo state:** no Dockerfiles, no IaC, no CI. All new work.

**Scope:** `mobile/backend`, `web/server`, `web/client`. The Expo app (`mobile/frontend`) is **not deployed** — it is excluded entirely, and the only trace of it here is the API URL it would eventually point at.

> **Status: plan only — implementation will be carried out separately by another model.**
> Nothing in this document has been built, and no AWS resources have been created. Every file listed in §10 is still to be written, and the two code edits in §4.1 and §4.2 are still to be applied. This file is the specification handed to whoever implements it; it is written to be followed without further context from the session that produced it.

---

## 1. The short answer: yes, and it's the better fit

One EC2 box running Docker Compose is not a compromise here — for a POC it is actively *better* than the ECS design, because it removes two of the three blockers that design had to work around.

| Problem with the ECS/ALB design | On a single EC2 box |
|---|---|
| `audio-store.ts` keeps Twilio audio in a process-local `Map`; two tasks behind an ALB → Twilio fetches land on the wrong one | **Gone.** One process, one Map. No code change needed. |
| Session cookie is `SameSite=Lax`; SPA on CloudFront + API on ALB are cross-site → cookie silently dropped | **Gone.** One origin serves SPA and both APIs. Same-site by construction, and CORS disappears too. |
| ~$150/mo | **~$40/mo** |
| ~9 days of build | **~4 days** |

What you give up is real and listed in §7 — it is availability and scale, not security. The security posture below is not meaningfully weaker than the ECS one.

---

## 2. Architecture

A single instance, one public entrypoint, everything else on a private Docker network with **no host ports published**:

```
                    Internet
                       │  443 / 80 only
         ┌─────────────┴──────────────┐
         │  EC2 t3.medium, public subnet
         │  SG: 443 + 80 from 0.0.0.0/0. SSH CLOSED.
         │  Encrypted EBS (KMS CMK) · IMDSv2 required
         │
         │  ┌──────────────────────────────────────┐
         │  │ caddy        :443/:80  ← only exposed │
         │  │   /api/v1/*  → festiveos:8000         │
         │  │   /api/*     → diya-server:4000       │
         │  │   /*         → web/client static      │
         │  ├──────────────────────────────────────┤
         │  │ diya-server      :4000  (internal)    │
         │  │ festiveos-api    :8000  (internal)    │
         │  │ postgres         :5432  (internal)    │
         │  │ valkey           :6379  (internal)    │
         │  └──────────── docker network ──────────┘
         └────────────────────────────────────────────┘
                 │ nightly pg_dump          │ secrets at boot
                 ▼                          ▼
          S3 (SSE-KMS, versioned)    Secrets Manager
```

### The routing works out cleanly

This is worth checking because it's the kind of thing that derails a day: the two backends do **not** collide.

* `mobile/backend` serves everything under `/api/v1` (`API_PREFIX` in [main.py:35](mobile/backend/src/festiveos/main.py:35)).
* `web/server` serves `/api/auth`, `/api/platform`, `/api/tenant`, `/api/queries`, `/api/calls`, `/api/knowledge`, `/api/console`, `/api/voice`, `/api/demo`, `/api/twilio`, `/api/approvals`, `/api/audio`, `/api/health` — **no `/api/v1`**.

So a longest-prefix match on `/api/v1/*` → FastAPI, `/api/*` → Express is unambiguous, and **neither backend needs its path rewritten**. Both keep the prefixes they already expect.

Resulting URLs on one domain:

| Path | Serves |
|---|---|
| `https://<domain>/` | React SPA |
| `https://<domain>/api/v1/...` | FastAPI |
| `https://<domain>/api/...` | Express |

`VITE_API_BASE_URL` becomes `""` (same origin — no CORS preflight at all), and the Expo app, whenever it ships, points at `https://<domain>/api/v1`.

### Caddyfile

Caddy over nginx specifically because it obtains and renews the Let's Encrypt certificate automatically with no certbot cron to forget about.

```
<domain> {
    encode gzip zstd

    handle /api/v1/* {
        reverse_proxy festiveos-api:8000
    }
    handle /api/* {
        reverse_proxy diya-server:4000
    }
    handle {
        reverse_proxy web-client:80      # nginx container serving the built SPA
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

`reverse_proxy` sets `X-Forwarded-For` / `-Proto` by default — which matters, see §4.

### compose.prod.yaml shape

A YAML anchor must be defined **before** any alias that uses it, so `x-logging` comes first.

```yaml
x-logging: &default-logging
  driver: json-file
  options: { max-size: "10m", max-file: "3" }

services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]          # the only published ports
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data                 # LE certs — must persist
      - caddy-config:/config
    depends_on: [web-client, diya-server, festiveos-api]
    logging: *default-logging
    restart: unless-stopped

  web-client:
    image: <acct>.dkr.ecr.ap-south-1.amazonaws.com/diya-client:<sha>
    # NO ports: — only Caddy reaches it
    mem_limit: 64m
    logging: *default-logging
    restart: unless-stopped

  diya-server:
    image: <acct>.dkr.ecr.ap-south-1.amazonaws.com/diya-server:<sha>
    env_file: /run/secrets/diya-server.env   # tmpfs, 0600, see §5.1
    environment:
      NODE_ENV: production
      PORT: "4000"
    mem_limit: 768m
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s
    depends_on: { postgres: { condition: service_healthy } }
    logging: *default-logging
    restart: unless-stopped

  festiveos-api:
    image: <acct>.dkr.ecr.ap-south-1.amazonaws.com/festiveos-backend:<sha>
    env_file: /run/secrets/festiveos.env
    environment:
      TRUSTED_PROXY_COUNT: "1"
      RATE_LIMIT_ENABLED: "true"
      RATE_LIMIT_REDIS_URL: redis://valkey:6379/0
      # ENABLE_API_DOCS deliberately unset → /docs and /openapi.json stay 404
    mem_limit: 768m
    healthcheck:
      # /health/live only — /health/ready touches the DB and would cycle
      # every container at once on a brief database blip.
      test: ["CMD-SHELL", "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/live').status==200 else 1)\""]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s
    depends_on:
      postgres: { condition: service_healthy }
      valkey:   { condition: service_started }
    logging: *default-logging
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine     # replace with the TLS-enabled build, see §3
    # NO ports: — reachable only on the docker network
    env_file: /run/secrets/postgres.env   # POSTGRES_PASSWORD, from tmpfs
    environment:
      POSTGRES_DB: diya
      POSTGRES_USER: diya
    volumes:
      - pg-data:/var/lib/postgresql/data
      - ./postgres-init.sql:/docker-entrypoint-initdb.d/10-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U diya"]
      interval: 5s
      retries: 12
    logging: *default-logging
    restart: unless-stopped

  valkey:
    image: valkey/valkey:8-alpine
    # NO ports:
    command: ["valkey-server", "--save", "", "--appendonly", "no"]
    mem_limit: 256m
    logging: *default-logging
    restart: unless-stopped

volumes: { pg-data: {}, caddy-data: {}, caddy-config: {} }
```

`mem_limit` and `logging` on every service are not decoration — on one box, a runaway container starves the others, and an unbounded container log filling the EBS volume is the single most common way a box like this dies at 3am.

Three things the implementer must not miss here: `postgres-init.sql` only runs on an **empty** data volume (it is ignored on every later start, so the roles in §3 must exist before any app connects); `env_file` paths are read on the **host** at `docker compose` time, which is why the tmpfs path works; and `/docker-entrypoint-initdb.d` ordering is lexical, hence the `10-` prefix.

### 2.1 The build-and-deploy chain — Dockerfiles are the deployment unit

**Every one of the three services we deploy is a Docker image built from a Dockerfile in this repo.** Nothing is deployed any other way: there is no `git pull` on the server, no `npm install` on the server, no build toolchain on the server at all. The instance only ever pulls tagged images and runs them.

| Service | Dockerfile | Base image | Built artifact | ECR repo |
|---|---|---|---|---|
| `web/client` | `web/client/Dockerfile` | `node:24-alpine` → `nginx:alpine` | Vite `dist/` baked into nginx | `diya-client` |
| `web/server` | `web/server/Dockerfile` | `node:24-alpine` | `dist/` + generated Prisma client | `diya-server` |
| `mobile/backend` | `mobile/backend/Dockerfile` | `python:3.12-slim` | venv + `src/festiveos` | `festiveos-backend` |

Plus three images pulled straight from upstream, never built: `caddy:2-alpine`, `postgres:16-alpine`, `valkey/valkey:8-alpine`.

The chain, end to end:

```
git push main
   └─► GitHub Actions (OIDC, no AWS keys)
         ├─ lint + test all three
         ├─ docker build × 3   ──tag <commit-sha>──► ECR × 3
         └─ ssm:SendCommand to the instance
               └─► docker compose pull          (fetch the 3 new images)
                   docker compose run --rm  alembic upgrade head
                   docker compose run --rm  prisma migrate deploy
                   docker compose up -d          (recreate changed containers)
                   curl -f https://<domain>/api/health
```

Rollback is `docker compose up -d` pinned to the previous SHA — all three services roll back together, because all three are images.

**One consequence worth stating:** `web/client` is a Vite build, and Vite inlines `VITE_API_BASE_URL` at **build time**, not run time. So that value is baked into the image, and the image is environment-specific. Here it is `""` (same origin), which is the same for every environment, so it doesn't bite — but if a `staging` environment ever appears on a different domain, it needs its own build, not just a different env var.

---

## 3. Two databases, one Postgres container

`web/server` (Prisma) and `mobile/backend` (SQLAlchemy) have unrelated schemas. One container, two databases, two roles:

```sql
CREATE DATABASE diya;       CREATE USER diya_app      WITH PASSWORD '…';
CREATE DATABASE festiveos;  CREATE USER festiveos_app WITH PASSWORD '…';
REVOKE ALL ON DATABASE diya      FROM PUBLIC;
REVOKE ALL ON DATABASE festiveos FROM PUBLIC;
GRANT CONNECT ON DATABASE diya      TO diya_app;
GRANT CONNECT ON DATABASE festiveos TO festiveos_app;
-- then, inside each DB, grant only on its own schema
```

Neither app role is a superuser, neither can `CREATEDB`, and neither can connect to the other's database. Run this once from an init script in `/docker-entrypoint-initdb.d/`.

### The TLS wrinkle, and why it's fine here

`mobile/backend` **refuses to start** on `sslmode=disable|allow|prefer` and silently appends `sslmode=require` for any non-loopback host ([config.py](mobile/backend/src/festiveos/config.py)). The Postgres container's hostname is `postgres`, which is not loopback — so it will demand TLS from a container that doesn't serve it, and the app will fail to connect.

Two ways to resolve it, pick one:

1. **Enable TLS on the Postgres container** — generate a self-signed cert into the container, set `ssl=on` in `postgresql.conf`, and keep `sslmode=require`. ~10 lines in the Dockerfile/init script. This is what I'd do: it satisfies the code as written and encrypts the hop, even though that hop never leaves the host.
2. Run Postgres on the host network as `127.0.0.1` so the loopback exemption applies. Simpler, but it publishes a port on the host and undoes the "no published ports" property. Not recommended.

The traffic is loopback-only on a single box either way, so option 1 is about satisfying the code's contract, not about a real in-path attacker.

### Durability — the honest version

Postgres in a container means **you own the backups**. If the instance is terminated without a snapshot, the data is gone. Mitigations, both cheap and both required:

* Nightly `pg_dump` of both databases → gzip → `aws s3 cp` to a versioned, SSE-KMS bucket with a 30-day lifecycle. A systemd timer, ~15 lines.
* Daily EBS snapshot via Data Lifecycle Manager, 7-day retention.

If the data ever stops being disposable demo data, move to RDS (+~$30/mo) and get automated backups and point-in-time recovery instead of a homemade script. For a POC, the script is proportionate — but it has to actually exist, and the restore has to be tested once (§9.7).

---

## 4. Code changes required — three of them

The single-box design removes the audio-store and cookie problems. These three remain, and two are new consequences of putting a reverse proxy in front.

### 4.1 Express needs `trust proxy` — otherwise every audit log says `127.0.0.1`

`web/server` records `req.ip` into the audit trail in at least nine places ([auth.ts:80](web/server/src/routes/auth.ts:80), [calls.ts:167](web/server/src/routes/calls.ts:167), and others), and `app.set("trust proxy", …)` is never called. Behind Caddy, `req.ip` becomes the proxy's address for every request — so the sign-in, sign-out, password-change and call-placement audit records all log the same useless IP.

One line in [createApp()](web/server/src/app.ts:24):

```ts
app.set("trust proxy", 1);   // exactly one proxy (Caddy) in front
```

Use `1`, not `true`. `true` trusts the whole `X-Forwarded-For` chain, which lets a client forge its own source IP by sending the header — in an audit log, that is worse than logging nothing.

### 4.2 FastAPI needs `TRUSTED_PROXY_COUNT=1` — otherwise rate limiting collapses

`trusted_proxy_count` defaults to `0` ([config.py:57](mobile/backend/src/festiveos/config.py:57)) and feeds `client_ip()` for the rate-limit bucket key ([ratelimit.py:302](mobile/backend/src/festiveos/core/ratelimit.py:302)). At `0` behind a proxy, every request resolves to Caddy's IP, so **all users share one rate-limit bucket** — a single busy client locks out everyone, and a per-IP limit becomes a global one.

Config only, already in the compose file above. No code change.

### 4.3 Prisma has no migration history

`web/server/prisma/` has `schema.prisma` and seeds but **no `migrations/` directory** — the workflow is `prisma db push`, which diffs against the live database and can drop columns with no warning and no history.

Before the first deploy: run `npx prisma migrate dev --name init` against a scratch database and commit `prisma/migrations/`. The deploy then runs `prisma migrate deploy`, which is ordered, additive and auditable. Alembic on the FastAPI side is already correct (13 revisions).

### 4.4 Not a code change, but a hard constraint: you need a real domain

`getPublicBaseUrl()` ([guards.ts:43](web/server/src/call/guards.ts:43)) rejects a `PUBLIC_BASE_URL` that is HTTP, has a path/query/fragment, is `localhost`, **or is a bare IP address** (`isIP(url.hostname) !== 0`). And `validateTwilioWebhook` builds the signature's canonical URL as `base.origin + req.originalUrl`, so `PUBLIC_BASE_URL` must match what Twilio actually dialled, exactly.

So `https://13.234.x.x` will not work, and neither will anything without a trusted certificate — Twilio will not post to a self-signed endpoint.

* **Recommended:** register a domain (~$12/yr in Route 53), point an A record at the Elastic IP, let Caddy get the Let's Encrypt cert automatically. Also the only option that makes the SPA look like a product rather than a demo.
* **Free fallback:** a DuckDNS subdomain works with Let's Encrypt. Fine for an internal demo, visibly a demo.
* **Won't work:** the `ec2-….ap-south-1.compute.amazonaws.com` hostname — Let's Encrypt refuses to issue for it.

Good news: the signature check uses `PUBLIC_BASE_URL`, **not** the proxy headers, so it works behind Caddy as long as the path isn't rewritten. The Caddyfile in §2 preserves paths.

---

## 5. Security — what a single box does and doesn't cost you

The usual objection to one EC2 box is that it throws away network isolation. It mostly doesn't, provided the following hold. Several of these are *stronger* than the ECS equivalent.

| Control | How |
|---|---|
| **No database on the network** | Postgres and Valkey publish **no host ports**. They exist only on the Docker bridge. Not reachable from the internet, from the VPC, or from another instance — arguably tighter than a private subnet, where anything in the VPC can still route to them. |
| **No SSH** | Port 22 closed in the security group, no key pair on the instance. Administration via **SSM Session Manager** — IAM-controlled, logged to CloudTrail, no inbound port. |
| **Only 443/80 inbound** | Security group allows nothing else. 80 exists solely for the Let's Encrypt HTTP-01 challenge and the redirect to 443. |
| **IMDSv2 required**, hop limit 1 | Both backends make outbound calls to OpenAI/Sarvam/Twilio/Google. An SSRF in a container must not be able to read the instance credentials. Hop limit 1 stops a container reaching the metadata endpoint at all. |
| **Encryption at rest** | EBS encrypted with a customer-managed KMS key (rotation on). S3 backup bucket SSE-KMS, versioned, Block Public Access fully on. ECR encrypted with the same CMK. |
| **Encryption in transit** | TLS 1.2+ at Caddy with HSTS. Postgres TLS per §3. All third-party calls are HTTPS. |
| **Least-privilege instance profile** | `AmazonSSMManagedInstanceCore`, `secretsmanager:GetSecretValue` on **the two specific secret ARNs**, `kms:Decrypt` scoped by `kms:ViaService`, `s3:PutObject` on **one prefix** of the backup bucket, ECR pull on **the three specific repo ARNs**. No wildcard resource anywhere. |
| **No secrets on disk** | §5.1 below. |
| **Containers unprivileged** | Non-root user in both app images, `no-new-privileges`, read-only root filesystem where the app allows, `mem_limit` on every service. |
| **Host patching** | `dnf-automatic` for security updates on Amazon Linux 2023, or rebuild the instance from a fresh AMI monthly. |

### 5.1 Secrets handling

No task-definition `secrets` block here, so the pattern has to be deliberate. **Never** a `.env` committed to the repo, and **never** a plaintext env file sitting on the EBS volume.

At boot, a systemd unit ordered before Docker:

1. Mounts a **tmpfs** at `/run/secrets` (RAM only, mode `0700`, root-owned — never touches disk, gone on reboot).
2. `aws secretsmanager get-secret-value` for each secret, using the instance profile — no access key anywhere on the box.
3. Writes `/run/secrets/diya-server.env` and `/run/secrets/festiveos.env`, mode `0600`.
4. Compose reads them via `env_file`.

Secrets held: `DATABASE_URL` ×2, `JWT_SECRET`, `OPENAI_API_KEY`, `SARVAM_API_KEY`, `FLAGSMITH_SERVER_KEY` (server key, never the client one), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `APPROVAL_CALLBACK_SECRET`, `NUDGEBEE_WEBHOOK_URL`, the Postgres password.

Rotation is manual re-run of the unit + `docker compose up -d`. Acceptable at this scale; note that it is a step down from ECS, which re-reads secrets on each task start.

### 5.2 The honest deviation

Everything runs on one host, so **a container escape or a host compromise reaches the database**. On the ECS design, the database sits in an isolated subnet and a compromised task still has to cross a security group boundary. That gap is real and no amount of hardening closes it.

For a POC with demo data it is a reasonable trade. It would not be reasonable with real customer PII or real payment data — and the Twilio integration means real phone numbers can end up in this database (`DEMO_VERIFIED_NUMBERS` exists precisely because trial accounts need verified real numbers). Treat phone numbers as personal data: keep them out of tracked files, keep the backup bucket private and encrypted, and delete the environment when the POC ends.

**DEVELOPMENT / POC ONLY — this single-host topology is not an appropriate production architecture for customer data.**

---

## 6. Phased plan

### Phase 0 — Decisions and prerequisites (~0.5 d)

1. **Domain** — register or identify one, confirm it can get a Route 53 A record. Blocking for Twilio (§4.4). See §11 Q1.
2. Collect production credentials for OpenAI, Sarvam, Flagsmith (server key), Twilio, NudgeBee, Google OAuth client IDs. Straight into Secrets Manager — never into a repo file.
3. Confirm Twilio account status: trial accounts can only dial verified numbers. Outbound calling stays off until there's an upgraded account and a purchased Indian number.
4. Decide Postgres-in-container vs RDS (§3, Q2).

### Phase 1 — Containerize and verify locally (~1 d)

New files:

* `web/server/Dockerfile` — multi-stage. Builder: `node:24-alpine`, `npm ci`, `npx prisma generate` (the client lands in `src/generated/prisma`, which is gitignored, so this is **mandatory**), `npm run build`. Runtime: `npm ci --omit=dev`, copy `dist/` + generated client, `USER node`.
* `mobile/backend/Dockerfile` — `python:3.12-slim`, venv built in a builder stage and copied to a clean runtime, non-root user, `uvicorn festiveos.main:app --host 0.0.0.0 --port 8000 --workers 2`.
* `web/client/Dockerfile` — multi-stage. Builder: `node:24-alpine`, `npm ci`, `npm run build` (which is `tsc -b && vite build`). Runtime: `nginx:alpine` serving `/usr/share/nginx/html` with a `try_files $uri /index.html` rule so `react-router-dom` owns the paths. Non-root `nginx-unprivileged` variant, listening on 8080 if you prefer no root at all.
* `.dockerignore` for all three — must exclude `.env*`, `node_modules`, `.git`, `tests`. An `.env` baked into an image layer is the most common credential leak in this kind of setup.
* `Caddyfile`, `compose.prod.yaml`, the Postgres init script, the secrets systemd unit, the backup timer.
* Extend the existing `compose.yaml` for local use so the exact production images run against local Postgres first.

Apply the two config/code fixes from §4.1 and §4.2 here.

**Exit criterion:** locally, `https://localhost` serves the SPA, `/api/health` and `/api/v1/...` both answer through Caddy, and the SPA can log in and perform a mutation.

### Phase 2 — AWS foundation (~0.5 d)

Small enough to do with CLI or a single Terraform/CDK stack — at this size, Terraform is the lighter choice, but either is fine (Q3).

* VPC: the default VPC is adequate for one public instance, but a small dedicated VPC (one public subnet, IGW, no NAT needed since the instance has a public IP) keeps it tidy and costs nothing extra.
* KMS CMK with rotation; Elastic IP; security group per §5; IAM instance profile per §5.
* ECR repos `diya-client`, `diya-server`, `festiveos-backend` — scan on push, immutable tags, lifecycle keeping the last 10 images.
* S3 backup bucket — versioned, SSE-KMS, Block Public Access on, 30-day lifecycle.
* Secrets Manager secrets, populated by hand.
* EC2 `t3.medium` (4 GB) on Amazon Linux 2023, encrypted 30 GB gp3 root volume, IMDSv2 required, user-data installing Docker + the Compose plugin + the SSM agent.
  *`t3.small` (2 GB) saves ~$15/mo and will run the stack, but leaves no headroom for Postgres plus two runtimes under load. `t3.medium` with 2 GB swap is the safer call.*

### Phase 3 — First deploy (~0.5 d)

1. Build all three images in GitHub Actions, tag with the commit SHA, push to ECR. (Building on the box instead keeps setup simpler but puts source and build toolchains on the server and risks an OOM during the Vite + `tsc` build — ECR is worth the small extra setup.)
2. The SPA is built **inside its own image** with `VITE_API_BASE_URL=""` — no separate upload step, no `dist/` on the host.
3. Point the domain's A record at the Elastic IP, let Caddy obtain the certificate.
4. Run migrations as one-off containers: `alembic upgrade head` and `prisma migrate deploy`. Order: migrations succeed → then `docker compose up -d`.
5. Bootstrap the first operator with `npm run bootstrap:admin` (stores no password; the invite flow handles credentials).
6. Leave `prisma:seed-outbound` / `bootstrap:demo` alone unless a seeded demo tenant is genuinely wanted.

### Phase 4 — External integrations (~0.5 d)

* `PUBLIC_BASE_URL=https://<domain>`, and the Twilio number's voice webhook set to `https://<domain>/api/twilio/...` — they must match exactly or signature validation fails.
* `NUDGEBEE_WEBHOOK_URL` out; its callback returns to `/api/approvals`, verified by `APPROVAL_CALLBACK_SECRET`.
* Google OAuth production client IDs into `GOOGLE_CLIENT_IDS` for FastAPI.
* Flagsmith production environment, **server-side** key for both backends.
* Keep `OUTBOUND_CALLING_ENABLED=false` for the first deploy — it is fail-closed by design. Flip it only after a supervised test call, and check `CALL_WINDOW_START`/`END` are in the intended timezone before any real number is dialled.

### Phase 5 — CI/CD (~0.75 d)

GitHub Actions with **OIDC federation — no AWS access keys in GitHub secrets**. A role trusting `token.actions.githubusercontent.com`, conditioned on `repo:<org>/<repo>:ref:refs/heads/main`, allowed only to push to the three ECR repos and `ssm:SendCommand` to the one instance. No S3 write is needed for deploys — the backup bucket is written by the instance, not by CI.

Pipeline: lint + test (`npm test` in `web/server`, `pytest` in `mobile/backend`, `oxlint` in `web/client`) → build and push all three images tagged with the SHA (never `latest`) → `ssm:SendCommand` runs `docker compose pull && <migrations> && docker compose up -d` → health check → done.

Deploying by SSM rather than SSH means no key, no open port, and a CloudTrail record of every deploy.

### Phase 6 — Backups, monitoring, cost control (~0.5 d)

* Nightly `pg_dump` → S3 systemd timer; daily EBS snapshot via Data Lifecycle Manager.
* CloudWatch agent for memory and disk (neither is a default EC2 metric). Alarms: `StatusCheckFailed` with **EC2 auto-recovery** action, disk >80%, memory >85%, and a Caddy-level 5xx check.
* An external uptime ping (free tier of any provider) hitting `/api/health` — on one box, "is it up" is the only monitoring question that really matters.
* AWS Budget with alerts at 50/80/100%.

### Phase 7 — Verification (§9) (~0.75 d)

**Total ≈ 4 working days**, against ~9 for the ECS design.

---

## 7. What you're giving up — read this before committing

None of these are reasons not to do it for a POC. They are reasons to know when to stop doing it.

1. **No redundancy at all.** Instance failure, AZ failure, or a bad `docker compose up` takes the whole product down — SPA, both APIs, database. There is no second anything.
2. **Deploys cause downtime.** `docker compose up -d` recreates changed containers; expect a few seconds of 502. Caddy will retry, but an in-flight Twilio call will drop.
3. **Vertical scaling only.** More load means a bigger instance and a reboot. And `audio-store.ts` now *depends* on there being one process — scaling out later is blocked until it moves to S3 or Valkey.
4. **You own the database's survival.** No automated backups, no point-in-time recovery, no managed failover. The backup script in §3 is not optional and the restore must be tested.
5. **One blast radius.** §5.2. A container escape reaches the database.
6. **Manual OS patching**, where Fargate would have given you a fresh host on every task start.
7. **Noisy neighbours.** Four services share 4 GB and 2 vCPU. The `mem_limit`s stop one from killing the others, but a heavy Prisma query and an AI turn will contend.

**Graduate to ECS when** real users depend on uptime, more than one person deploys, you need zero-downtime deploys, or the data stops being disposable. The Dockerfiles from Phase 1 carry over unchanged — that work is not wasted, which is the main reason this path isn't a dead end.

---

## 8. Cost

Approximate, ap-south-1, on-demand:

| Item | ~USD/mo |
|---|---|
| EC2 `t3.medium` | 30 |
| EBS 30 GB gp3 + snapshots | 4 |
| Public IPv4 address | 4 |
| ECR (3 repos, few images) | 1 |
| S3 (database backups) | 1 |
| Secrets Manager (2 secrets) | 1 |
| CloudWatch (agent metrics, alarms) | 2 |
| **Total** | **~43** |

`t3.small` instead: ~**$28/mo**. A 1-year Compute Savings Plan on the instance: ~**$33/mo** total. Domain ~$12/yr.

Excludes third-party usage — OpenAI, Sarvam and Twilio per-minute charges will likely exceed the infrastructure cost for a calling product.

Compare: ~$150/mo for the ECS + ALB + RDS + NAT design.

---

## 9. Verification checklist

1. `https://<domain>/` serves the SPA with a valid certificate; HTTP redirects to HTTPS.
2. `https://<domain>/api/health` → `{"ok":true}`; `https://<domain>/api/v1/...` reaches FastAPI. Both through Caddy, confirming the prefix split.
3. Log in; in devtools confirm the session cookie has `Secure`, `HttpOnly`, `SameSite=Lax` — and that it is **sent** on the next API call. Same-origin should make this trivial; if it fails, the routing is wrong.
4. Perform a mutation (create a query) — proves the `requireTrustedOrigin` CSRF check passes.
5. An audit record shows a **real client IP**, not `127.0.0.1` — proves §4.1 landed.
6. A Twilio test call completes, and `/api/audio/<id>` serves audio back to Twilio — proves `PUBLIC_BASE_URL` matches and signature validation passes.
7. **Restore drill:** pull last night's dump from S3 into a scratch Postgres and confirm it loads. An untested backup is not a backup.
8. `https://<domain>/api/v1/docs` and `/openapi.json` return **404** — `ENABLE_API_DOCS` must stay unset.
9. From outside: `nmap` the Elastic IP and confirm only 80/443 answer. No 22, no 5432, no 6379.
10. Confirm SSM Session Manager connects with no key pair and no open port.
11. Tenant isolation: a user of tenant A cannot read tenant B's data through the deployed API. (`web/server` already routes everything through `src/db/scoped.ts` with `tenantId` on every table — this just confirms it survived deployment.)
12. Reboot the instance and confirm everything comes back: `restart: unless-stopped` plus the secrets unit ordered before Docker.

---

## 10. New files — and how complete this spec is

**Read this first if you are implementing from this document.** This is an architecture specification, not a runbook. The decisions, constraints and failure modes are settled; most of the artefacts are not yet written. Expect to author the files below rather than copy them.

| Artefact | State in this document |
|---|---|
| `Caddyfile` | **Near-complete** (§2) — add the `:80` redirect block |
| `compose.prod.yaml` | **Near-complete** (§2) — replace `<acct>` and `<sha>` |
| §4.1 Express `trust proxy` edit | **Exact** — one line, given verbatim |
| §4.2 FastAPI `TRUSTED_PROXY_COUNT` | **Exact** — config only, already in the compose |
| 3 × `Dockerfile` | **Prose only** — base image and steps described, not written |
| `web/client/nginx.conf` | **Prose only** |
| `postgres-init.sql` | **Partial** (§3) — the per-schema `GRANT`s are a comment, not SQL |
| Postgres TLS build (§3 option 1) | **Prose only** — "~10 lines", and fiddly: Postgres rejects a key file that is group- or world-readable, and the cert must be owned by the `postgres` uid |
| `fetch-secrets.service` | **Prose only** — four steps described (§5.1) |
| `backup-postgres.{service,timer}` | **Prose only** — "~15 lines" |
| `user-data.sh` | **Prose only** |
| `infra/` Terraform or CDK | **Resource list only** — no code |
| `.github/workflows/deploy.yml` | **Pipeline described** (§2.1, Phase 5) — no YAML |

**Decisions still open:** Q1–Q6 in §11. **Q1 (the domain) is blocking** — the implementer cannot complete Phase 3 without it and should stop and ask rather than guess.

**Assumptions in this document that were never executed.** Nothing here has been built or run; these are reasoned from the source, and each is a plausible place to lose an hour:

* `npm ci` works with the build context set to `web/server` and `web/client` — both have their own `package-lock.json`, verified. The build context is **not** the repo root, which also has one (for `concurrently` only).
* `npx prisma generate` inside the Docker build produces the client at `src/generated/prisma`. That path is gitignored, so it will not be in the build context — generating it is mandatory, and skipping it fails at runtime, not build time.
* The Vite + `tsc -b` build fits in a `t3.medium` build if images are ever built on the box. This is one reason Phase 3 builds in CI instead.
* Caddy's longest-prefix `handle` ordering routes `/api/v1/*` to FastAPI before `/api/*` matches. Verify with a request to each before wiring Twilio.

```
web/client/Dockerfile                 web/client/.dockerignore     # node build → nginx
web/client/nginx.conf                 # try_files → /index.html for react-router
web/server/Dockerfile                 web/server/.dockerignore
mobile/backend/Dockerfile             mobile/backend/.dockerignore
web/server/prisma/migrations/         # baseline — see §4.3
deploy/Caddyfile
deploy/compose.prod.yaml
deploy/postgres-init.sql              # two DBs, two scoped roles
deploy/fetch-secrets.service          # tmpfs + Secrets Manager, before docker
deploy/backup-postgres.{service,timer}
deploy/user-data.sh
infra/                                # Terraform or CDK — VPC, SG, EC2, ECR, S3, KMS, IAM
.github/workflows/deploy.yml
```

Plus the two small edits in §4.1 (`app.set("trust proxy", 1)`) and §4.2 (config only).

---

## 11. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Which domain? Registered in Route 53 in this account, or transferring DNS? **Blocking** — Twilio needs a trusted cert on a non-IP hostname (§4.4). | Register a cheap domain in Route 53 |
| Q2 | Postgres in a container, or RDS (+~$30/mo, managed backups and PITR)? | Container + nightly dump to S3 |
| Q3 | Terraform or CDK for the small amount of infrastructure here? | Terraform — lighter at this size |
| Q4 | `t3.medium` (4 GB, headroom) or `t3.small` (2 GB, ~$15/mo cheaper)? | `t3.medium` |
| Q5 | Build images in GitHub Actions → ECR, or build on the box from a `git pull`? | GitHub Actions → ECR |
| Q6 | Is the Twilio account upgraded with a purchased Indian number? | Assume trial; outbound calling stays off |

---

## Appendix — the ECS design, for later

The previous revision of this plan (ECS Fargate, ALB, RDS Multi-AZ, CloudFront, WAF, NAT per AZ) remains the right target once uptime matters. It is in this file's git history. Moving there later needs: the same Dockerfiles, task definitions, an ALB, and the `audio-store.ts` fix from §7.3 — roughly 4–5 days on top of what Phase 1 already produces.
