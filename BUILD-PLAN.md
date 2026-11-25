# Diya — Build Plan & Architecture

> **Diya** — an AI-native customer support platform for the festive rush.
> *"Your support desk, lit up for the festive season."*
>
> Festive Hacks · WeAreDevelopers Conference India · BIEC Bengaluru
> **25 Nov 2026, 09:00–18:00 IST — nine hours, submissions close at 18:00**
> Team **Tech Phantoms** (`S8ECVJ`) — Avez Qureshi, Subramanya Rao

---

## 0. Hard constraints from the rules

These are not preferences. They decide the shape of the build.

| Rule | Consequence |
|---|---|
| **R3** — 09:00–18:00, one day | **9 hours total.** Realistically ~7 hours of build after setup, lunch and submission. Scope is cut to the bone below. |
| **R4** — main coding and design work starts at 09:00 | **No code tonight.** Notes, sketches and research only — this document is allowed, a scaffolded repo is not. |
| **R5** — first prize (Berlin) requires **all three** sponsors; second place is **best use of Flagsmith** | NudgeBee is now mandatory, not optional. Flagsmith is our hedge and must be excellent. |
| **R7** — AI assistants allowed, must be **disclosed**, and you must be able to explain your code | README gets a disclosure section. Don't ship code neither of you can walk a judge through. |
| **R8** — public repo + README with setup steps + **demo video of the working project** | The video is a submission requirement, not a safety net. Record it at 16:00 regardless of state. |
| **R2** — all members accepted on Luma and registered | You're 2 of 4. Fine, but confirm both are registered on the page. |

---

## 1. The product in one paragraph

During the festive season, D2C and quick-commerce brands see 4–5x order volume, and the support
queue collapses under it. The overflow is almost entirely repetitive: *where is my order*,
*wrong item*, *I need a refund before the function tonight*. And in India most of it arrives as
**code-mixed Hinglish voice**, not tidy English chat.

Diya is a support platform where an AI agent takes the call in the customer's own language,
pulls live order context, and **actually resolves it** — instead of reading out an FAQ. Every
action it proposes is authorised by a deterministic policy engine whose limits are controlled by
live feature flags; anything above those limits is routed into a human approval workflow.

**The thesis:** everyone can build a chatbot. Nobody ships one that is allowed to touch money.
The policy + flag + approval layer is what makes autonomy deployable.

### 1.1 How a business actually uses Diya

**Start by being honest about what you built.** What ships tomorrow is vertically integrated: our
Postgres, our seeded orders, our two fake tenants. That demonstrates the product's *behaviour*,
not its *integration surface*. Say so if asked — a judge who catches you overclaiming stops
believing the rest.

**Is it plug-and-play?** No, and anyone who claims one-click for a system that issues refunds is
lying — the refund has to execute *somewhere*, and that somewhere is the brand's payment system.
The honest answer is **"implement two endpoints"**: roughly half a day of work for the brand, with
no data migration and nothing copied out of their systems.

Diya needs exactly three things from a customer:

| What | Why | How they provide it |
|---|---|---|
| **Order + customer context** | The agent can't resolve what it can't see | `GET {base}/orders?customerId=` |
| **The ability to act** | Refunds execute in *their* payment system, not ours | `POST {base}/refunds` |
| **A channel** | Somewhere customers actually reach them | One `<script>` tag |

That's the whole contract. They implement two REST endpoints to a published schema, paste a
base URL and an API key into the Diya console, and drop a script tag on their site.

```
   BRAND'S SYSTEMS                     DIYA                      CUSTOMER
  +------------------+                                        +------------+
  | Shopify / OMS    |                                        |            |
  |                  |  <--- GET  /orders ----  [ agent ]     |  voice     |
  |  orders, status  |                              ^         |  widget    |
  |                  |  <--- POST /refunds ----     |         |            |
  +------------------+                              |         +-----+------+
         ^                                          |               |
         | they implement 2 endpoints               +---------------+
         | we never copy their data                    <script> tag
```

**Why webhooks, not a data sync.** We deliberately do not pull their orders into our database.
Copying another company's customer and order data means staleness, a migration step, and a much
larger blast radius if we're ever breached. Reading on demand over their own API means a brand can
switch us off and lose nothing. That is a real architectural opinion and worth stating out loud.

### 1.2 Onboarding — five steps, and each one is a sponsor

```
1.  Sign up           ->  tenant created, API key + embed snippet issued
2.  Connect orders    ->  implement GET /orders and POST /refunds, paste base URL + key
3.  Set your policy   ->  refund ceiling, approval threshold, languages     [FLAGSMITH]
4.  Wire approvals    ->  approval workflow + Slack/Discord notification    [NUDGEBEE]
5.  Drop the snippet  ->  voice widget live on your site                    [SARVAM]
```

Step 3 is the one worth dwelling on: **the brand sets its own risk appetite.** A jewellery brand
sets the auto-refund ceiling at ₹500 and approves everything else by hand; a sweets brand running a
Diwali promo sets it at ₹5,000 and lets the agent clear the queue. Same platform, same agent, two
completely different autonomy envelopes — and they change it themselves, live, without calling us.

**Channels, roadmap order:** web widget (v1) → phone number via **Sarvam Samvaad**, which does AI
calling on your own numbers → WhatsApp Business. Telephony is the obvious next step and it stays
inside the Sarvam stack, which is a tidy thing to say on the roadmap slide.

**Connectors, roadmap order:** the two-endpoint contract is the universal path; prebuilt Shopify
and WooCommerce adapters come later so the long tail of brands skip step 2 entirely. *That* is
when it becomes genuinely plug-and-play, and it's honest to call it future work.

### 1.3 Multi-tenant security of the integration

Each tenant's `webhookBaseUrl` and API key are per-tenant secrets. They go in a secret manager,
never in a plaintext column and never in logs. Outbound calls to a brand's endpoints are signed
(HMAC over body + timestamp) so they can verify the request really came from us, and we never
persist their customers' PII beyond the ticket transcript. Say this in one sentence if asked; it's
the difference between a hackathon project and something a brand would actually connect.

---

## 2. Why all three sponsors belong here

Rule 5 forces three integrations. The trap is bolting on a third tool that obviously doesn't
belong — judges notice. We don't have that problem, because the three tools map onto **three
layers of one question: how do you safely let an AI touch money?**

```
   SARVAM        "How does the customer reach us?"
                 Hinglish voice in, Hindi voice out. Indic-first, not English-first.
                          |
                          v
   FLAGSMITH     "What is the AI allowed to do on its own?"
                 The autonomy dial. Refund ceilings, kill switch, per-tenant risk appetite.
                          |
                          v
   NUDGEBEE      "What happens when it is NOT allowed to act alone?"
                 Human approval workflow, ops notification, audited callback.
```

That is one coherent sentence per tool, and none of them is decoration. Say exactly this on
slide 2.

### The three claims to defend on stage

| # | Claim | How we prove it live |
|---|---|---|
| 1 | **It acts, it doesn't chat.** | Agent issues a real refund; the order record visibly changes. |
| 2 | **Autonomy has a dial, not an on/off switch.** | Flip `auto_refund_limit_inr` in Flagsmith on the projector → the same call now needs a human. No redeploy. |
| 3 | **Humans stay in the loop where it matters.** | The ₹6,800 hamper fires a NudgeBee approval; you approve it on screen; the refund then executes. |

---

## 3. Architecture

### 3.1 System diagram

```
+------------------------------- BROWSER -------------------------------+
|  /demo  (customer side)          /console  (ops side)                 |
|  +----------------------+        +---------------------------------+  |
|  | Push-to-talk widget  |        | Live ticket feed                |  |
|  | transcript + audio   |        | Ticket detail + audit trail     |  |
|  | language picker      |        | Pending approvals               |  |
|  +----------------------+        | Flag state (read-only mirror)   |  |
|                                  +---------------------------------+  |
+-----------------------------------+-----------------------------------+
                                    |  HTTPS (audio blob / JSON)
+-----------------------------------v-----------------------------------+
|                    NEXT.JS API ROUTES (server only)                   |
|  POST /api/voice/turn        the single round-trip endpoint           |
|  POST /api/approvals/callback   <-- NudgeBee calls back in here       |
|  GET  /api/console/*         tickets, metrics, approvals              |
|  POST /api/demo/reset        reseed between demo runs                 |
+-----------------------------------+-----------------------------------+
                                    |
+-----------------------------------v-----------------------------------+
|                      AGENT ORCHESTRATOR  (lib/agent)                  |
|   1. TRANSCRIBE      Sarvam Saaras v3  -----> text + detected lang    |
|   2. CONTEXT BUILD   Postgres: order, customer, history               |
|   3. REASON          Sarvam Token Factory (OpenAI-compatible, tools)  |
|                      `-> returns a PROPOSED tool call                 |
|   4. AUTHORISE       ########################################         |
|                      #  POLICY ENGINE   (lib/policy)         #        |
|                      #  hard rules + Flagsmith flags          #       |
|                      #  -> ALLOW | DENY | REQUIRE_HUMAN       #       |
|                      ########################################         |
|   5a. ALLOW          execute, write to DB, log AgentAction            |
|   5b. REQUIRE_HUMAN  trigger NudgeBee workflow ------------+          |
|   6. RESPOND         Sarvam Bulbul v3 -----> base64 audio  |          |
+----------+-------------------------+----------------------|----------+
           |                         |                       |
+----------v--------+   +------------v-----------+   +-------v--------------+
| POSTGRES (Neon)   |   | FLAGSMITH (server SDK) |   | NUDGEBEE             |
| Prisma            |   | identity tenant:<slug> |   | Workflow Builder     |
| tenant_id on      |   | cache TTL 5s           |   |  - Event task (log)  |
| every table       |   | snapshot per decision  |   |  - Approval task     |
|                   |   |                        |   |  - HTTP callback --> |
+-------------------+   +------------------------+   |  - Discord notify    |
                                                     +----------------------+
```

### 3.2 The one design decision that matters

**The LLM proposes. The policy engine disposes. NudgeBee adjudicates the rest.**

The model never has direct write access. It emits a structured tool call; the policy engine is
plain, boring, auditable TypeScript that decides whether it executes. Flags feed the policy
engine, not the prompt.

```
LLM output:  { tool: "issue_refund", args: { orderId: "ORD-1042", amountInr: 6800 } }
                         |
                         v
Policy engine:  ai_agent_enabled?                        -> true
                order belongs to tenant?                 -> true    (HARD rule)
                order age < 7 days?                      -> true    (HARD rule)
                already refunded?                        -> false   (HARD rule)
                6800 <= auto_refund_limit_inr (2000)?    -> FALSE   (flag)
                         |
                         v
Decision:  REQUIRE_HUMAN
           -> AgentAction logged with flagSnapshot, executed=false
           -> NudgeBee workflow triggered
           -> agent tells the customer: "Main ise team se approve kara raha hoon"
```

Hard rules (tenant ownership, double-refund, order age) are **never** flag-controlled. Flags only
move the money ceiling within safe bounds. When a judge asks *"what stops a hallucinated ₹50,000
refund?"*, the answer is a code path, not a vibe.

### 3.3 Voice round-trip — push-to-talk, not streaming

```
[hold button] -> MediaRecorder (webm/opus) -> release -> POST /api/voice/turn

  Saaras v3 STT      ~0.4-0.8 s
  Agent loop         ~1.5-3.0 s   (usually 2 LLM calls - see 5.3)
  Policy + execute   ~0.05 s
  Bulbul v3 TTS      ~0.5-0.9 s
                     ---------
  total              ~2.5-4.5 s
```

Robust on shared conference wifi in a loud hall. Show a "soch raha hoon…" state during the wait.
**WebSocket streaming is out of scope** — and not just for time: Sarvam's streaming API accepts
only WAV and raw PCM, while the REST API takes WebM straight from the browser. REST is both
faster to build and the only path that avoids transcoding.

### 3.4 The API contract — agree this tonight, in chat, before 09:00

```ts
// POST /api/voice/turn   (multipart: audio blob + fields)
type VoiceTurnRequest = {
  audio: Blob          // webm/opus from MediaRecorder
  ticketId?: string    // omitted on first turn
  tenantSlug: string   // "festive-mart"
  customerId: string
}

type VoiceTurnResponse = {
  ticketId: string
  transcript: string
  detectedLang: string           // "hi-IN"
  replyText: string
  replyAudioB64: string
  action: null | {
    tool: string
    args: Record<string, unknown>
    policyDecision: "ALLOW" | "DENY" | "REQUIRE_HUMAN"
    denyReason?: string
    executed: boolean
    approvalId?: string          // set when NudgeBee was triggered
  }
  ticketStatus: "OPEN" | "AUTO_RESOLVED" | "AWAITING_APPROVAL" | "ESCALATED"
  latencyMs: { stt: number; llm: number; tts: number; total: number }
}

// POST /api/approvals/callback   (NudgeBee -> us)
type ApprovalCallback = {
  approvalId: string
  decision: "APPROVED" | "REJECTED"
  approver: string
  secret: string       // shared secret from env, verified server-side
}
```

Lane A owns everything behind `/api/voice/turn`. Lane B can mock it from minute one.

### 3.5 Console specification — decided, so nobody deliberates at 11:00

**Main console (`/console`)** — four metric tiles, then the ticket feed.

| Tile | Computation |
|---|---|
| Tickets today | `count(tickets)` for the tenant |
| Auto-resolved | `AUTO_RESOLVED / (all tickets not in OPEN)` as a % |
| Awaiting approval | `count(status = AWAITING_APPROVAL)` — this is the live NudgeBee proof |
| Avg handle time | `mean(resolvedAt − openedAt)` over resolved tickets, in seconds |

Ticket feed columns, in this order:

`Time · Customer · Order · Lang · Issue · Status · Action taken · Latency`

- Status renders as a coloured badge: `AUTO_RESOLVED` green, `AWAITING_APPROVAL` amber,
  `ESCALATED` red, `OPEN` grey.
- "Action taken" shows the tool name plus outcome, e.g. `issue_refund ₹1,450 ✓` or
  `issue_refund ₹6,800 ⏸ awaiting approval`.
- Polls `GET /api/console/tickets?since=<iso>` every 2 s. No websockets.
- A **pending approvals** panel sits above the feed: order, amount, customer, age, link to ticket.

**Ticket detail (`/console/tickets/[id]`)** — five stacked sections, in this order:

1. Header — customer, order, status badge, language, handle time
2. Transcript — customer/agent turns with per-turn latency
3. **Audit trail** — `time · tool · args · decision · executed · deny reason`
4. **Flag snapshot** — the JSON from the decisive `AgentAction`, rendered as a key/value table
5. Approval card, when one exists — status, approver, workflow run id

Sections 3 and 4 are the pitch. Give them the most visual weight.

### 3.6 Browser audio capture — the fiddly bits, pre-decided

- Request mic permission **on page load**, not on first click. A permission dialog mid-demo is a
  bad look, and you only get one first impression with a judge.
- Keep the `MediaStream` open between turns — don't re-prompt each time.
- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })`
- Mime selection, in order: `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` (Safari).
  Sarvam's REST API accepts WebM and MP4/M4A, so any of these uploads as-is. **No transcoding.**
- Hold-to-talk, with a **20-second auto-stop**. Sarvam's REST path is for clips under 30 s;
  anything longer belongs on their Batch API, which we are not building.
- Show a **live input level meter** while recording. In a loud hall this is the only way the
  speaker knows the mic is hearing them, and it saves you from a silent-audio demo failure.

### 3.7 The `/demo` page — the thing judges actually watch

Build this **before** the console detail page: it's what unblocks testing the voice loop, and it
carries the demo.

```
+----------------------------------------------------------+
|  Diya            [festive-mart v]  [Priya Sharma v]  [EN] |   <- tenant + customer + lang
+----------------------------------------------------------+
|                                                          |
|                     (  ( O )  )                          |   <- hold-to-talk, level ring
|                   HOLD TO SPEAK                          |      pulses while recording
|                                                          |
|           [ Play sample clip v ]   [ Reset demo ]        |   <- noise fallback + reseed
+----------------------------------------------------------+
|  +----------------------------------------------------+  |
|  |  CUSTOMER  hi-IN                            1.2s   |  |
|  |  Mera Diwali order abhi tak nahi aaya...           |  |
|  +----------------------------------------------------+  |
|                                                          |
|  +----------------------------------------------------+  |
|  |  DIYA                                       2.8s   |  |
|  |  Main dekh raha hoon... [replay]                   |  |
|  +----------------------------------------------------+  |
|                                                          |
|  ####################################################    |
|  #  REFUND ISSUED          Rs 1,450                 #    |   <- THE ACTION CARD
|  #  ORD-1042 . Diwali sweet box . auto-approved     #    |      green / amber / red
|  ####################################################    |
+----------------------------------------------------------+
```

**The action card is the visual payoff.** Do not bury the outcome in a paragraph of agent text —
render it as a card the moment the tool executes:

| Outcome | Card |
|---|---|
| `ALLOW` + executed | **Green** — "REFUND ISSUED ₹1,450", order, "auto-approved under ₹2,000 limit" |
| `REQUIRE_HUMAN` | **Amber** — "SENT FOR APPROVAL ₹6,800", "above ₹2,000 limit · waiting on ops" |
| `REQUIRE_HUMAN` → approved | Amber card **flips to green** when the callback lands. This beat is worth rehearsing. |
| `DENY` | **Red** — the deny reason, verbatim |
| `escalate_to_human` | **Grey** — "Escalated to a human agent" |

Other details that matter on stage:
- Agent replies **auto-play**; a replay button on each agent message for when a judge missed it.
- Each message shows its language tag and latency — quiet proof the system is real, not canned.
- Customer messages right-aligned, agent left-aligned. Standard, instantly readable.
- The tenant and customer pickers are visible, because switching tenants mid-demo is how you show
  per-tenant flag targeting without opening a settings page.

### 3.8 `/stage` — the single-screen demo view

**Alt-tabbing between demo and console during a 3-minute pitch loses the room.** Build one route
that embeds both, side by side, and present from it:

```
+---------------------------+------------------------------------+
|   /demo  (40%)            |   /console feed  (60%)             |
|                           |                                    |
|   hold-to-talk            |   [tiles: today | auto% | pending]  |
|   transcript              |                                    |
|   action card             |   ticket rows — the live one        |
|                           |   highlighted and pinned to top     |
|                           |   audit rows appear as they happen  |
+---------------------------+------------------------------------+
```

The judge watches the ticket appear, the policy verdict land, and the audit row write itself
**while the call is still happening**. That is the difference between "they built a chatbot" and
"they built a platform." It is about 30 minutes of work reusing both components.

Lane A builds this at 15:00 while Lane B is on NudgeBee. **If you're behind, this is the first
thing to cut** — the demo still works, you just alt-tab.

### 3.9 Visual system and projector constraints

Twenty minutes, not two hours. Mostly Tailwind tokens and a header.

**Design for the projector, not your laptop.**
- Assume **1366×768** — the worst common conference projector. Test the stage view at that size.
- Minimum 16px base, **20px+ for transcript text**. Nothing below 14px anywhere on screen.
- **High contrast only.** Projectors wash out mid-greys: near-black on cream, or white on a deep
  colour. The subtle `text-gray-400` that looks elegant on your MacBook is invisible from row three.
- **Never signal status with colour alone** — every badge carries its text label. Survives bad
  projectors and colour-blind judges alike.

**Festive palette** (it's a festive-season hackathon — this is scoring surface, not vanity):
- Background: warm cream `#FDF8F0`
- Primary: deep maroon `#7B2D3B`
- Accent: marigold amber `#E8A33D`
- Status: green `#1B7F4C` · amber `#E8A33D` · red `#C0392B` · grey `#6B7280`
- One diya or marigold motif in the header. **One.** Resist the urge to decorate further.

Everything else is shadcn defaults. You are not building a design system today.

### 3.10 Orchestration: custom, not Vapi / Bolna / LiveKit / Pipecat

A fair question, and worth having the answer ready. **We hand-roll the loop** — push-to-talk →
Sarvam REST STT → our agent loop (§5.3) → Sarvam REST TTS. No voice-agent framework.

| Option | What it gives | Why not today |
|---|---|---|
| **Custom (chosen)** | Total control of the tool loop and the policy gate; nothing new to learn | You give up barge-in and natural turn-taking |
| **Vapi** | Hosted telephony, streaming, interruption handling | Tool calls run through *their* webhook model. Parking a conversation mid-turn for a human approval is fighting the framework. Another account, another unknown. |
| **Bolna** | Open-source, Indian-language focus, self-hostable | Good cultural fit, but it's a third unknown in a nine-hour window |
| **LiveKit Agents / Pipecat** | Real streaming, barge-in, and Sarvam publishes worked examples for both | **The Sarvam plugin is Python.** Our stack is TypeScript end-to-end — adopting it means a second service in a second language, which is exactly the three hours of glue we cut in §8. |

**The real reason is architectural, and it's the one to say out loud.** Diya's whole thesis is that
a policy gate sits *synchronously* between the model proposing an action and that action executing
— with a branch that can park the conversation and wait on a human. Voice frameworks are built to
route function calls straight through to your handler and keep the conversation flowing. Inserting
a blocking authorisation step with a human-approval fork is not the shape they're designed for.
Owning the loop is what makes the product's core claim possible.

**And push-to-talk makes the trade-off cheap.** The main thing a framework buys you is turn
detection — knowing when the customer stopped speaking. Hold-to-talk removes that problem entirely:
the user tells you, by releasing the button. We give up barge-in, which no one will miss in a
three-minute demo.

**Rule 7 angle:** you have to explain your code to a judge. You can explain forty lines of your own
loop. Explaining why someone else's framework did something unexpected, live, is a worse position.

**Roadmap, if this became real:** telephony via **Sarvam Samvaad** (AI calling on your own numbers,
staying inside the Sarvam stack), or LiveKit/Pipecat with the Sarvam plugins if you want streaming
and barge-in badly enough to run a Python service alongside. Both are post-hackathon work.

---

## 4. Data model (Prisma)

Every table carries `tenantId`. Every query goes through a scoped helper — never a bare
`prisma.order.findMany()`.

```prisma
model Tenant {
  id        String   @id @default(cuid())
  slug      String   @unique          // "festive-mart", "sweet-co"
  name      String
  brandTone String   @default("warm")

  // The integration seam (§1.1). Null = use the built-in mock adapter.
  // Two minutes to add, and it makes the onboarding story concrete on screen.
  adapter        String  @default("mock")   // "mock" | "webhook"
  webhookBaseUrl String?
  apiKeyRef      String?                    // secret-manager REFERENCE, never the key itself
}

model Customer {
  id            String  @id @default(cuid())
  tenantId      String
  name          String
  phone         String
  preferredLang String  @default("hi-IN")
  @@index([tenantId])
}

model Order {
  id            String      @id              // "ORD-1042"
  tenantId      String
  customerId    String
  items         Json                         // [{ name, qty, priceInr }]
  amountInr     Int
  status        OrderStatus                  // PLACED DISPATCHED DELAYED DELIVERED CANCELLED
  isFestiveGift Boolean     @default(false)
  promisedAt    DateTime
  deliveredAt   DateTime?
  riderEtaMins  Int?
  refundedInr   Int         @default(0)
  placedAt      DateTime    @default(now())
  @@index([tenantId, customerId])
}

model Ticket {
  id             String   @id @default(cuid())
  tenantId       String
  customerId     String
  orderId        String?
  channel        Channel                      // VOICE | CHAT
  language       String
  status         TicketStatus                 // OPEN AUTO_RESOLVED AWAITING_APPROVAL ESCALATED CLOSED
  resolutionType String?                      // REFUND INFO HUMAN
  issueCluster   String?                      // late_delivery | missing_item | ...
  promptVariant  String?                      // "A" | "B"  (stretch: A/B test)
  openedAt       DateTime @default(now())
  resolvedAt     DateTime?
  @@index([tenantId, status])
}

model Message {
  id        String   @id @default(cuid())
  tenantId  String
  ticketId  String
  role      Role                               // CUSTOMER | AGENT | SYSTEM
  text      String
  lang      String?
  latencyMs Int?
  createdAt DateTime @default(now())
  @@index([tenantId, ticketId])
}

// The audit trail. This table IS the pitch.
model AgentAction {
  id             String   @id @default(cuid())
  tenantId       String
  ticketId       String
  tool           String
  args           Json
  policyDecision Decision                      // ALLOW | DENY | REQUIRE_HUMAN
  denyReason     String?
  flagSnapshot   Json                          // exact flag values at decision time
  executed       Boolean  @default(false)
  result         Json?
  createdAt      DateTime @default(now())
  @@index([tenantId, ticketId])
}

// Opened when policy says REQUIRE_HUMAN; closed by the NudgeBee callback.
model Approval {
  id            String   @id @default(cuid())
  tenantId      String
  ticketId      String
  agentActionId String
  status        ApprovalStatus @default(PENDING)  // PENDING APPROVED REJECTED
  approver      String?
  workflowRunId String?                           // NudgeBee run reference
  createdAt     DateTime @default(now())
  decidedAt     DateTime?
  @@index([tenantId, status])
}

// Define these or `prisma db push` fails. Ten minutes you don't want to lose at 10:00.
enum OrderStatus    { PLACED  DISPATCHED  DELAYED  DELIVERED  CANCELLED }
enum Channel        { VOICE  CHAT }
enum TicketStatus   { OPEN  AUTO_RESOLVED  AWAITING_APPROVAL  ESCALATED  CLOSED }
enum Role           { CUSTOMER  AGENT  SYSTEM }
enum Decision       { ALLOW  DENY  REQUIRE_HUMAN }
enum ApprovalStatus { PENDING  APPROVED  REJECTED }
```

**Seed data — ~20 orders across 2 tenants.** Make it festive and specific: a late Diwali sweet
box, a missing diya set from a 6-item order, a wrong kurta size delivered the day before a
function, and the **₹6,800 gift hamper deliberately above the auto-refund ceiling** — that one
order is what drives the NudgeBee half of the demo.

---

## 5. The agent

### 5.1 Tools — three only

Cut from five. Nine hours does not buy you `reorder` or `apply_festive_credit`.

| Tool | Writes? | Policy-gated |
|---|---|---|
| `get_order_status(orderId)` | no | tenant scope only |
| `issue_refund(orderId, amountInr, reason)` | yes | **yes** — the whole demo |
| `escalate_to_human(summary, urgency)` | yes | **never blocked** — always available |

Keep the schemas flat and strictly typed. Open-weight models are far more reliable with three
flat tools than with twelve nested ones.

### 5.2 Prompt structure

```
SYSTEM
  identity + brand tone (from tenant)
  festive context: "It is Diwali week. Deliveries are delayed. Be warm and specific."
  hard constraints: never promise a refund you have not been told was executed;
                    never invent an ETA; if unsure, escalate.
  language rule: reply in the SAME language/script mix the customer used.
  approval rule: if an action needs approval, say so plainly and warmly.

CONTEXT  (injected, not retrieved — no RAG)
  customer: name, past complaint count
  order: id, items, amount, status, promisedAt, riderEta, isFestiveGift, refundedInr
  policy summary: "Refunds up to Rs {auto_refund_limit_inr} can be issued automatically."

TOOLS   3 definitions

HISTORY last 6 turns
```

The prompt **text** gets written at 09:00 — it's a build artifact, and it needs real iteration
against the model. This is the shape it takes, not the words.

### 5.3 The tool-calling loop — the gap that would have cost you most

Tool use is a loop, not the straight line drawn in §3.1. One customer utterance typically costs
**two LLM calls**: one that decides to fetch the order and act, one that composes the spoken reply
from the results.

```
messages = [system, context, ...history, userTurn]

for i in 0..3:                          # HARD CAP: 4 iterations
    resp = llm(messages, tools)

    if no tool_calls in resp:
        return resp.content             # this is the spoken reply. done.

    for each tool_call:
        verdict = policy.authorise(call)
        result  = verdict == ALLOW ? execute(call) : refuse(verdict)
        messages.append(toolResultMessage(call.id, result))

# cap exhausted -> force escalation, never loop forever
return forceEscalate("Main aapko team se connect kar raha hoon")
```

**Four rules that keep this safe. Each one prevents a real failure you will otherwise hit.**

1. **Hard cap of 4 iterations.** On exhaustion, force `escalate_to_human` and give a holding reply.
   An unbounded loop on a conference wifi is how you end a demo.
2. **One write per customer turn.** If the model proposes a second write tool in the same turn,
   return a tool result refusing it (`"one action per turn"`) rather than executing. This is your
   double-refund guard, and it is cheaper and more reliable than hoping the prompt holds.
3. **Tool results carry the policy verdict**, so the model can phrase the outcome truthfully:
   - `ALLOW` → `{ ok: true, refundedInr: 1450, newStatus: "REFUNDED" }`
   - `DENY` → `{ ok: false, reason: "order older than 7 days" }` — model explains, does not retry
   - `REQUIRE_HUMAN` → `{ ok: false, pending: true, approvalId: "..." }` — model says it's being approved
4. **No negotiation.** Never hint at the ceiling in a tool result (*"try a smaller amount"*). The
   model will haggle its way down to an auto-approvable refund, which is exactly the behaviour the
   policy engine exists to prevent.

### 5.4 Order disambiguation — deterministic, not the model's job

The customer says *"mera order nahi aaya"* and has three open orders. Resolve this in the context
builder, before the model ever sees it.

| Customer's orders in a problem state* | What the context builder injects |
|---|---|
| Exactly one | That order as `focusOrder`. The agent acts on it directly. |
| More than one | Up to 3 most recent as a list. Prompt instructs **one** disambiguating question naming the items — *"Diwali sweet box wala ya kurta wala?"* |
| None | The single most recent order, whatever its state. |

\* *problem state = `DELAYED`, or `DISPATCHED` past `promisedAt`, or `DELIVERED` within 24 h*

**Security rule, enforced in the policy engine:** a tool call is rejected if its `orderId` is not
one of the orders injected into this ticket's context. This stops the model being talked into
probing order IDs it was never given — including another tenant's. It is two lines of code and it
is a good answer to a sharp judge.

### 5.5 Ticket lifecycle — when does a ticket close?

```
                   write tool, ALLOW + executed
   OPEN ─────────────────────────────────────────────► AUTO_RESOLVED
     │                                                       ▲
     │   REQUIRE_HUMAN                                       │ callback APPROVED
     ├──────────────────► AWAITING_APPROVAL ─────────────────┤
     │                             │ callback REJECTED       │
     │                             └────────────────► ESCALATED
     │   escalate_to_human                                   ▲
     ├───────────────────────────────────────────────────────┘
     │
     └─ info-only answer → stays OPEN (ops closes it manually)
```

- A ticket is created on the **first** turn; every later turn passes `ticketId` back in.
- `resolvedAt` is stamped on entry to `AUTO_RESOLVED` or `ESCALATED`.
- **Auto-resolution rate** = `AUTO_RESOLVED ÷ (all tickets not in OPEN)`. Decide this now so the
  number on the dashboard matches the number you say on stage.
- An approval that arrives for a ticket already out of `AWAITING_APPROVAL` is ignored — see §7.3.

### 5.6 The adapter seam — 15 minutes that answers "is this a product?"

The tools must not talk to Prisma directly. Put one interface between them and the data, and the
integration story in §1.1 stops being a slide and becomes a file you can open in front of a judge.

```ts
// lib/adapters/types.ts
export interface CommerceAdapter {
  getOrders(customerId: string): Promise<Order[]>
  getOrder(orderId: string): Promise<Order | null>
  issueRefund(orderId: string, amountInr: number, reason: string): Promise<RefundResult>
}

// lib/adapters/mock.ts     -> reads our seeded Postgres      (BUILD THIS)
// lib/adapters/webhook.ts  -> calls the brand's REST API     (ROADMAP - do not build)

export function adapterFor(tenant: Tenant): CommerceAdapter {
  return tenant.adapter === "webhook"
    ? new WebhookAdapter(tenant.webhookBaseUrl!, resolveSecret(tenant.apiKeyRef!))
    : new MockAdapter(tenant.id)
}
```

**Build `MockAdapter` only.** `WebhookAdapter` is a roadmap item — do not write it tomorrow, you
do not have the hours and nothing in the demo exercises it.

The point is the *seam*, not the second implementation. When a judge asks "could a real brand plug
this in?", you open `types.ts` and say: *this is the whole integration contract — three methods.
Today it reads our demo database; in production it calls the brand's API. The agent, the policy
engine and the approval flow don't change either way.* That answer costs you fifteen minutes and
it is the difference between "nice demo" and "they thought about the product."

---

## 6. Flagsmith — this is the second-prize play, make it excellent

Rule 5 puts second place on **best use of Flagsmith**. Most teams will flag a feature on and off.
Our angle: **the flags control how much autonomy an AI has over real money.** That is a use case
their own marketing hasn't got, and it's worth saying out loud to the judges.

Evaluated **server-side only** — a client-evaluated flag controlling refund limits is a security
hole, and a judge may well ask.

| Flag | Type | Default | Purpose |
|---|---|---|---|
| `ai_agent_enabled` | boolean | true | Master kill switch — everything routes to humans |
| `auto_refund_limit_inr` | number | 2000 | **The live demo flip** |
| `human_approval_above_inr` | number | 5000 | Above this → NudgeBee approval, always |
| `festive_surge_mode` | boolean | false | Raises limits + switches to empathetic tone |
| `enabled_languages` | string | `hi,en,kn,ta` | Unsupported language → escalate politely |
| `agent_prompt_variant` | multivariate | A 50 / B 50 | **Stretch** — the A/B experiment |

Trimmed from nine to six. Six you can demo beats nine you can't.

**Per-tenant targeting:** identify as `tenant:<slug>` with traits `{ plan, monthlyTickets }`.
Set `festive-mart` to ₹5,000 and `sweet-co` to ₹500 — one platform, two risk appetites. That's
your multi-tenancy proof in ten seconds of screen time, and it's a real Flagsmith feature being
used for what it's for.

**Every decision snapshots the flags into `AgentAction.flagSnapshot`.** Six months later you can
answer "why did it refund that?" exactly. Show this on the ticket detail page.

---

## 7. NudgeBee — the human-approval layer

### 7.1 What it does for us

When the policy engine returns `REQUIRE_HUMAN`, we trigger a NudgeBee workflow:

```
  Policy: REQUIRE_HUMAN (Rs 6,800 > Rs 2,000 ceiling)
        |
        v
  [ Event task ]      store the escalation event for triage / AI analysis
        |
        v
  [ Discord notify ]  post to the ops channel with order + customer + amount
        |
        v
  [ Approval task ]   human clicks Approve or Reject
        |
        v
  [ HTTP request ]    POST back to /api/approvals/callback with the decision
        |
        v
  Diya executes or denies the refund, closes the ticket, logs the outcome
```

This is **exactly** what NudgeBee's Approvals feature is documented for — "add a human approval
step before any change." We are not bending the tool; we're using it as intended, on a business
action instead of a cluster action.

### 7.2 ⚠️ The biggest unknown in this plan

NudgeBee is a Kubernetes AIOps platform. Its agent install assumes a cluster (EKS/GKE/AKS or a
local kind/minikube). **I don't know whether the Workflow Builder, Approvals and HTTP tasks work
without a cluster attached.** If they need one, that's a chunk of your nine hours gone on Helm.

**Mitigation — do this at 09:05, before anything else:**

> **Walk to the NudgeBee booth or their Discord and ask one question:**
> *"What's the fastest path to a workflow with an approval step and an HTTP callback, with no
> real cluster? Can we run it with a throwaway kind cluster, or none at all?"*

Sponsors are physically on the floor and want you to use their tool. Five minutes of their time
could save you two hours. Same for Sarvam and Flagsmith if you hit a wall.

**Fallback if NudgeBee setup is eating the clock:** spin up a throwaway `kind` cluster per their
local-setup guide, attach it, and use the Workflow Builder purely for the approval + HTTP tasks.
Don't let a cluster install block the Sarvam or Flagsmith work — Lane B owns this in parallel.

**Harder fallback (only if it's truly blocked by 15:00):** implement approvals natively in the
console and demo NudgeBee for ops alerting on ticket-volume events instead. You lose the first-prize
requirement but keep a working product and the Flagsmith second-prize play. Make this call at
15:00, not at 17:00.

### 7.3 Security note

The callback endpoint is a public URL that approves money movements. Verify a shared secret from
env on every request, check the approval is still `PENDING`, and make it idempotent — a replayed
callback must not refund twice.

---

## 8. Stack & repo layout

**Next.js 15 (App Router) + TypeScript, end to end.** One language, one repo, one deploy. Node 24
is already installed on your machine.

- UI: Tailwind + shadcn/ui
- DB: Neon Postgres (free tier) + Prisma
- Flags: `flagsmith-nodejs`
- Sarvam: `sarvamai` npm SDK, or plain `fetch` against the REST API
- Deploy: Vercel, connected in the first hour

```
diya/
├─ app/
│  ├─ demo/page.tsx                  customer voice widget        (§3.7)
│  ├─ stage/page.tsx                 demo + console, side by side (§3.8) - present from here
│  ├─ console/page.tsx               ticket feed + metrics + pending approvals (§3.5)
│  ├─ console/tickets/[id]/page.tsx  transcript + audit trail + flag snapshot
│  └─ api/
│     ├─ voice/turn/route.ts
│     ├─ approvals/callback/route.ts
│     ├─ console/{tickets,metrics,approvals}/route.ts
│     └─ demo/reset/route.ts
├─ components/
│  ├─ voice/{PushToTalk.tsx,LevelMeter.tsx,Transcript.tsx,ActionCard.tsx}
│  └─ console/{MetricTiles.tsx,TicketFeed.tsx,AuditTrail.tsx,FlagSnapshot.tsx,ApprovalPanel.tsx}
├─ lib/
│  ├─ sarvam/{stt.ts,tts.ts,llm.ts}
│  ├─ adapters/{types.ts,mock.ts}     ← the integration seam (§5.6); webhook.ts is roadmap
│  ├─ agent/{orchestrator.ts,tools.ts,prompts.ts}
│  ├─ policy/{engine.ts,rules.ts}     ← pure functions, unit-testable
│  ├─ flags/{client.ts,keys.ts}
│  ├─ nudgebee/{trigger.ts}
│  └─ db/{prisma.ts,scoped.ts}        ← scoped.ts enforces tenantId
├─ prisma/{schema.prisma,seed.ts}
└─ .env.example
```

### Secrets & isolation — non-negotiable, and it's a slide

- `SARVAM_API_KEY`, `FLAGSMITH_SERVER_KEY`, `NUDGEBEE_*`, `APPROVAL_CALLBACK_SECRET`,
  `DATABASE_URL` live in env vars only. Never in the client bundle, never committed.
  Commit `.env.example` with empty values. **The repo is public — check this before every push.**
- **All Sarvam calls are server-side.** The browser posts audio to our route; it never sees the key.
- Every DB read/write goes through `lib/db/scoped.ts`, which takes `tenantId` first. No raw Prisma
  calls in route handlers.
- Policy decisions and flag evaluation: server-side only.

---

## 9. Sarvam integration notes (verified 24 Nov 2026)

- **STT:** `/speech-to-text` now defaults to **`saaras:v3`**. Handles code-mixed Hinglish, which is
  the whole point. `saarika:v2.5` is legacy — only pass it if you want the old behaviour.
- **Audio formats (checked — this risk is closed):** the REST API accepts WAV, MP3, M4A, AAC, OGG,
  FLAC, **WebM**, OPUS and more. MediaRecorder's `audio/webm;codecs=opus` uploads directly, with
  **no transcoding**. Recommended: 16 kHz+, 16-bit, mono. Keep clips **under 30 s** — longer audio
  belongs on the Batch API. The *streaming* WebSocket path is the narrow one (WAV / raw PCM only,
  16 kHz or 8 kHz), which is another reason we aren't using it.
- **TTS:** **`bulbul:v3`**. Returns **base64-encoded audio** — decode before playing or saving.
- **LLM:** Token Factory is OpenAI-compatible. Point the OpenAI SDK at Sarvam's base URL and change
  the `model` field; tool-calling works through the standard interface.
- **Key:** the SDK reads `SARVAM_API_KEY` from the environment. Do that; don't pass it literally.
- ⚠️ **Known doc inconsistency:** pages disagree on the client constructor arg
  (`api_subscription_key` vs `api_key`) and the language param (`target_language_code` vs
  `language_code`). **Verify both against the installed SDK in the first 20 minutes.** This is the
  single most likely thing to burn an hour.
- Docs are served over MCP, which is worth wiring into your editor before 09:00 (that's research,
  not code): `claude mcp add sarvam-docs --transport http https://docs.sarvam.ai/_mcp/server`

---

## 10. Explicitly NOT building

Write this on paper and tape it to the table.

❌ Auth / signup &nbsp; ❌ Real telephony &nbsp; ❌ RAG (hardcode 5 policies) &nbsp; ❌ Image classification
❌ Freshdesk / Zoho &nbsp; ❌ WebSocket streaming voice &nbsp; ❌ Mobile app &nbsp; ❌ Dark mode
❌ `reorder` and `apply_festive_credit` tools &nbsp; ❌ Human-agent chat UI &nbsp; ❌ QA scoring*
❌ Analytics clustering* &nbsp; ❌ A/B experiment*

\* *Stretch only, after 16:00 freeze is met and the video is recorded. Most likely: never.*

Everything here is a **roadmap slide**. None of it is code today.

---

## 11. Risks & pre-planned fallbacks

| Risk | Likelihood | Fallback — build it *before* you need it |
|---|---|---|
| **NudgeBee needs a cluster we don't have** | **High** | Ask at their booth at 09:05. Throwaway `kind` cluster. Decision point at 15:00 (§7.2). |
| Venue wifi dies mid-demo | High | **Record the demo video at 16:00.** It's a submission requirement anyway. Keep it on a phone, offline. |
| Mic picks up hall noise | High | Headset mic + push-to-talk, plus a **"play sample audio"** button with 3 pre-recorded Hinglish clips. |
| Sarvam SDK arg mismatch | High | Verify in the first 20 minutes. Fall back to raw `fetch` against the REST API. |
| Sarvam rate limit / 429 | Medium | Retry once with backoff, then text-only reply. |
| LLM returns malformed tool call | Medium | Strict schema, one retry, then auto-`escalate_to_human`. **Never throw.** |
| Demo state dirty after a run | High | `POST /api/demo/reset` wired to a console button. Use it between every rehearsal. |
| Flagsmith caches too long | Low | Cache TTL 5s so the on-stage flip is visibly instant. |
| Secrets pushed to a public repo | Medium | `.env.local` gitignored before the first commit. Check `git status` every time. |

---

## 12. Pitch — 6 slides, demo-heavy

1. **The problem** — festive volume 4–5x, queues collapse, it's Hinglish voice, not English chat.
2. **Diya + the three layers** — the §2 diagram. One sentence per sponsor. This slide answers
   "did they really use all three?" before anyone asks.
3. **Live demo part 1** — the call, the auto-refund, the console.
4. **Live demo part 2** — the Flagsmith flip, then the ₹6,800 hamper → NudgeBee approval → refund executes.
5. **Proof** — audit trail with flag snapshots, per-tenant limits, auto-resolution rate.
6. **What's next** — telephony, image classification, Freshdesk connector, multi-tenant SaaS.

### Judge Q&A — rehearse these five

- *"What stops a hallucinated ₹50k refund?"* → The policy engine. The LLM only proposes. Show the code.
- *"How is this different from Zomato's Nugget?"* → Nugget is English-first and internal. We're
  voice-first, Indic-first, and we expose the autonomy dial to the ops team as a product surface.
- *"Multi-tenant data leakage?"* → `tenantId` on every table, every query through a scoped helper,
  per-tenant flag targeting. Show `scoped.ts`.
- *"Is NudgeBee doing real work here?"* → It owns the approval path for every action above the
  flag ceiling. Show the workflow canvas and the callback.
- *"How would a real business actually plug this in?"* → **Open `lib/adapters/types.ts`.** Three
  methods. Today it reads our demo database; in production it calls the brand's own order API, so
  we never copy their data. Two endpoints and a script tag — about half a day of their time. Then
  §1.2: five onboarding steps, and the brand sets its own refund ceiling in Flagsmith.
- *"Why not Vapi / Bolna / LiveKit?"* → §3.10. The policy gate has to sit synchronously between
  proposal and execution, with a branch that parks the conversation for human approval. Voice
  frameworks route function calls straight through — that's the wrong shape for us. Also, the
  Sarvam plugin for LiveKit/Pipecat is Python and we're TypeScript end-to-end.
- *"Does it actually work in Hinglish?"* → Hand them the mic.

**Rule 7 disclosure:** say plainly that you used an AI assistant, and be ready to explain any file
a judge points at. Put the disclosure in the README too.

---

## 13. Tonight — research and accounts only (~75 min)

> **Rule 4: no coding.** Accounts, reading and agreeing the contract are explicitly allowed.
> Do not scaffold the repo.

- [ ] Sarvam: sign up at `dashboard.sarvam.ai`, generate an API key, make **one TTS curl call**
- [ ] Flagsmith: sign up, create project `diya`, create the 6 flags from §6
- [ ] NudgeBee: sign up, **read the Workflow Builder + Approvals + HTTP task docs**, and find out
      whether a cluster is required. Ask in their Discord tonight if it's unclear.
- [ ] Neon: create a Postgres DB, copy the connection string into a note
- [ ] Vercel: account linked to GitHub
- [ ] Create the **public** GitHub repo, empty (rule 8 requires a public repo; an empty one is not code)
- [ ] Both read: Sarvam quickstart, Flagsmith getting-started, NudgeBee workflow docs
- [ ] **Agree the API contract in §3.4** — paste it in your group chat so it's settled before 09:00
- [ ] Decide lanes: Avez = voice + agent + policy, Subramanya = schema + console + flags + NudgeBee
- [ ] Pack: headset mic, HDMI adapter, phone hotspot, chargers, power strip
- [ ] Sleep. Nine hours is a sprint, not a marathon.
