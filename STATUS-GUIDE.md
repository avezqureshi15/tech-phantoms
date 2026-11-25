# Diya — Status Guide (plain-English)

This explains every status badge you'll see in the console, when it happens, and what "Action taken" means in the audit trail. No code, just what's actually going on.

---

## The two kinds of conversations

Diya handles two different flows, and each has its own status trail:

1. **Tickets** — a customer reaches Diya (browser demo today; phone later) to ask for help. Lives on the **Console / Tickets** pages.
2. **Outbound queries & calls** — Diya proactively calls a customer about a known problem (e.g. a delayed order). Lives on the **Queries** and **Calls** pages.

A ticket is always created either way — an outbound call also opens a ticket behind the scenes, which is why you see the same "Escalated" wording in both places.

---

## 1. Ticket status (what you see on Console / Tickets)

| Status | What it means | When it happens |
|---|---|---|
| **Open** | Still active, nothing decided yet | Default when a ticket is created, or when the agent just answered a question without taking any action (e.g. "your order is delayed") |
| **Auto-resolved** | Diya solved it on her own | The agent issued a refund and it was within the auto-approval rules, so it went through immediately |
| **Awaiting approval** | Diya wants to act, but needs a person to say yes first | The agent tried to issue a refund, but it was above the auto-approval ceiling, or above the amount that always needs a human, or the AI is switched off for this store. A request is sent to a human approver (NudgeBee). |
| **Escalated** | A human needs to take over this conversation | See the full list of reasons below — ranges from "the agent gave up and asked for help" to "something broke" to "an approver said no" |
| **Closed** | Manually closed by a person | Reserved for future use — nothing in the system sets this automatically yet |

**"Resolved" is never assumed** — the system only marks something auto-resolved when an action (like a refund) actually executed successfully, never just because the agent sounded confident.

---

## 2. Outbound query status (what you see on the Queries page)

This is the status of the *problem* Diya is trying to follow up on by phone — separate from the status of any individual call attempt.

| Status | What it means | When it happens |
|---|---|---|
| **New** | Nothing has been tried yet | Default when the problem is first detected |
| **Calling** | A call is in progress right now | As soon as someone clicks the call button |
| **Ongoing** | A call happened, but it's not finished — something was promised or is still pending | The call ended and the transcript shows the issue is still open (e.g. customer asked for more time) |
| **Resolved** | The customer explicitly confirmed they're satisfied, or confirmed an action that was completed | Only set when the customer's own words in the transcript are a clear "yes, that's sorted" — the agent's own claim that it's resolved is never enough |
| **Human review needed** | A person needs to look at this one | See reasons below |
| **Call failed** | The call itself didn't go through or complete | Busy, no answer, call dropped, or a technical failure before any real conversation happened |

**Important:** "Human review needed" and "Call failed" do **not** lock the record — you can still call that customer again. The call button only turns off once a query is **Resolved**.

---

## 3. Why something gets escalated / flagged for human review

In plain terms, any of these will land a ticket or call in "Escalated" / "Human review needed":

- **The agent asked for help.** It decided the issue wasn't something it could safely handle and handed it to a human — this is always allowed, by design, for anything the agent is unsure about.
- **The agent ran out of turns.** There's a hard cap on how long one back-and-forth can go (4 steps) — if it hits that without resolving anything, it escalates automatically rather than looping forever.
- **A refund needed approval, and the approver said no.** (See the Approvals section below.)
- **The call never really happened.** Voicemail/answering machine picked up, there was no recording to listen to, or the recording download / voice processing failed partway through — these are treated as "we couldn't safely confirm anything happened," so they go to a human rather than being silently dropped. *(This is exactly what happened on the Rohan Mehta / ORD-1002 call you looked at — the conversation itself was fine, but a technical step afterward failed before any action could be logged, which is why "Action taken" shows "—".)*
- **The turn took too long.** Each step of a phone call has a time budget; if nothing comes back in time, it's treated the same as a failure.
- **After the call, an automatic review of the transcript flagged it.** Once a call ends, a second AI pass reads the whole transcript and decides: did the customer actually confirm they're happy, is this still ongoing, or does it look like the agent couldn't help / the customer was upset / something unusual happened? If that review isn't confident, or anything looks off, it defaults to "needs a human" rather than guessing.
- **A person manually overrode it.** Anyone can look at a finished call and change the outcome by hand (e.g. "actually mark this as needs review") — that's logged with who did it and why.

The system is deliberately cautious: whenever it isn't sure, it escalates rather than assumes success.

---

## 4. What the agent can actually do (the "Action taken" column)

Every time the agent takes an action, it's logged in the audit trail (`AgentAction`) with exactly what it tried, what was decided, and whether it was allowed to go through. These are the only things the agent is *able* to do — it cannot do anything outside this list:

| Tool | Plain meaning |
|---|---|
| **Get order status** | Look up a customer's order (read-only, never needs approval) |
| **Issue refund** | Try to refund money for an order — this is the only "money-moving" action, and it's always checked by the rules below before anything happens |
| **Escalate to human** | Hand the conversation to a person — always available, used whenever the agent is unsure |
| **End call** *(phone calls only)* | Politely end the call |
| **Cite knowledge article** *(phone calls only)* | Note which help-article it used to answer, for tracking what's actually useful |

### What "Refund issued / Awaiting approval / Refund denied" means

When the agent tries **Issue refund**, one of three things happens, shown directly in the audit trail:

- **Refund issued** — it passed every check and went through automatically.
- **Awaiting approval** — it's a valid refund request, but needs a person to approve it first, because:
  - the amount is above the store's "always needs a human" threshold, or
  - the amount is above the current auto-approval limit (this limit can be raised temporarily during a sale/festive period), or
  - the AI is switched off for refunds at this store right now.
- **Refund denied** — it failed a basic safety check and was blocked outright, for example:
  - the order doesn't belong to this customer,
  - the order is too old to qualify,
  - it was already refunded once,
  - the refund amount is zero/negative or bigger than the order itself,
  - the order wasn't even one the conversation was about (the agent can't just reference a random order it wasn't given).

These safety checks can never be turned off by a setting — only the approval thresholds (amounts and the on/off switch) are adjustable.

### Approvals (when something is "Awaiting approval")

- A request goes out to a human approver through NudgeBee.
- The approver says **yes** → the refund is issued right then, and the ticket becomes **Auto-resolved**.
- The approver says **no** → the ticket becomes **Escalated** instead.
- Until either happens, it just sits as **Awaiting approval**.

---

## Quick glossary

- **Policy decision (ALLOW / DENY / REQUIRE_HUMAN)** — the internal name for the three outcomes above (issued / denied / needs approval). You'll see these words in raw data exports; on screen they show as the friendlier labels above.
- **Flags** — the on/off switches and money limits (auto-approval limit, always-needs-human amount, festive mode, AI on/off) that store admins can adjust without any code changes. They only ever make the rules stricter or looser within the fixed safety checks — they can't bypass them.
