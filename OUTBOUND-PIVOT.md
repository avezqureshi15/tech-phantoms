# Diya — Outbound Calling Pivot: Server Specification

The server-side companion to [DASHBOARD-SPEC.md](DASHBOARD-SPEC.md) (UI) and
[BUILD-PLAN.md](BUILD-PLAN.md) (product + policy). This document covers everything behind the
Contact button.

**Direction:** inbound push-to-talk → **outbound proactive calling**. The brand knows which orders
are going wrong; Diya calls the customer first, resolves from a knowledge base, and classifies
every call.

**Telephony:** Twilio Programmable Voice, TwiML `<Play>`/`<Record>` turn-taking, Sarvam for STT,
TTS and LLM. No Vapi, no LiveKit, no Python. See BUILD-PLAN §3.10 for why.

---

## 1. What survives, what changes, what's new

### Survives untouched ✅
`policy/engine.ts` · `policy/rules.ts` · `policy/__tests__` · `flags/client.ts` · `flags/keys.ts` ·
`sarvam/stt.ts` · `sarvam/tts.ts` · `sarvam/llm.ts` · `adapters/*` · `db/prisma.ts` · `db/scoped.ts` ·
`routes/voice.ts` (the local `/demo` fallback)

**This is the whole point of the architecture you already built.** The agent loop, the policy gate
and the approval chain do not care whether audio arrived from a browser or a phone line.

### Changes 🔧
| File | Change |
|---|---|
| `agent/orchestrator.ts` | Add call-only `end_call` and article-citation tools; inject KB and return cited ids |
| `agent/tools.ts` | Add `end_call(reason)` as the 4th tool and `cite_knowledge_article(id)` for verified citations |
| `agent/prompts.ts` | Add `buildOpeningLine()` — **the agent speaks first**; inject KB block |
| `nudgebee/trigger.ts` | Add a second payload type for `HUMAN_REVIEW` call outcomes |
| `prisma/schema.prisma` | Add query/call/knowledge models and explicit outbound-consent fields |
| `db/reseed.ts`, `db/seed-outbound.ts` | Keep reset FK-safe for the new models; provide a separate non-destructive outbound seeder |
| `flags/client.ts`, `flags/keys.ts` | Remain untouched. Until those contracts are deliberately extended, outbound kill-switch and category gates are server environment settings. |

### New 🆕
```
web/server/src/
├─ call/
│  ├─ types.ts          CallChannel interface
│  ├─ twilio.ts         TwilioCallChannel
│  ├─ guards.ts         public URL, India call window, E.164 checks
│  ├─ recording.ts      authenticated Twilio recording fetch + 404 retries
│  ├─ deadline.ts       bounded webhook work
│  ├─ audio-store.ts    serves short-lived Sarvam WAV output to Twilio
│  └─ twiml.ts          record/hold/play/hangup response builders
├─ knowledge/
│  ├─ retrieve.ts       lexical retrieval
│  └─ seed-articles.ts
├─ outcome/
│  └─ classifier.ts     RESOLVED | ONGOING | HUMAN_REVIEW
└─ routes/
   ├─ calls.ts          authenticated call creation, details, end, outcome override
   ├─ queries.ts        authenticated query list/detail + consent and do-not-call controls
   ├─ twilio.ts         signed TwiML/status/turn/pending webhooks and short-lived audio route
   └─ knowledge.ts      authenticated KB CRUD with Hinglish-tag validation
```

The existing `/api/voice/turn` remains the browser push-to-talk fallback and continues to use the
same `runAgentTurn()` path. It is not a public fallback when `PUBLIC_BASE_URL` is configured:
browser voice, console and demo APIs require the operator bearer token on a public server.

---

## 2. Prisma additions

```prisma
model Product {
  id         String  @id @default(cuid())
  tenantId   String
  name       String
  category   String          // "sweets" | "apparel" | "decor" | "gifting"
  @@index([tenantId, category])
}

model Query {
  id           String      @id @default(cuid())
  tenantId     String
  customerId   String
  orderId      String?
  productId    String?
  issueSummary String
  category     String                       // mirrors Product.category for filtering
  priority     Priority    @default(NORMAL)
  status       QueryStatus @default(NEW)
  attempts     Int         @default(0)
  detectedAt   DateTime    @default(now())
  lastCallId   String?
  @@index([tenantId, status])
}

model CallSession {
  id            String     @id @default(cuid())
  tenantId      String
  queryId       String
  channel       String                       // "twilio" | "browser"
  state         CallState  @default(DIALING)
  providerSid   String?    @unique           // Twilio CallSid — the idempotency key
  toNumber      String
  fromNumber    String
  startedAt     DateTime   @default(now())
  answeredAt    DateTime?
  endedAt       DateTime?
  durationSec   Int?
  turnCount     Int        @default(0)
  turnLeaseUntil DateTime?
  answeredBy    String?                      // human | machine_* from Twilio
  errorCode     String?
  errorMessage  String?
  @@index([tenantId, state])
  @@index([queryId])
}

model CallTurn {
  id              String   @id @default(cuid())
  tenantId        String
  callSessionId   String
  idx             Int
  recordingSid    String?                    // idempotency key supplied by Twilio
  role            Role                       // AGENT | CUSTOMER
  text            String
  lang            String?
  recordingUrl    String?
  latencyMs       Int?
  citedArticleIds String[]                   // KB articles used for this turn
  audioKey        String?                    // short-lived in-memory playback key
  endCall         Boolean  @default(false)
  createdAt       DateTime @default(now())
  @@unique([callSessionId, idx])             // ordering + replay safety
  @@index([tenantId, callSessionId])
}

model CallOutcome {
  id            String   @id @default(cuid())
  tenantId      String
  callSessionId String   @unique
  value         Outcome
  confidence    Confidence
  evidence      String                       // verbatim transcript quote
  rationale     String?
  overriddenBy  String?
  overrideNote  String?
  createdAt     DateTime @default(now())
}

model KnowledgeArticle {
  id         String   @id @default(cuid())
  tenantId   String
  title      String
  category   String                 // product category, or "general"
  tags       String[]               // MUST include Hinglish keywords — see §6.2
  body       String
  citedCount Int      @default(0)
  updatedAt  DateTime @updatedAt
  @@index([tenantId, category])
}

enum Priority    { HIGH  NORMAL }
enum QueryStatus { NEW  CALLING  ONGOING  RESOLVED  HUMAN_REVIEW  FAILED }
enum CallState   { DIALING  RINGING  CONNECTED  WRAPPING_UP  ENDED  FAILED }
enum Outcome     { RESOLVED  ONGOING  HUMAN_REVIEW }
enum Confidence  { HIGH  MEDIUM  LOW }
```

Keep the existing `Ticket` and `Message` fields and semantics. `AgentAction.ticketId` becomes nullable
and gains `callSessionId String?` so refunds raised on a call still audit correctly. Each
`CallSession` also owns a bridge `Ticket` (`ticketId String @unique`) so the unchanged `Approval`
callback and existing ticket audit UI can process call-triggered refunds. `Customer` gains nullable
`outboundConsentAt` and `outboundConsentSource`, plus `doNotCall Boolean @default(false)`; no customer
is considered callable until consent is explicitly recorded.

The implementation adds `@@unique([callSessionId, recordingSid])` in addition to the turn index
constraint. `turnLeaseUntil` prevents concurrent Twilio recordings from running two agent turns at
once; `audioKey` is only a random in-memory URL key, never an audio blob in Postgres.

---

## 3. Prerequisite: a public URL

Twilio fetches TwiML from your server and plays audio from your server. **`localhost` is
unreachable.** Before anything else works:

```powershell
cloudflared tunnel --url http://localhost:4000
```

Set `PUBLIC_BASE_URL` to the resulting `https://…` host (hostname only; no path, credentials, or
query string). Every Twilio-facing URL derives from it. The URL is read per request so changing the
process environment after a tunnel restart does not leave a module-cached stale host.

The tunnel URL changes on restart, so update `PUBLIC_BASE_URL` in the server environment and restart
the process. **This is the single most common reason an outbound demo fails.**

All public operator APIs require a 32+ character `OUTBOUND_OPERATOR_TOKEN`; never put it in a
`VITE_` variable. The browser stores it in tab-scoped `sessionStorage` and sends it as a bearer
token. Public Twilio callbacks use signature validation instead. `localhost`, plain HTTP and IP
literal values are rejected as `PUBLIC_BASE_URL`.

Also enable **India** under Twilio → Voice → Settings → **Geo Permissions**, or every call fails
with `21215`.

---

## 4. The CallChannel seam

The server defines a small `CallChannel` seam and currently implements `TwilioCallChannel`. The
existing browser `/demo` remains a separate push-to-talk fallback through `/api/voice/turn`; it still
uses the same agent loop, but it is not a simulated outbound `BrowserCallChannel` yet. Do not claim
browser outbound calls work until that channel is implemented.

---

## 5. The Twilio loop — endpoint by endpoint

### 5.1 `POST /api/calls` — operator clicks Contact

1. Require a valid operator bearer token. Reject unless `OUTBOUND_CALLING_ENABLED=true`.
2. Load query + customer. Require an explicit `outboundConsentAt`, a non-empty consent source,
   `doNotCall === false`, and a valid E.164 destination. Never seed consent for demo customers.
3. Reject if `query.status === "CALLING"` (**one active call per query** — enforce with a conditional
   update, not a read-then-write); cap total active calls at four.
4. Check `ai_agent_enabled` plus `category ∈ CALLABLE_QUERY_CATEGORIES`. The existing Flagsmith
   client remains unchanged; outbound controls are environment gates until a separate flag-contract
   change is approved.
5. Enforce the **09:00–21:00 IST calling window** (India rule). Outside it, refuse with a clear
   message rather than dialling.
6. In a serializable transaction, claim the query, create a bridge `Ticket` + `CallSession` (`DIALING`),
   set `query.status = "CALLING"`, and increment `attempts`.
7. Create the Twilio call and store `providerSid = CallSid`. URLs use the current public base URL.

On a Twilio throw: set `FAILED`, persist `errorCode`/mapped `errorMessage`, set the query to `FAILED`,
and surface the known Geo Permissions/trial-number message where possible.

### 5.2 `POST /api/twilio/voice/:sessionId` — TwiML when answered

1. **Validate `X-Twilio-Signature`** (§8.1). Reject unsigned requests.
2. If `AnsweredBy` starts with `machine` → `<Hangup/>`; do not speak to an answering machine. No
   customer transcript exists, so record low-confidence `HUMAN_REVIEW` with empty evidence and notify
   NudgeBee rather than pretending `"voicemail"` is a transcript quote.
3. Build the opening line — **the agent speaks first**:

   > *"Namaste {customer}, main Diya bol rahi hoon {brand} se. Aapke order {orderId} mein deri ho
   > rahi hai. Is call ki recording li ja sakti hai. Bataiye, is baare mein aap kya jaanna chahenge?"*

   Identify brand → state the known issue → **disclose recording** → ask an open question.
   Recording disclosure is both courteous and a maturity signal; keep it.
4. TTS → verify WAV header → store in the in-memory audio store → get a **unique** URL. If Sarvam
   returns HTTP 402, stop the call and surface a service-credit error; do not silently degrade.
5. Return:

```xml
<Response>
  <Play>{audioUrl}</Play>
  <Record action="{PUBLIC_BASE_URL}/api/twilio/turn/{sessionId}" method="POST"
          maxLength="20" timeout="3" playBeep="false" trim="trim-silence" finishOnKey="#" />
  <Say voice="alice">Sorry, I could not hear you. Goodbye.</Say>
  <Hangup/>
</Response>
```

The `<Say>` + `<Hangup/>` after `<Record>` only execute if the recording never happens — that's
your no-speech path. Don't omit it or the call hangs silently.

### 5.3 `POST /api/twilio/turn/:sessionId` — every customer turn

**This handler has a hard 15-second budget** — Twilio abandons the call if TwiML doesn't return.
The implementation races the work against an internal 10s deadline. On timeout it returns holding
TwiML that redirects to a signed `/pending/:sessionId` poll; it does not start another recording
while the previous turn lease is active. This leaves time to deliver the completed response or a
human-review fallback before Twilio's deadline.

1. Validate signature. **Dedupe on `(sessionId, RecordingSid)`** — Twilio retries webhooks.
2. Validate that `RecordingUrl` is HTTPS on a Twilio host; fetch `${RecordingUrl}.wav` with Twilio
   basic auth. **Retry twice with 300ms backoff** — the
   recording is occasionally not yet available and returns 404.
3. `transcribeAudio(buffer)` → persist `CallTurn` (role CUSTOMER) immediately, before the LLM runs,
   so a dropped call still leaves a transcript. Mirror each turn to the bridge ticket's `Message`
   list for the existing audit UI.
4. `retrieve()` KB articles (§6).
5. `runAgentTurn()` — existing loop and policy gate. Phone turns opt into `end_call` and
   `cite_knowledge_article`; refunds still go through `authoriseRefund` and raise existing approvals.
6. Persist `CallTurn` (role AGENT) with `citedArticleIds`; increment `citedCount` on each article.
7. Decide whether to continue:
   - agent called `end_call` or `turnCount >= MAX_TURNS_PER_CALL` (default 8) → play final reply and
     hang up
   - otherwise → `<Play>{reply}</Play><Record …/>` (same block as §5.2)

### 5.4 `POST /api/twilio/status/:sessionId` — lifecycle

Map `CallStatus` → state: `ringing` → `RINGING`, `in-progress` → `CONNECTED`,
`completed|busy|no-answer|failed|canceled` → `ENDED`/`FAILED`. Persist `CallDuration`.

On a terminal status: set `WRAPPING_UP`, run the outcome classifier (§7), write `CallOutcome`, set
`query.status` from the outcome, and fire NudgeBee if `HUMAN_REVIEW`. **Idempotent** — Twilio sends
`completed` more than once; guard on `CallOutcome` already existing.

`busy` / `no-answer` have no customer transcript to cite, so fail toward low-confidence
`HUMAN_REVIEW` rather than fabricating evidence.

### 5.5 `GET /api/audio/:id.wav`

Serves Sarvam TTS bytes. `Content-Type: audio/wav`, `Cache-Control: no-store`, **unique id per
utterance** (Twilio caches by URL — reusing an id replays stale audio). In-memory `Map` with a
10-minute TTL is sufficient; evict on call end. No auth, but ids must be unguessable (`randomUUID`)
since the URL is effectively public.

Verify Sarvam's output sample rate once at the start — Twilio `<Play>` is happiest with 8 kHz mono
16-bit PCM WAV and will transcode others, but confirm rather than assume.

---

## 6. Knowledge base

### 6.1 Retrieval — lexical, not embeddings

```ts
retrieve(tenantId, category, queryText, limit = 3): KnowledgeArticle[]
```

1. Filter `tenantId` and (`category` matches **or** `category === "general"`).
2. Tokenise `queryText`, lowercase, strip stopwords (English **and** Hindi: *hai, nahi, mera, kya,
   aur, ka, ki, ko, se, mein*).
3. Score: `title` match ×3, `tags` match ×2, `body` match ×1.
4. Return top `limit` with score > 0.

At 20–30 articles this is indistinguishable from vector search and takes 30 minutes. Keep it behind
`retrieve()` so embeddings are a later swap.

### 6.2 ⚠️ The Hinglish trap — do not skip this

Customers speak Hinglish; articles are written in English. **Lexical retrieval will silently return
nothing.** *"Mera order abhi tak nahi aaya"* shares no tokens with "Delayed delivery policy".

**Fix:** every article's `tags` must carry Hinglish keywords alongside English ones:

```
title: "Delayed festive delivery"
tags:  ["delay","late","delivery","deri","der","nahi aaya","abhi tak","pahuncha nahi","time"]
```

Make this a hard rule in the seed data and in the KB editor's helper text. It is the difference
between a knowledge base that works and one that looks like it works.

### 6.3 Context injection

Inject as a `KNOWLEDGE` system block after `CONTEXT`, with explicit instructions: *answer only from
these articles; if they do not cover it, call `escalate_to_human`; never invent policy.* The call-only
`cite_knowledge_article` tool records an id only when it was included in the retrieved article set.

Seed **20–25 articles** across the four categories plus `general`: delayed delivery, missing item,
damaged in transit, wrong size, refund timelines, replacement policy, festive delivery windows,
COD refunds, gift packaging, bulk orders.

---

## 7. Outcome classifier

Runs once per call on the full transcript. Separate LLM call, low temperature, strict JSON:

```json
{ "outcome": "RESOLVED | ONGOING | HUMAN_REVIEW",
  "confidence": "HIGH | MEDIUM | LOW",
  "evidence": "<verbatim quote from the transcript>",
  "rationale": "<one sentence>" }
```

**Criteria — be explicit in the prompt:**
- `RESOLVED` — the customer **explicitly confirmed** they're satisfied, or an action executed and
  they accepted it. Agent satisfaction is not evidence.
- `ONGOING` — something was promised, the customer wants time, or an approval is pending.
- `HUMAN_REVIEW` — the agent couldn't help, the customer was dissatisfied or angry, a policy edge
  case came up, or the call dropped mid-conversation.

**Fail toward a human.** Force `HUMAN_REVIEW` when `confidence === "LOW"`, when `evidence` is empty,
when the quote isn't actually present in the transcript (verify it — models fabricate quotes), or
when the classifier call itself fails. Never default to `RESOLVED`.

For `RESOLVED`, additionally verify the quote belongs to a stored CUSTOMER turn and contains an
explicit positive confirmation (not merely a customer update such as “the package arrived”). Manual
operator overrides use the same verbatim/customer-confirmation checks.

This mirrors the policy engine's philosophy: the optimistic outcome needs evidence, the cautious
one is free.

---

## 8. Robustness

### 8.1 Security
- **Validate `X-Twilio-Signature`** on voice, turn, pending-poll and status callbacks using the auth
  token. Use Twilio's SDK validator, parsed form fields and `PUBLIC_BASE_URL + req.originalUrl`;
  never trust forwarded host/protocol headers. The form-urlencoded parser is route-scoped.
- `POST /api/calls`, query/consent controls, call details and KB management require
  `Authorization: Bearer OUTBOUND_OPERATOR_TOKEN` (minimum 32 characters). No token is compiled into
  the Vite client. When `PUBLIC_BASE_URL` is set or `NODE_ENV=production`, `/api/console`, `/api/demo`
  and the fallback `/api/voice` APIs also require the token; local-only development keeps them open.
- Call initiation is off unless `OUTBOUND_CALLING_ENABLED=true`. It also requires a recorded consent
  timestamp/source, `doNotCall=false`, allowed category, E.164 number, India calling window, enabled
  AI flag, public HTTPS URL and Twilio credentials. Demo seed data has **no consent**.
- Never log the auth token, recording URLs with credentials, or customer phone numbers in full.
- `/api/audio/:id.wav` ids must be `randomUUID`, never sequential.
- Keep `APPROVAL_CALLBACK_SECRET` verification on the NudgeBee callback.
- The Twilio auth token currently in your chat history should be **rotated**.

### 8.2 Idempotency
Every Twilio webhook can arrive more than once. The query's conditional `NEW|ONGOING|FAILED` →
`CALLING` claim prevents duplicate operator calls; `providerSid` is unique; turns dedupe on
`(callSessionId, RecordingSid)`; `CallOutcome.callSessionId` is unique; and
`CallTurn.@@unique([callSessionId, idx])` guards ordering/replay.

### 8.3 Concurrency
One active call per query, enforced by a conditional update restricted to callable query states — act
only if a row changed. A tenant-scoped serializable reservation transaction caps concurrent calls
at **4 per tenant** (the Twilio trial limit may be lower).

### 8.4 Failure modes

| Failure | Handling |
|---|---|
| Tunnel URL stale | Read `PUBLIC_BASE_URL` per request; reject missing, local, HTTP or malformed values |
| Recording 404 | Retry twice with 300ms backoff; if still missing, end safely and classify toward human review |
| Sarvam 429 | Fail the turn safely, ask Twilio to say a brief recovery message, and leave the query for follow-up |
| Sarvam 402 (credits out) | Stop the call, save the provider error, set `HUMAN_REVIEW` and surface the error in call detail |
| LLM malformed tool call | Existing retry → `escalate_to_human`. Never throw inside a webhook. |
| Handler exceeds 15s | Internal 10s deadline → holding `<Say>/<Pause>/<Redirect>` to signed pending poll; retain the turn lease |
| Call drops mid-conversation | Status callback still fires → classify on the partial transcript |
| Voicemail/no answer | Hang up; with no verifiable customer quote, classify toward `HUMAN_REVIEW` |
| Customer silent | `<Say>`+`<Hangup/>` after `<Record>` |
| Agent loops | `max_turns_per_call` cap and Twilio `timeLimit` as a hard backstop |

### 8.5 Observability
Log one structured line per turn: `sessionId, idx, sttMs, llmMs, ttsMs, totalMs, tool, decision,
articlesCited`. When something misbehaves on the floor you need the timings, not a stack trace.

---

## 9. Flags, NudgeBee, env

Outbound controls currently use environment variables so the existing Flagsmith client and key
contracts remain untouched: `OUTBOUND_CALLING_ENABLED=false` (default),
`CALLABLE_QUERY_CATEGORIES` (empty means no categories), `MAX_TURNS_PER_CALL=8`, and
`MAX_CALL_DURATION_SEC=180`. The existing `ai_agent_enabled` and refund flags remain server-resolved
through Flagsmith and continue to gate the agent/policy path.

**NudgeBee** now fires on two events: a refund needing approval (existing), and a call classified
`HUMAN_REVIEW` (new) carrying `callSessionId`, outcome evidence and a transcript link.

**New env:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `PUBLIC_BASE_URL`,
`OUTBOUND_CALLING_ENABLED=false`, `OUTBOUND_OPERATOR_TOKEN` (32+ random chars),
`OUTBOUND_OPERATOR_NAME`, `CALLABLE_QUERY_CATEGORIES`, `MAX_TURNS_PER_CALL=8`,
`MAX_CALL_DURATION_SEC=180`, `CALL_WINDOW_START=09:00`, `CALL_WINDOW_END=21:00`. These are documented
in `web/server/.env.example`; no Twilio or operator secret belongs in client env.

Apply the Prisma schema to the intended development database with the repo's `npm run prisma:push`
only after verifying `DATABASE_URL`. `npm run prisma:seed-outbound` upserts products, queries and KB
articles without truncating existing demo data; the normal demo reseed also refreshes outbound seed
data after its intentional truncate. Neither seeding path grants call consent. Do not run the
destructive `prisma:seed`/`/api/demo/reset` against a shared DB.

---

## 10. Work order

| # | Task | Est | Gate |
|---|---|---|---|
| 1 | Prisma additions + migrate + seed products, queries, 20 KB articles | 60 m | Queue renders |
| 2 | `knowledge/retrieve.ts` + Hinglish tags + unit tests | 40 m | Hinglish query returns articles |
| 3 | `CallChannel` + **`BrowserCallChannel`** + session state machine | 60 m | Full outbound flow, no Twilio |
| 4 | Agent changes: opening line, `end_call`, KB injection | 45 m | Agent speaks first |
| 5 | `outcome/classifier.ts` + evidence verification | 45 m | Three outcomes reachable |
| 6 | `routes/calls.ts` + `audio-store.ts` | 30 m | — |
| 7 | **`TwilioCallChannel` + the 4 TwiML webhooks** | 90 m | **Your phone rings** |
| 8 | Signature validation, idempotency, failure mapping | 45 m | Replayed webhook is a no-op |
| 9 | NudgeBee `HUMAN_REVIEW` trigger | 20 m | Review lands in Discord |

**≈ 7 hours.** Items 1–6 have no Twilio dependency and deliver a complete, demonstrable product on
the browser channel — **finish those before touching item 7.** If telephony collapses, you still
have everything that makes this interesting.

### Verification before you call it done
- [ ] Hinglish utterance retrieves a KB article (not zero)
- [ ] All three outcomes reachable, with a real quote as evidence
- [ ] Replaying a Twilio webhook changes nothing
- [ ] Refund mid-call still hits the policy gate and raises an approval
- [ ] Flag flip mid-call changes the next turn's behaviour
- [ ] Call drop mid-conversation still produces an outcome
- [ ] Voicemail hangs up without talking
- [ ] Browser channel and Twilio channel produce identical transcripts and outcomes
