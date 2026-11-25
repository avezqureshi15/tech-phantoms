# Diya — 9-Hour Run Sheet

**25 Nov 2026 · 09:00–18:00 IST · BIEC Bengaluru.** Submissions close at 18:00, hard.
Companion to [BUILD-PLAN.md](BUILD-PLAN.md). Keep this open all day.

**Lane A — Avez** · voice pipeline, agent loop, policy engine
**Lane B — Subramanya** · schema, seed, console, Flagsmith, NudgeBee

> **Rule 4: no code before 09:00.** Tonight is accounts, docs and the API contract only.

> **Every design decision is already settled in BUILD-PLAN.** Enums §4 · tool loop §5.3 ·
> order disambiguation §5.4 · ticket lifecycle §5.5 · console columns and metric formulas §3.5 ·
> audio capture §3.6 · **demo page layout and action card §3.7 · stage view §3.8 · palette and
> projector rules §3.9**. **Do not redesign these on the floor** — look them up and build.
> The two things deliberately left for the day are the system prompt text (§5.2) and the seed
> data (§4), because both need iterating against the real model.

---

## The clock

| Time | Block | Owner |
|---|---|---|
| 09:00–09:30 | Setup, wifi, **NudgeBee booth question** | both |
| 09:30–10:45 | Foundation — repo, schema, seed, deploy | both (pair) |
| 10:45–13:00 | Parallel: Sarvam round-trip ‖ console + flags + NudgeBee | split |
| 13:00–13:30 | Working lunch (keep building if it's going well) | — |
| 13:30–15:00 | Agent loop + policy engine | split |
| 15:00–16:00 | NudgeBee approval loop + the Flagsmith flip | both |
| **16:00** | 🔒 **FEATURE FREEZE** | — |
| 16:00–16:45 | Harden + **record the demo video** | both |
| 16:45–17:30 | README, deck, rehearse 3x | split |
| 17:30–18:00 | **Submit**, then buffer | both |

### Gates — miss one and cut immediately

| Gate | By | If you miss it |
|---|---|---|
| **G1** Hinglish audio in → Hindi audio out | **13:00** | Drop voice, go chat-first. Don't mention voice on stage. |
| **G2** Real refund executes; over-limit one is blocked | **15:00** | Drop the console polish. The refund path is the product. |
| **G3** NudgeBee approval fires and calls back | **16:00** | Take the §7.2 fallback. Decide at 15:00, not 17:00. |
| **G4** Demo video recorded | **16:45** | Nothing to fall back on — rule 8 requires it. Record whatever works. |

---

## Tonight — research only (~75 min)

- [ ] Sarvam: API key, **one successful TTS curl call**
- [ ] Flagsmith: project `diya`, create the 6 flags (BUILD-PLAN §6)
- [ ] NudgeBee: sign up, read Workflow Builder + Approvals + HTTP task docs
- [ ] **Find out if NudgeBee needs a cluster** — ask in their Discord tonight if unclear
- [ ] Neon DB created, connection string saved
- [ ] Vercel linked to GitHub; **public** repo created, empty
- [ ] API contract (BUILD-PLAN §3.4) agreed and pasted in the group chat
- [ ] Lanes agreed; `claude mcp add sarvam-docs` wired into your editor
- [ ] Packed: headset mic, HDMI adapter, hotspot, chargers, power strip
- [ ] Sleep

---

## 09:00–09:30 · Setup

- [ ] Wifi on, hotspot tested as backup
- [ ] **One of you walks to the NudgeBee booth immediately.** Ask: *"Fastest path to a workflow
      with an approval step and an HTTP callback, with no real cluster?"* This is the highest-leverage
      five minutes of your day.
- [ ] Other one: `npx create-next-app@latest diya` — TypeScript, Tailwind, App Router
- [ ] Confirm start time and demo format with organisers (how long do you get on stage?)

---

## 09:30–10:45 · Foundation — pair on this

Everything downstream depends on getting this right once.

- [ ] Install: `prisma @prisma/client flagsmith-nodejs sarvamai openai`
- [ ] shadcn/ui init → `button card table badge tabs dialog sonner`
- [ ] **Tailwind palette tokens from §3.9** (cream / maroon / marigold / 4 status colours) +
      base font ≥16px. **Timebox 20 minutes.** Doing this now means every component is on-theme
      for free; doing it at 17:00 means restyling everything.
- [ ] **`.env.local` in `.gitignore` — verify BEFORE the first commit. The repo is public.**
- [ ] `.env.example` committed with empty keys
- [ ] Prisma schema from BUILD-PLAN §4 — **include all 6 enum blocks** or `db push` fails → `prisma db push` to Neon
- [ ] `lib/db/prisma.ts` (singleton) + `lib/db/scoped.ts` (tenantId-first helpers)
- [ ] **`lib/adapters/types.ts` + `mock.ts` (§5.6) — 15 min.** Tools call the adapter, never Prisma
      directly. Build `MockAdapter` only; `webhook.ts` is roadmap. This file is your answer when a
      judge asks whether a real brand could plug this in.
- [ ] `prisma/seed.ts` — 2 tenants, 6 customers, ~20 festive orders **including the ₹6,800 hamper**
- [ ] `POST /api/demo/reset` — truncate tickets/messages/actions/approvals, reseed
- [ ] **Deploy to Vercel now** with env vars set. Hello-world at hour one, not hour eight.
- [ ] Both laptops: `npm run dev` works, seeded orders visible, Vercel URL loads

---

## 10:45–13:00 · Parallel build

### Lane A — Sarvam round-trip 🎯 **G1**

- [ ] **First 20 min: verify the SDK constructor arg and language param** against the installed
      version (BUILD-PLAN §9). Fall back to raw `fetch` if the SDK fights you.
- [ ] `lib/sarvam/stt.ts` — audio Blob → text + detected language (`saaras:v3`)
- [ ] `lib/sarvam/tts.ts` — text + lang → base64 audio (`bulbul:v3`), decode before playback
- [ ] `lib/sarvam/llm.ts` — OpenAI SDK → Token Factory, **confirm tool-calling works**
- [ ] `app/demo/page.tsx` — **layout is drawn in §3.7**: header pickers, hold-to-talk with level
      ring, transcript with language + latency tags, sample-clip dropdown, reset button
- [ ] **`ActionCard` component (§3.7)** — green / amber / red / grey by outcome. This is the visual
      payoff of the whole demo; don't bury the result in agent text.
- [ ] Audio capture per §3.6: mic permission on page load, `audio/webm;codecs=opus`, 20 s auto-stop,
      live level meter. WebM uploads to Sarvam as-is — no transcoding.
- [ ] `POST /api/voice/turn` with a stub agent (echo transcript back through TTS)
- [ ] **Record 3 Hinglish sample clips + a "play sample" button** — your noise fallback
- [ ] Log `latencyMs` per stage from the start

### Lane B — Console, flags, NudgeBee setup

- [ ] `lib/flags/client.ts` — Flagsmith server SDK, identity `tenant:<slug>`, **cache TTL 5s**
- [ ] `lib/flags/keys.ts` — typed accessors, no magic strings elsewhere
- [ ] `app/console/page.tsx` — ticket feed (polls 2s), 4 metric tiles, tenant switcher.
      **Exact columns and tile formulas are in §3.5 — build them, don't redesign them.**
- [ ] `GET /api/console/tickets?since=` + `/metrics`
- [ ] `app/console/tickets/[id]/page.tsx` — the 5 stacked sections from §3.5 (mock data fine).
      Audit trail and flag snapshot get the most visual weight; they are the pitch.
- [ ] **NudgeBee: get a workflow running end-to-end with dummy data.** Event → Discord → Approval →
      HTTP POST to a `requestbin`-style URL. Prove the shape works before wiring it to Diya.
- [ ] Read-only flag mirror panel in the console header

**🚦 G1 at 13:00** — speak Hinglish, hear a Hindi reply. If not, go chat-first now and say nothing.

---

## 13:00–13:30 · Working lunch

Eat. Sync for 5 minutes: what's done, what's at risk, is G3 still realistic.

---

## 13:30–15:00 · Agent + policy 🎯 **G2**

### Lane A
- [ ] `lib/agent/tools.ts` — the **3** tool schemas, strictly typed
- [ ] `lib/agent/prompts.ts` — write the system prompt text (shape is in §5.2), plus the context builder
- [ ] **Context builder implements the §5.4 disambiguation table** — one problem order → focus it;
      several → inject 3 and ask one question; none → most recent
- [ ] `lib/agent/orchestrator.ts` — **the §5.3 loop**: cap 4 iterations, one write tool per turn,
      tool results carry the policy verdict, never hint at the ceiling
- [ ] Malformed tool call → one retry → fall back to `escalate_to_human`. **Never throw.**
- [ ] Real orchestrator wired into `/api/voice/turn`

### Lane B
- [ ] `lib/policy/rules.ts` — **hard rules**: tenant ownership, order age < 7d, no double refund, amount > 0
- [ ] **`orderId` must be one injected into this ticket's context** — reject anything else (§5.4 security rule)
- [ ] Ticket state machine per §5.5; stamp `resolvedAt` on `AUTO_RESOLVED` / `ESCALATED`
- [ ] `lib/policy/engine.ts` — hard rules + flags → `ALLOW | DENY | REQUIRE_HUMAN` + reason
- [ ] 4–5 unit tests on the engine (10 min; it's also a slide: "the money path is tested")
- [ ] Persist `AgentAction` with `flagSnapshot` on **every** decision, allowed or not
- [ ] Ticket detail renders the real audit trail — proposed vs executed, deny reasons, flag snapshot

**🚦 G2 at 15:00** — a ₹1,450 refund executes; the ₹6,800 hamper returns `REQUIRE_HUMAN`.
**Also at 15:00: decide whether NudgeBee is viable.** If not, take the BUILD-PLAN §7.2 fallback now.

---

## 15:00–16:00 · NudgeBee approval loop + the Flagsmith flip 🎯 **G3**

### Lane A — the stage view (§3.8)
- [ ] `app/stage/page.tsx` — demo left 40%, console feed right 60%, one screen, no alt-tab
- [ ] Live ticket highlighted and pinned to the top of the feed
- [ ] Audit rows appear as they happen, while the call is still running
- [ ] **Cut this first if G3 is at risk.** The demo still works, you just alt-tab.

### Lane B — NudgeBee
- [ ] `lib/nudgebee/trigger.ts` — fire the workflow on `REQUIRE_HUMAN`, create an `Approval` row
- [ ] `POST /api/approvals/callback` — **verify the shared secret**, check status is still `PENDING`,
      make it **idempotent** (a replayed callback must not refund twice)
- [ ] Approved → execute refund, close ticket. Rejected → mark escalated, notify.
- [ ] Pending approvals panel in the console (so the state is visible without leaving the app)
- [ ] Discord notification working — nice visual beat during the demo
- [ ] **Rehearse the Flagsmith flip**: change `auto_refund_limit_inr` in the UI, re-run the same
      call, confirm behaviour changes within ~5s with no redeploy
- [ ] Per-tenant targeting live: `festive-mart` ₹5,000 vs `sweet-co` ₹500
- [ ] `ai_agent_enabled = false` → everything routes to human. Test it.

### 🔒 16:00 — FEATURE FREEZE. Bugs only from here.

---

## 16:00–16:45 · Harden + record 🎯 **G4**

- [ ] Run the full demo end-to-end. Then again. Fix only what breaks.
- [ ] **Projector check (§3.9): shrink the browser to 1366×768 and look at it from 3 metres away.**
      Anything you can't read, make bigger. Do this before the video, not after.
- [ ] Rehearse the amber → green flip on the action card when the approval callback lands
- [ ] Loading + error states — no raw stack traces on screen
- [ ] "Soch raha hoon…" thinking state during the 2–3s wait
- [ ] `/api/demo/reset` button in the console header, tested between runs
- [ ] Final deploy to Vercel; confirm prod env vars; confirm prod actually works
- [ ] **RECORD THE DEMO VIDEO.** Rule 8 requires it. Record at 16:30 even if something's broken —
      a video of 80% working beats no submission. Save a copy to a phone.

---

## 16:45–17:30 · README, deck, rehearse

### Lane B — README (rule 8)
- [ ] Problem + solution, architecture diagram
- [ ] **How each of the three sponsors is used** — one clear section each. Judges will look for this.
- [ ] **"How a business integrates Diya"** — the two-endpoint contract and the 5 onboarding steps
      from §1.1–§1.2. Say plainly that the demo runs on a mock adapter.
- [ ] Setup instructions that actually work from a clean clone
- [ ] `.env.example` documented
- [ ] **AI assistant disclosure (rule 7)** — state it plainly
- [ ] Demo video link

### Lane A — deck + rehearsal
- [ ] 6 slides (BUILD-PLAN §12). Slide 2 is the three-layer diagram.
- [ ] Demo script written word-for-word, timed
- [ ] Rehearse 3 full runs with `/api/demo/reset` between each
- [ ] Rehearse the Flagsmith flip until it's muscle memory
- [ ] Rehearse the 5 Q&A answers
- [ ] Tabs pre-opened in order: **`/stage`** → Flagsmith → NudgeBee workflow → ticket detail
      (the stage view replaces the demo/console alt-tab; keep ticket detail for the audit-trail beat)

---

## 17:30–18:00 · Submit

- [ ] **Submit first, polish second.** Do not leave this to 17:55.
- [ ] Public repo URL ✓ · README ✓ · demo video ✓
- [ ] `git log` — confirm no secrets ever got committed
- [ ] Both of you can explain any file a judge points at (rule 7)
- [ ] One last full rehearsal if time remains

---

## The minimum that still wins

If the day goes badly, hold this floor:

1. Customer speaks Hinglish → agent transcribes it correctly *(Sarvam)*
2. Agent issues a real refund → the order record visibly changes
3. Flip a flag → the same call now needs approval *(Flagsmith)*
4. NudgeBee approval fires → you approve → refund executes *(NudgeBee)*

Four beats, ninety seconds, all three sponsors, one coherent story. Everything else is garnish.
