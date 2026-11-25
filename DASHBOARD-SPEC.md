# Diya — Dashboard & UI Specification

UI specification for Diya's operations console and its planned **outbound proactive support** expansion.
The current `/console` dashboard is the implemented baseline; sections explicitly marked planned
describe follow-on product work. Companion to [BUILD-PLAN.md](BUILD-PLAN.md).

**Planned product direction:** the brand already knows which orders are going wrong. Diya lists those
as queries, calls the customer first in their own language, resolves what it can from a knowledge
base, and classifies every call as Resolved / Ongoing / Human review.

**Stack:** React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui + react-router-dom. Geist font.
Express API on the server side.

---

## 0. Design principles — read before writing any component

1. **The console is enterprise software, not a festive brand surface.** Use neutral greys; reserve
   operational colour for status. Maroon appears only as the sidebar brand mark and `/demo` wordmark.
2. **Colour is signal, never decoration.** No coloured headings, no coloured metric numbers, no
   tinted page backgrounds.
3. **Never signal status with colour alone.** Every badge carries its text label.
4. **Sentence case everywhere.** `Auto-resolved`, not `AUTO_RESOLVED`. Never render a raw enum.
5. **This gets projected at 1366×768 and read from three metres.** Body text 14–15px, never below
   12px, secondary text no lighter than `#52525B`.
6. **Dense, but not cramped.** Dashboard rows are 40px; preserve 14px body text and high-contrast
   secondary text for the projector.

---

## 1. Design tokens

Replace the `:root` block in `web/client/src/index.css` entirely.

```css
:root {
  /* Surfaces */
  --background: #FAFAFA;
  --foreground: #18181B;
  --card: #FFFFFF;
  --card-foreground: #18181B;
  --popover: #FFFFFF;
  --popover-foreground: #18181B;

  /* Primary is near-black, NOT a colour. Buttons are black. */
  --primary: #18181B;
  --primary-foreground: #FAFAFA;
  --secondary: #F4F4F5;
  --secondary-foreground: #18181B;
  --muted: #F4F4F5;
  --muted-foreground: #52525B;
  --accent: #F4F4F5;
  --accent-foreground: #18181B;
  --border: #E4E4E7;
  --input: #E4E4E7;
  --ring: #A1A1AA;
  --destructive: #B91C1C;
  --chart-1: #18181B;
  --chart-2: #52525B;
  --chart-3: #15803D;
  --chart-4: #B91C1C;
  --chart-5: #71717A;
  --radius: 0.5rem;                 /* 8px */

  /* Sidebar */
  --sidebar: #FFFFFF;
  --sidebar-foreground: #18181B;
  --sidebar-primary: #7B2D3B;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-border: #E4E4E7;
  --sidebar-accent: #F4F4F5;       /* active nav item background */
  --sidebar-accent-foreground: #18181B;
  --sidebar-ring: #A1A1AA;

  /* Status — dark text on a very light tint. Never mid-colour on mid-tint. */
  --status-success: #15803D;       --status-success-bg: #F0FDF4;
  --status-warning: #B45309;       --status-warning-bg: #FFFBEB;
  --status-danger:  #B91C1C;       --status-danger-bg:  #FEF2F2;
  --status-neutral: #52525B;       --status-neutral-bg: #FAFAFA;

  /* Brand — used ONLY for the sidebar logo mark and /demo. Not in console chrome. */
  --brand: #7B2D3B;
}
```

**Type scale** (Geist Variable, already installed):

| Token | Size / weight | Use |
|---|---|---|
| `page-title` | 20px / 600 | Page heading |
| `section` | 15px / 600 | Card headers |
| `body` | 15px / 400 | Default |
| `table` | 14px / 400 | Table cells |
| `label` | 13px / 400, `#52525B` | Field labels, tile labels |
| `th` | 11px / 500, uppercase, `tracking-wide`, `#52525B` | Table headers |
| `mono` | 13px, `font-mono` | IDs, order numbers, phone numbers |

Numbers (amounts, counts, durations) always get `tabular-nums`. Currency and numeric columns are
right-aligned where the table structure allows it.

---

## 2. App shell

```
┌──────────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR 240  │ TOPBAR 56px                                          │
│ ◆ Diya       │  Operations / Console                    [Sandbox]   │
│              ├──────────────────────────────────────────────────────┤
│ Overview     │                                                      │
│ Tickets      │  CONTENT — full bleed, responsive padding, max-w-none│
│              │                                                      │
│              │                                                      │
│              │                                                      │
│              │                                                      │
│ ─────────    │                                                      │
│ Workspace    │                                                      │
│ Festive Mart▾│                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

**Sidebar** (`--sidebar` bg, 1px right border)
- Fixed 240px wide on desktop; collapses to compact header and horizontal navigation on mobile.
- Logo row: 32px maroon mark + "Diya" at 15px/600. Maroon is reserved for the brand mark and `/demo`.
- Current navigation: `Overview` and `Tickets`, with 16px lucide icons. Items are 36px tall,
  6–8px radius and 10px icon gap. Active = `--sidebar-accent` bg and foreground text.
- Add destinations such as Approvals, Calls, Knowledge and Settings as those planned routes ship;
  do not show dead navigation items.
- Pinned at the bottom: tenant switcher, full width, with a `Workspace` label and a 1px top border.

**Topbar** (56px, white, 1px bottom border, `px-6`)
- Left: breadcrumb, 13px. Parent in `--muted-foreground`, `›` separator, current in `--foreground`.
- Right: a compact outlined environment badge (`Sandbox` in the current app). Keep the environment
  label visible; do not use the brand maroon as a badge fill.
- Tenant selection belongs in the sidebar, not the topbar. On narrow screens it moves into the
  compact topbar so it remains reachable.
- The demo reset action stays on `/demo`; do not crowd the console topbar with demo controls.

---

## 3. Routes

| Route | Screen | State |
|---|---|---|
| `/` | Home / route chooser | Current |
| `/demo` | Inbound voice widget — keeps the **festive** brand accent | Current |
| `/console` | Operations overview, metrics, approvals and ticket feed | Current |
| `/console/tickets/:id` | Ticket detail — transcript, audit trail, flags | Current |
| `/queries` | Outbound proactive query queue | Planned |
| `/queries/:id` | Query detail + call history | Planned |
| `/calls/:id` | Call session detail — transcript, actions, outcome | Planned |
| `/approvals` | Human-review queue | Planned |
| `/knowledge` | Knowledge base list | Planned |
| `/knowledge/:id` | Article editor | Planned |
| `/settings/telephony` | Twilio | Planned |
| `/settings/voice` | Sarvam | Planned |
| `/settings/policy` | Refund ceilings, kill switch (Flagsmith mirror) | Planned |
| `/settings/workflows` | NudgeBee | Planned |
| `/settings/tenants` | Tenants + adapter config | Planned |

### 3.1 Current `/console` dashboard baseline

The current dashboard is full-width inside the app shell, not a centered `max-w-*` page. At desktop
width it fills the area to the right of the 240px sidebar; on mobile, use 16px horizontal padding.
The page order is heading and read-only flag mirror, metric tiles, pending approvals (when present),
then the recent-ticket table.

**Metric tiles** — four across on desktop, two across on small screens, `gap-4`. Each tile has a
white surface, 1px border, 8px radius, no shadow, and `px-4 py-3.5`:

| Tile | Value |
|---|---|
| Tickets today | `ticketsToday` |
| Auto-resolved | `autoResolvedPct` as a percentage |
| Awaiting approval | `awaitingApproval` |
| Avg handle time | `avgHandleTimeSeconds` in seconds |

Labels are 13px/400 in `--muted-foreground`. Values are 28px/600 near-black with `tabular-nums`.
Do not colour metric values or add explanatory sub-lines that are not returned by the API.

**Pending approvals** — omit the panel when the list is empty. Otherwise render a white card with a
1px border, 3px warning-colour left accent, lucide status icon, near-black sentence-case heading,
and 14px body text. No warning-colour card fill.

**Recent-ticket table** — columns in order: `Time · Customer · Order · Lang · Issue · Status ·
Action taken · Latency`.

- Header is sticky within the table scroller, `bg-muted/40`, 11px/500 uppercase, `tracking-wide`,
  and `#52525B`.
- Rows are 40px tall with 14px text, 1px separators, `hover:bg-muted/50`, and a pointer cursor.
  The complete row opens `/console/tickets/:id`; preserve keyboard focus and Enter activation.
- Customer names are not underlined. Order IDs use 13px mono. Durations and currency use
  `tabular-nums`; align numeric values to the right where the column permits.
- Status labels are sentence case with a 6px status dot, 11px text, 4px radius, 1px border and a
  very light status tint. Never expose enum identifiers in the UI.
- Current ticket labels: `AUTO_RESOLVED` → Auto-resolved (success), `AWAITING_APPROVAL` → Awaiting
  approval (warning), `ESCALATED` → Escalated (danger), `OPEN` → Open (neutral), `CLOSED` → Closed
  (neutral).
- Action outcomes use lucide icons (`CircleCheck`, `CirclePause`, `CircleX`) and readable labels;
  do not use text glyphs such as ✓, ⏸ or ✗. Right-align any amount within the action cell.
- On narrow screens, keep the table horizontally scrollable rather than shrinking or wrapping its
  columns. The header remains sticky while scrolling the table.

The flag mirror uses compact white bordered chips and readable 12px text. API errors use a light
danger tint, a 1px border and a sentence-case message; they must not introduce a tinted page surface.

---

## 4. Planned `/queries` — outbound proactive queue

This is a future screen, not the current `/console` ticket feed. Reuse the same shell, palette,
type scale, radius, status badge and table-density rules from §0–§3.1.

### 4.1 Metric tiles — four across, `gap-4`

```
┌────────────────────┐
│ Open queries       │   label: 13px/400 #52525B
│ 12                 │   value: 28px/600 #18181B tabular-nums
│ 4 high priority    │   sub:   12px #52525B (optional)
└────────────────────┘
```
White card, 1px border, 8px radius, **no shadow**, `px-4 py-3.5`.

| Tile | Value | Sub-line |
|---|---|---|
| Open queries | count of `NEW` + `ONGOING` | `{n} high priority` |
| Contacted today | count of calls started today | `{n}% reached` |
| Auto-resolved | `RESOLVED / (RESOLVED+ONGOING+HUMAN_REVIEW)` as % | `{n} of {total} calls` |
| Needs human | count of `HUMAN_REVIEW` | `oldest {n}h ago` |

### 4.2 Filter bar

Single row, `gap-2`, below tiles, above table:
- Search input, 280px, `Search` icon, placeholder `Search customer, order or product…`
- `Status` select — All / New / Calling / Ongoing / Resolved / Needs human
- `Product` select — populated from distinct product categories
- `Priority` select — All / High / Normal
- Right-aligned: `{n} selected · Contact all` button, visible only when rows are checked

### 4.3 Query table

Columns, in this order:

| # | Column | Rendering |
|---|---|---|
| 1 | checkbox | row select |
| 2 | Priority | 8px dot — red High, grey Normal. Tooltip with the word. |
| 3 | Customer | name 14px; phone below in 12px mono `--muted-foreground` |
| 4 | Product | product name; category below in 12px `--muted-foreground` |
| 5 | Order | `font-mono` 13px |
| 6 | Issue | 1-line summary, `truncate`, `max-w-[280px]`, full text in tooltip |
| 7 | Detected | relative — `2h ago`. Absolute in tooltip. |
| 8 | Status | `StatusBadge` (§7.1) |
| 9 | Attempts | `tabular-nums`, right-aligned. `—` when 0. |
| 10 | *(action)* | **Contact button** (§4.4) |

Table behaviour:
- Header: sticky, `bg-muted/40`, `th` type token.
- Rows: 40px, `border-b --border`, `hover:bg-muted/50`, `cursor-pointer` → `/queries/:id`.
- The Contact button must `stopPropagation` so it doesn't navigate.
- Zebra striping: **none**. Hover only.

### 4.4 The Contact button

The most important control in the app.

| Query status | Button | Variant |
|---|---|---|
| `NEW` | `Contact` + `Phone` icon | primary (black) |
| `ONGOING` | `Call again` + `PhoneCall` | outline |
| `CALLING` | `In progress` + spinner | disabled |
| `RESOLVED` | `View` | ghost |
| `HUMAN_REVIEW` | `Review` + `ArrowUpRight` | outline |

Size `sm` (32px). Clicking opens the **Call drawer** (§5) — never a page navigation, so the
operator keeps the queue in view.

### 4.5 Empty states

| Condition | Copy |
|---|---|
| No queries at all | **"No open queries."** / "When an order is delayed or flagged, it shows up here." + `Reset demo` button |
| Filters match nothing | **"No queries match these filters."** + `Clear filters` |
| API unreachable | **"Can't reach the API."** / "Check the server is running on the configured port." + `Retry` |

---

## 5. The call experience — right-side drawer, 480px

Slides over the queue. The queue stays visible and keeps polling.

### 5.1 Five states

```
DIALING ──► RINGING ──► CONNECTED ──► WRAPPING_UP ──► ENDED
                 └──────────────────► FAILED
```

**Header (all states)** — customer name 15px/600, phone 12px mono, product + order 12px muted,
close `X` top-right. Closing the drawer does **not** end the call; a persistent "call in progress"
pill appears in the topbar to reopen it.

**DIALING / RINGING** — centred block:
- 64px circle, `--status-success-bg`, animated ring pulse, `PhoneOutgoing` icon in `--status-success`
- `Dialing +91 96572 29664…` then `Ringing…` at 15px
- Elapsed seconds, 13px mono, muted
- Destructive outline `Cancel call` button
- Trial note when applicable: *"Twilio trial plays a short message before connecting."*

**CONNECTED** — this is the screen judges watch:
```
┌──────────────────────────────────────┐
│ ● Live          02:14        [End]   │  live chip + mono timer
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐  │
│  │ DIYA                   11:02:04│  │  agent turn, white card,
│  │ Namaste Priya ji, aapke order  │  │  left-aligned
│  │ mein deri ho rahi hai…         │  │
│  └────────────────────────────────┘  │
│       ┌────────────────────────────┐ │
│       │ PRIYA            11:02:11  │ │  customer turn, --muted bg,
│       │ Haan, kal function hai     │ │  right-aligned
│       └────────────────────────────┘ │
│  ┌────────────────────────────────┐  │
│  │ ⟐ KB: "Delayed festive gift"   │  │  KB citation chip, 12px,
│  └────────────────────────────────┘  │  neutral `--muted` surface
│  ╷                                   │
│  │ CircleCheck  Refund issued       │  ActionCard (§7.2)
│  │             ₹1,450               │  amount right-aligned
│  ╵ ORD-1042 · auto-approved          │
└──────────────────────────────────────┘
```
- Transcript auto-scrolls; pin to bottom unless the user has scrolled up.
- Each turn shows speaker label (11px/600 uppercase tracking-wide), timestamp, text.
- A **KB citation chip** renders whenever the agent used an article — shows the article title and
  links to `/knowledge/:id`. This is strong evidence the knowledge base is real; don't skip it.
- Action cards render inline, in sequence.
- `End call` = destructive outline, top-right.

**WRAPPING_UP** — skeleton rows + `Classifying outcome…` with a spinner. Usually 1–3s.

**ENDED** — outcome banner (§7.3) at the top of the drawer, then the full transcript, then:
`View full call` → `/calls/:id`, and `Change outcome` (§7.4).

**FAILED** — danger banner with the Twilio error mapped to plain English:

| Twilio code | Message |
|---|---|
| 21215 | "India isn't enabled in Voice Geo Permissions." |
| 21219 / 21210 | "That number isn't verified on this trial account." |
| 13224 / 21217 | "This Twilio number can't dial that destination." |
| busy / no-answer | "Customer didn't pick up." + `Try again` |
| *(other)* | Raw code + message, with a `Copy` button |

Mapping these is 20 minutes and saves you debugging live on stage.

---

## 6. Other screens

### `/queries/:id`
Two columns, `grid-cols-[1fr_320px]`.
- **Left:** issue summary card; order detail card (items, amount, status, promised, rider ETA);
  call history table (`Started · Duration · Outcome · Operator`, rows → `/calls/:id`).
- **Right:** sticky sidebar — customer card (name, phone, preferred language, past query count),
  big `Contact` button, `Mark resolved` / `Send to human` secondary actions.

### `/calls/:id`
Four stacked sections:
1. Header — customer, duration, outcome badge, recording player if available
2. Transcript — same renderer as the drawer
3. **Audit trail** — `Time · Tool · Args · Decision · Executed · Reason`, IDs in mono, policy
   decisions as sentence-case badges (`Allowed`, `Denied`, `Awaiting approval`) with status dots;
   executed state uses lucide icons, not check/cross glyphs.
4. **Flag snapshot** — key/value table of the exact flag values at decision time

Sections 3 and 4 carry the pitch. Give them the most visual weight.

### `/approvals`
Table: `Raised · Customer · Order · Amount · Reason · Age · [Approve] [Reject]`.
Amount right-aligned mono. Age turns amber past 5 minutes. Approve opens a confirm dialog naming
the amount and the order. Empty state: **"Nothing waiting on a human."**

### `/knowledge`
- Header: `New article` primary button; search; category filter.
- Table: `Title · Category · Tags · Used in calls · Updated`. `Used in calls` is a count with a
  tiny bar — it shows which articles the agent actually cites.
- `/knowledge/:id` — title input, category select, tags input, markdown body textarea (min 16
  rows), `Save` / `Delete`. Right rail: "Cited in N calls" with links to the last 5.

---

## 7. Shared components

### 7.1 `StatusBadge`
11px/500, `px-1.5 py-0.5`, **4px radius (not a pill)**, 1px border, tint bg, dark fg, 6px dot before
the label.

| Value | Label | Tone |
|---|---|---|
| `NEW` | New | neutral |
| `CALLING` | Calling | success (dot pulses) |
| `ONGOING` | Ongoing | warning |
| `RESOLVED` | Resolved | success |
| `HUMAN_REVIEW` | Needs human | danger |
| `FAILED` | Call failed | danger |

### 7.2 `ActionCard`
White card, 1px border, **3px left border** in the status colour, 8px radius, `px-4 py-3.5`.
- Row 1: 20px lucide icon in status colour + title 16px/600 near-black. Amounts are right-aligned
  where shown and use `tabular-nums`.
- Row 2: 14px `--muted-foreground` subtitle.

| Outcome | Icon | Title | Subtitle |
|---|---|---|---|
| refund executed | `CircleCheck` | Refund issued | `{orderId} · auto-approved` |
| awaiting approval | `CirclePause` | Sent for approval | `{orderId} · above ₹{limit} limit` |
| approved later | `CircleCheck` | Refund approved | `by {approver}` — change the accent from warning to success |
| denied | `CircleX` | Refund denied | `{denyReason}` |
| escalated | `CircleHelp` | Escalated to a human | `{summary}` |

### 7.3 `OutcomeBanner`
Full-width inside the drawer, white surface, 1px border, 3px left accent in the outcome colour,
8px radius and `px-4 py-3`. Do not tint the whole banner.
- Icon + title: `Resolved` / `Still ongoing` / `Needs human review`
- **Evidence line**, 12px italic muted — the transcript quote the classifier cited. Never show a
  bare verdict; the quote is what makes it credible.
- Confidence as a 3-segment meter, 12px label `High` / `Medium` / `Low`

### 7.4 `OutcomeOverride`
Ghost `Change outcome` button → popover with the three options and an optional note. Writes
`overriddenBy` + `overrideNote`. Operators correcting the AI is an enterprise trust signal — and
it gives you a graceful recovery if the classifier gets it wrong on stage.

---

## 8. Settings

Shared layout: left sub-nav (200px, the five pages), right content, `max-w-2xl`. Each page is
cards of label + control + 12px helper text. Dirty state enables a sticky `Save changes` footer.

**Secret fields are write-only.** Render saved secrets as `••••••••1b2` (last 3 chars only). The
API must never return a stored secret. A `Replace` button clears the field for re-entry. Values
come from server env vars — the UI edits the tenant-level config, never the process env.

### `/settings/telephony`
| Field | Control | Notes |
|---|---|---|
| Provider | select | Twilio · Browser (simulated) · Sarvam Samvaad *(soon)* |
| Account SID | text, masked | from `TWILIO_ACCOUNT_SID` |
| Auth token | password, write-only | from `TWILIO_AUTH_TOKEN` |
| From number | text, mono | from `TWILIO_PHONE_NUMBER` |
| Public callback URL | text | helper: "Twilio must reach this. Use a tunnel in local dev." |
| Max call duration | number, seconds | default 180 |
| Record calls | switch | helper: "Recordings are disclosed to the customer in the opening line." |

- **Trial banner** at the top when detected: amber, "Trial account — a Twilio message plays before
  your audio, and only verified numbers can be called." with a `Manage verified numbers` link.
- **`Send test call` button** — number input + fires a test. Shows the resulting Twilio status
  inline, with the §5.1 error mapping. This single control will save you hours.

### `/settings/voice`
STT model (`saaras:v3`), TTS model (`bulbul:v3`), speaker select with a `Preview voice` play
button, default language, auto-detect language switch, agent opening-line textarea (with
`{brand}`, `{customer}`, `{orderId}` token chips listed underneath).

### `/settings/policy`
**Read-only mirror of Flagsmith**, with an `Edit in Flagsmith ↗` link. Rows: flag name, current
value, source (`Flagsmith` / `default`), last refreshed. A `Refresh now` button. Banner when
`ai_agent_enabled` is false: red, "AI agent is disabled. All queries route to humans."

Explain in helper text that these are deliberately not editable here — flags are the control
plane, and that is the point of the product.

### `/settings/workflows`
NudgeBee webhook URL, callback secret (write-only), `Send test event` button, and a 5-row log of
recent triggers (`time · approvalId · HTTP status`).

### `/settings/tenants`
Table of tenants: name, slug, adapter (`mock` / `webhook`), auto-refund limit, actions. Row expands
to show webhook base URL and API key reference.

---

## 9. Dialogs, toasts, loading

**Reset demo dialog** — title "Reset demo data?", body "This deletes all queries, calls, tickets
and approvals, then reseeds. Use it between rehearsals." Destructive confirm labelled `Reset`.

**Toasts** (sonner, bottom-right): call connected / ended, approval approved or rejected, settings
saved, test call sent. Errors persist until dismissed.

**Loading:** skeleton rows for tables (never a centred spinner), inline spinner inside buttons on
submit, and the drawer's own `Classifying outcome…` state.

---

## 10. Data contracts the UI expects

```ts
type QueryStatus = "NEW" | "CALLING" | "ONGOING" | "RESOLVED" | "HUMAN_REVIEW" | "FAILED"
type Outcome     = "RESOLVED" | "ONGOING" | "HUMAN_REVIEW"
type CallState   = "DIALING" | "RINGING" | "CONNECTED" | "WRAPPING_UP" | "ENDED" | "FAILED"

interface Query {
  id: string
  customer: { id: string; name: string; phone: string; preferredLang: string }
  product:  { name: string; category: string }
  orderId: string
  issueSummary: string
  priority: "HIGH" | "NORMAL"
  status: QueryStatus
  attempts: number
  detectedAt: string
  lastCallId?: string
}

interface CallSession {
  id: string
  queryId: string
  state: CallState
  startedAt: string
  endedAt?: string
  durationSec?: number
  turns: Array<{
    role: "AGENT" | "CUSTOMER"
    text: string
    at: string
    citedArticle?: { id: string; title: string }
  }>
  actions: AgentActionSummary[]        // reuse the existing type
  outcome?: {
    value: Outcome
    confidence: "HIGH" | "MEDIUM" | "LOW"
    evidence: string                    // a quote from the transcript
    overriddenBy?: string
    overrideNote?: string
  }
  error?: { code: string; message: string }
}
```

**Endpoints**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/console/queries?tenantSlug=&status=&product=&q=` | queue |
| GET | `/api/console/queries/:id` | detail + call history |
| POST | `/api/calls` `{ queryId }` | place the call → `CallSession` |
| GET | `/api/calls/:id` | poll while live (1s), then settle |
| POST | `/api/calls/:id/end` | operator hangs up |
| PATCH | `/api/calls/:id/outcome` | manual override |
| GET/POST/PATCH/DELETE | `/api/knowledge` | KB CRUD |
| GET/PATCH | `/api/settings/:section` | settings; **never returns secrets** |
| POST | `/api/settings/telephony/test` | test call |

**Polling:** queue every 2s; an active call every 1s; stop polling when the tab is hidden
(`document.visibilityState`) so you don't burn Twilio balance or Sarvam credits in the background.

---

## 11. Build order

1. App shell — sidebar, topbar, routing. *Everything looks mature the moment this lands.*
2. Design tokens + `StatusBadge` + `ActionCard`
3. `/queries` — tiles, filters, table, Contact button
4. Call drawer — all five states, with a mocked session first
5. Wire the drawer to the real call API
6. `OutcomeBanner` + override
7. `/calls/:id` — transcript, audit trail, flag snapshot
8. `/approvals`
9. `/settings/telephony` — **including the test-call button**
10. `/knowledge`
11. Remaining settings pages

Stop after 9 if time runs short. Items 10–11 are the least load-bearing for the demo.
