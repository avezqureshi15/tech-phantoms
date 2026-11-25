# FestiveOS — AWS deployment and NudgeBee setup

Hand-off for whoever deploys the FestiveOS backend (`mobile/backend`) to AWS and sets up NudgeBee.
The app-side NudgeBee code is being built separately (see section 5); this doc covers everything
outside the codebase, plus the contract both sides must agree on.

**Target:** backend on **EKS**, NudgeBee watching the cluster **and** running an approval workflow
that can switch app features off through Flagsmith. The mobile demo runs in **Expo Go**, pointed at
the deployed HTTPS API.

---

## 1. The story we are demoing

```
FestiveOS backend notices trouble       (Sarvam credits gone, AI provider failing, AI cost spike)
        |
        v  POST webhook (no personal data)
NudgeBee workflow
        |-- notify Discord/Slack: "Voice is failing: 42 errors in 10 min. Turn off utsav_voice?"
        |-- Approval task: a human clicks Approve / Reject
        v  on Approve
HTTP task -> Flagsmith API: set the flag to off
        |
        v
Backend refuses the feature (503) and the app hides it within ~1 minute
```

Three sponsors in one flow: the backend detects, NudgeBee gets a human decision, Flagsmith applies it.
On top of that, NudgeBee's agent on EKS gives cluster monitoring, troubleshooting and cost insights.

---

## 2. AWS architecture

```
Internet
   |
   v
ALB (public subnets, HTTPS only, ACM cert, HTTP -> HTTPS redirect)
   |
   v
EKS nodes / pods (private subnets)  --NAT-->  OpenAI, Sarvam, Flagsmith, NudgeBee SaaS
   |                 |
   v                 v
RDS Postgres     ElastiCache Redis
(private)        (private)
```

Requirements (non-negotiable, client security policy):

- **Only the ALB is public.** Pods, RDS and Redis live in private subnets. Security groups:
  ALB -> pods on 8000 only; pods -> RDS 5432 and Redis 6379 only.
- **Encryption at rest everywhere:** RDS storage encryption (KMS), ElastiCache at-rest encryption,
  encrypted EBS for nodes.
- **Encryption in transit:** HTTPS on the ALB; RDS with TLS (the backend forces `sslmode=require`
  for any non-local database and refuses weaker modes); ElastiCache with in-transit encryption
  (use a `rediss://` URL) and an AUTH token.
- **Secrets in AWS Secrets Manager**, delivered to pods via the Secrets Store CSI driver or External
  Secrets Operator. Nothing in the image, the manifests or the repo.
- **IAM least privilege:** use IRSA (IAM roles for service accounts). The backend's role may only
  `secretsmanager:GetSecretValue` on its own secret ARNs. No wildcard resources.
- **NAT gateway** for outbound HTTPS: the pods call OpenAI, Sarvam and Flagsmith, and the NudgeBee
  agent talks to NudgeBee's SaaS.

### Container

There is no Dockerfile yet. The backend is Python 3.12, managed with `uv`:

```bash
uv sync --frozen --no-dev
uv run alembic upgrade head                       # run as a one-off Job before each rollout
uv run uvicorn festiveos.main:app --host 0.0.0.0 --port 8000 --no-access-log
```

- Run migrations as a Kubernetes **Job** (or init step) before the Deployment rolls, not on every
  pod start.
- Run as a non-root user, read-only root filesystem.
- Probes: liveness `GET /health/live`, readiness `GET /health/ready` (checks the database).
- Two or more replicas. Rate limits must then be shared: set `RATE_LIMIT_REDIS_URL`.

### Environment variables

Store every secret value in Secrets Manager. Names only here; see `backend/.env.example` and
`backend/README.md` for details.

| Variable | Secret? | Value / note |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql+psycopg://...@<rds-endpoint>:5432/festiveos?sslmode=require` |
| `JWT_SECRET` | yes | 32+ random characters |
| `GOOGLE_CLIENT_IDS` | no | Currently required. The `demo` branch makes it optional (see section 6). |
| `OPENAI_API_KEY` | yes | Utsav chat |
| `SARVAM_API_KEY` | yes | Voice, receipt scan, documents |
| `FLAGSMITH_SERVER_KEY` | yes | The **server-side** key (`ser.…`) of the FestiveOS Flagsmith environment |
| `RATE_LIMIT_REDIS_URL` | yes | `rediss://:<auth-token>@<elasticache-endpoint>:6379/0` |
| `TRUSTED_PROXY_COUNT` | no | `1` behind the ALB (`2` if CloudFront is added in front) |
| `ENABLE_API_DOCS` | no | `false` in the deployed environment |
| `LOG_FORMAT` | no | `json` for CloudWatch |
| `NUDGEBEE_WEBHOOK_URL` | yes | New; the URL of the NudgeBee workflow trigger (section 4). The URL itself grants the right to start the workflow, so treat it as a secret. |
| `NUDGEBEE_ENVIRONMENT` | no | Sent with each incident, e.g. `production` or `demo` (default `production`) |
| `DEMO_LOGIN_ENABLED` | no | New on the `demo` branch only. See section 6. |

---

## 3. NudgeBee: attach the EKS cluster

1. Create the NudgeBee account/workspace and add a cluster. NudgeBee's console generates the Helm
   command for the agent; run it against the EKS cluster.
2. Confirm the agent can reach NudgeBee over the NAT gateway (no inbound access is needed).
3. Give the agent only the RBAC its chart asks for; do not grant it cluster-admin "to make it work".
4. Check the cluster, the FestiveOS namespace and its pods appear in NudgeBee.

This gives us monitoring, troubleshooting and cost views for the demo without any code.

---

## 4. NudgeBee: the approval workflow

Build this in NudgeBee's Workflow Builder (same shape as Diya's refund approvals, `BUILD-PLAN.md` §7):

1. **Trigger:** HTTP/webhook trigger. Copy its URL into Secrets Manager as `NUDGEBEE_WEBHOOK_URL`.
   If NudgeBee supports a shared secret or signed header on the trigger, turn it on and give us the
   header name.
2. **Event task:** store the incoming event (useful for NudgeBee's AI triage).
3. **Notify:** post to the team's Discord or Slack channel using `summary` and `suggested_action`
   from the payload.
4. **Approval task:** "Switch off `{{feature}}`?" Approve / Reject.
5. **On Approve, HTTP task to Flagsmith** to turn the feature off. Flagsmith's Admin API updates a
   feature state in an environment, roughly:

   ```
   PATCH https://api.flagsmith.com/api/v1/environments/<environment-key>/featurestates/<featurestate-id>/
   Authorization: Api-Key <flagsmith admin key>
   Content-Type: application/json

   {"enabled": false}
   ```

   Verify the exact endpoint against Flagsmith's API docs. Store the admin key in **NudgeBee's
   secret store**, never inline in the workflow, and use the least-privileged key Flagsmith offers
   (scoped to this project/environment if the plan allows).
6. **On Reject:** post "No change" to the same channel.

Turning the feature back on stays a manual action in Flagsmith (or a second workflow), so a bad
automated event can never re-enable something a human switched off.

### Webhook payload (contract with the backend)

The backend will send exactly this. No user ids, names, emails or message content, ever.

```json
{
  "event": "FEATURE_INCIDENT",
  "environment": "production",
  "feature": "utsav_voice",
  "reason": "sarvam_credits_exhausted",
  "summary": "Voice requests are failing: Sarvam reports exhausted credits (12 failures in 10 minutes).",
  "suggested_action": "Switch off utsav_voice in Flagsmith",
  "count": 12,
  "window_minutes": 10,
  "occurred_at": "2026-11-25T10:42:00Z"
}
```

| `reason` | `feature` | Fired when |
|---|---|---|
| `sarvam_credits_exhausted` | `utsav_voice` or `receipt_scan` | Sarvam returns "out of credits" |
| `sarvam_errors` | `utsav_voice` | Repeated Sarvam failures in the window |
| `ai_provider_errors` | `utsav` | Repeated OpenAI failures in the window |
| `ai_usage_spike` | `utsav` | AI turns per window far above normal |

The backend de-duplicates: at most one event per `feature` + `reason` per window, so the channel is
not flooded.

---

## 5. Flagsmith

1. Create a project `FestiveOS` with environments (at least `production`).
2. Create the flags listed in `backend/docs/feature-flags.md` (`utsav`, `utsav_voice`, `elder_mode`,
   `recite_mode`, `event_search`, `receipt_scan`, `document_upload`, plus `ai_model`, `ai_effort`,
   `announcement`). All on by default.
3. Server-side key -> `FLAGSMITH_SERVER_KEY` (Secrets Manager). Admin API key -> NudgeBee's secret
   store (section 4).
4. Note each flag's feature-state id for the NudgeBee HTTP task.

---

## 6. Mobile demo (Expo Go) — DEVELOPMENT ONLY

Google Sign-In needs native code that Expo Go cannot load, so the `demo` branch replaces it with a
"Continue as demo user" login (`DEMO_LOGIN_ENABLED=true`) and a seed script with sample data.

> **DEVELOPMENT ONLY - NOT SECURE FOR PRODUCTION.** The demo login lets anyone who can reach the API
> sign in as the demo user. Enable it only on a short-lived demo environment, and turn it off (or
> tear the environment down) after the event.

For the demo the app only needs `EXPO_PUBLIC_API_URL=https://<api-domain>`; then `npx expo start`
and scan the QR code with Expo Go.

---

## 7. Checklist for the deployer

- [ ] VPC with public (ALB) and private (EKS, RDS, Redis) subnets, NAT gateway
- [ ] RDS Postgres 16, encrypted, private, TLS
- [ ] ElastiCache Redis, encrypted at rest and in transit, AUTH token
- [ ] Secrets in Secrets Manager; IRSA role scoped to those secret ARNs only
- [ ] Backend image, migration Job, Deployment (2+ replicas), Service, ALB Ingress with ACM cert
- [ ] `/health/ready` green through the ALB
- [ ] NudgeBee agent installed on EKS, cluster visible in NudgeBee
- [ ] Flagsmith project, flags and keys
- [ ] NudgeBee workflow: trigger -> event -> notify -> approval -> Flagsmith HTTP task
- [ ] Send the sample payload from section 4 to the trigger by hand and confirm the flag flips
- [ ] Share `NUDGEBEE_WEBHOOK_URL` (via Secrets Manager, not chat) and the API domain with the app team
