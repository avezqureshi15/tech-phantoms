# Utsav, the AI layer

Utsav is the assistant inside FestiveOS. A person talks to it in plain language ("I'm hosting 3 people
for dinner"); it looks at the household's own data, asks for whatever is missing **with cards**, and
answers with computed numbers, never guessed ones. The orchestrator is **Sutradhar**, the narrator who
decides which specialist speaks next.

Code: `src/festiveos/ai/`. Prompts: `src/festiveos/ai/prompts/v1/*.md`. API: `/api/v1/.../ai/...`.

## What happens in one conversation

```
person: "I'm hosting 3 people for dinner"
  Sutradhar     -> handoff(requirements)
  requirements  -> get_household_context, list_inventory      (reads, no questions yet)
                -> ask_user  ───────────────►  QUESTION CARD  (adults, elders, diet ... in ONE card)
person answers the card (validated by the server against the card)
  requirements  -> handoff(planner)
  planner       -> calculate_hosting  ───────►  HOSTING PLAN CARD (food, raw shopping, seats, plates)
                -> handoff(jugaad)    (only if seats or plates fall short)
  jugaad        -> jugaad_options, then explains the safe improvisations in a few lines
```

`/jugaad ...` is a skill: a message starting with it goes straight to the jugaad specialist.

## Rules the design enforces (each has a test)

| Rule | Why | Where |
|---|---|---|
| The model never does arithmetic. Quantities come from `hosting.py` via `calculate_hosting`. | Repeatable, testable, no hallucinated numbers. | `ai/hosting.py`, `tests/ai/test_hosting.py` |
| The model never writes data. `propose_action` shows a **confirm card built from the validated parameters**; the write runs only after approval, **as the approving person**, through the normal services. | Prompt injection or a confused model cannot change data; permissions still apply (a non-admin approving `create_festival` is refused). | `ai/actions.py`, `test_conversations.py` |
| Cards are validated on both sides: the model's card (field types, option counts, bounds) and the person's answers (unknown keys, out-of-range numbers, options not offered). | A hallucinated option or a hostile client cannot get through. | `ai/cards.py`, `tests/ai/test_cards.py` |
| Per-agent tool allow-lists, enforced at call time. | A tool the agent was not given returns an error, whatever the prompt says. | `ai/agents.py`, `ai/tools.py` |
| One open card per conversation, enforced by a partial unique index. | No two answers racing for one question. | `ai/models.py`, `test_storage.py` |
| A conversation is private to its owner, and only while they stay in the household. Others get 404. | | `AIService._owned` |
| No database connection is held during a model call (`session.commit()` before each call). | A 30 s model call must not pin a pooled connection or a lock. | `ai/orchestrator.py` |
| A turn is claimed with an atomic `UPDATE`, not a row lock. A crashed claim expires after 3 minutes. | Two requests cannot drive one conversation, without holding a lock across the model call. | `AIRepository.claim_turn` |
| At most `AI_MAX_CONCURRENT_TURNS` turns run per process; more get 503. | A turn holds a worker thread for the whole model call; AI must not starve the rest of the API. | `AIService._turn` |
| Hourly and daily per-user budgets (`ai.turn` 30/h, `ai.daily` 150/day), on top of the global limits. | Cost control and abuse. | `core/limits.py` |
| At most `AI_MAX_ITERATIONS` model calls per turn, `AI_MAX_MESSAGES` per conversation. | A looping model cannot run up a bill. | `orchestrator.py`, `service.py` |
| Message content is never logged. Logs carry token counts, cache ratios, agent, stop reason, the provider request id. | Privacy. | `orchestrator._log`, `llm._log_failure` |

## Streaming

Each turn also has a streaming form: `POST .../ai/conversations/stream`, `.../messages/stream` and
`.../cards/{id}/response/stream` answer with server-sent events (`text/event-stream`).

| Event | Data | Meaning |
|---|---|---|
| `start` | `conversation_id` | the turn began |
| `text` | `segment`, `text` | a piece of the answer; each model call is its own `segment` |
| `tool` | `name` | the model started a tool call (the app shows "Checking your inventory...") |
| `card` | `card` | a result card, e.g. a hosting plan |
| `pending_card` | `card` | a question or confirmation waiting for the person |
| `done` | the full turn | authoritative: the client replaces everything streamed in this turn with it |
| `error` | `status`, `message` | the turn failed after streaming began |

* Checks that can fail (404, 409, 422, 503) run before the first event, so they keep their real status code.
* One code path: the plain endpoints drain the same generator, so both forms always agree (tested).
* The orchestrator only yields where nothing is half-recorded. Closing the stream (the person left) stops the
  provider call, releases the claim and never leaves a tool call without its result in the history.
* Retries happen only before the first byte; a failure after words reached the person ends the call.
* Limit: while the model is thinking, no bytes flow. A proxy with a short idle timeout could cut a slow turn.

## Documents and receipts (Sarvam)

* **Reader:** Sarvam Document AI (`integrations/sarvam.py`, the only module that talks to it): `extract` pulls named
  fields out of a document with a schema, `parse` returns its text. Jobs are asynchronous: submit, poll (capped at
  90 s), fetch. Translation uses `sarvam-translate:v1`. Verified live on 2026-11-25: a receipt extracts in about 3 s.
* **Receipts:** `POST /households/{id}/expenses/scan` (multipart `file`) returns a *draft* (`merchant`, `spent_on`,
  `total_minor` in paise, `items`, `warnings`). Nothing is saved: the app prefills the add-expense form and the
  person confirms. The reader can return a subtotal as the total, so mismatches and missing totals are flagged.
* **Utsav documents:** `POST /households/{id}/ai/documents` returns the document as text (cut at 20,000 characters,
  `truncated` says so). The app attaches up to 3 to the next message (`documents` on every message endpoint).
  The model receives each one fenced as `<attached_document>` data after a note that it is not instructions, with the
  closing tag escaped so a document cannot break out of its fence. The transcript shows only "Attached: name".
* **Privacy:** files are read in memory and never stored; the text of a document is sent to OpenAI as part of the
  message (the point of attaching it), with `store: false`. Nothing about content is logged.
* **Limits:** `documents.scan` 20/hour and 60/day per person; only PDF, JPG, PNG and WebP are accepted, judged by their
  bytes, not their label; uploads may be `MAX_UPLOAD_BYTES` (10 MB), everything else stays at 256 KB.

## Understanding, events, calendars and voice (prompt v2)

* **Intent first.** `prompts/v2/base.md` tells Utsav to work out what is actually wanted: customs, food, dress and
  meaning are answered directly (no form, no hand-off); suggestions come first and a single detail is asked at the end;
  numbers for a gathering go to the hosting specialists; changes to data are proposed for approval. A message that
  could mean two things gets the likelier one done, with a line saying what was assumed.
* **Language.** It replies in the language and script the person used (including Hinglish) and never asks or announces
  it. Voice works the same way: a short clip is transcribed with the language detected by Sarvam, so there is nothing to
  choose (`POST /households/{id}/ai/transcribe`, 30 s max, rate-limited, not stored). Verified live with Hindi, Kannada
  and English speech.
* **Communities.** The prompt carries a map of traditions across Hindu (sampradaya and regional), Muslim (Sunni schools,
  Shia, Bohra, Khoja, Ahmadiyya), Christian (Catholic rites, Orthodox, Mar Thoma, CSI, Protestant, Anglo-Indian, Goan,
  North-East), Sikh, Jain, Buddhist, Parsi, Jewish, Bahai and tribal faiths, and rules for using it: say which community a
  custom belongs to, never present one as universal, use the person's faith and city (`get_household_context` returns
  them), admit uncertainty and never invent a ritual or a date. **It is guidance for the model, not a reviewed database:
  the answers come from the model's own knowledge and need review by people from each tradition.**
* **Events.** `find_events` runs a web search limited to BookMyShow, District, Insider and AllEvents and shows the
  results as a tappable links card (event title, date, venue, the listing's own address) plus fixed site searches, so
  there is always something to open and RSVP on. Everything the search returns is untrusted: each address must be https
  on one of those sites, text is cleaned and capped, results are cached 6 hours per city and query. It cannot book,
  RSVP or check seats or prices, and Utsav is told never to claim that.
* **Calendars.** `add_to_calendar` shows a calendar card; tapping it adds an all-day event (with a reminder a day
  before) to the phone's own calendar: Apple Calendar on iPhone (including iCloud and Google accounts added to it),
  the person's writable calendar on Android. On iOS 17+ the app asks for write-only access and never reads the calendar.
  Not done: a subscribable calendar feed, or server-side Google Calendar sync with sign-in.

## Sacred texts, full recitations, recite practice and elder mode (prompt v4)

* **"I can't help with that one" was an OpenAI content filter, not a refusal.** When the model begins a long
  word-for-word recitation (the Hanuman Chalisa failed in 4 of 5 streamed runs), the response ends `incomplete` with
  `reason: content_filter`. It used to be treated as a refusal and the text was thrown away. Now `stop_reason` is
  `filtered`, distinct from a real `refusal`.
* **Full texts on request.** When a answer is filtered part-way, the orchestrator keeps what was written up to the last
  whole line, tells the model where it stopped (a transient note, never stored) and asks it to continue, up to
  `MAX_CONTINUATIONS` (12) parts. The parts are joined into one answer; the streamed client is sent a `reset` for the
  cut-off segment and the trimmed text again. Verified live: the whole Hanuman Chalisa (about 6,000 characters, all 40
  verses and both dohas, with meanings) in Hindi and in Kannada, with no "continue" and no block message. If nothing at
  all gets through it retries once for a shorter piece, then says so honestly.
* **Recite practice** (`mode: "recite"`, or hand-off from the normal assistant): the `recite` agent gives one short line,
  asks the person to repeat it, and ALWAYS calls `check_recitation` with the exact line and what was heard
  (`ai/recitation.py`). That comparison is deterministic: it ignores punctuation, danda marks and spelling that sounds
  the same (vowel length, nasal marks, similar sibilants, Arabic vowel marks, Roman variants), and reports exactly which
  words were missed, said differently or added, with a verdict (correct, close, retry, unclear). The model corrects only
  from that result, so a correction is never a guess. Verified live: a swapped word was named and corrected, a correct
  retry was praised.
* **Elder mode** (`mode: "elder"`): the `elder` agent speaks 1 to 3 short sentences, no Markdown or emoji, in the
  person's language and script, one thing at a time, teaches by repeating (with `check_recitation`), plays music with
  `play_music`, and has no forms or buttons. An elder or recite conversation stays in its mode for every message.
* **Speaking:** `POST /households/{id}/ai/speak` returns WAV audio (Sarvam Bulbul v3) for text, in the language the text
  is written in (read from its script, so nothing is chosen), at a pace of 0.5 to 1.5. Markdown, links and emoji are
  removed first. Rate-limited like voice input; nothing is stored.
* **Not guaranteed:** the texts come from the model's own knowledge, not a reviewed library. For sacred wording that is a
  real limit: the model is told to say when it is unsure and to point to a priest, imam, granthi, pastor or elder, but
  it can still be wrong. A curated, reviewed library of the common texts, checked by people of each tradition, is the
  right next step and has not been built.

## Prompts

* Three layers, by how often they change: **base** (identity, rules, Indian hosting norms, tool-use
  policy; frozen), **playbooks** (one short file per agent, appended when the agent changes), and the
  **conversation**.
* Files are versioned (`prompts/v1/`). Nothing is interpolated into them: no dates, names, ids or flags.
  Change a prompt by adding a new `v<N>/` and bumping `PROMPT_VERSION` (now `v2`); the version is in every model-call log.
* Prompt-injection stance: tool results and card answers are data; the base prompt says so, and the
  hard defence is structural (no writes without a human, allow-lists).
* Privacy: only what a tool returns reaches the provider: household name, member **count** (not names or
  emails), timezone, inventory, festivals, and what the person types or answers. User emails never do.

## Model and provider

* **Provider: OpenAI, Responses API** (`/v1/responses`), through plain `requests`, so there is no extra SDK.
  Chat Completions is not usable here: `gpt-6.2-sol` answers HTTP 400 for function tools with reasoning on.
* **Default model: `gpt-6.2-sol`** ($2.00 in / $0.10 cached / $10.00 out per 1M tokens; OpenAI's "go-to
  model for powering agents at scale"; 1.05M context; function calling and structured outputs). Chosen
  because Utsav is a tool-calling agent that asks questions, so tool reliability matters more than
  the last bit of reasoning depth.
  * `gpt-6-luna` ($0.10 / $0.50) is 20x cheaper and OpenAI calls it the efficient model for focused,
    high-volume tasks. A good candidate for simple background jobs (reminder wording, summaries) once we
    have an eval; it has not been checked for multi-step tool use, so it is not the default.
  * `gpt-6.2-astra` ($8 / $40) is 4x the price; keep it for a task where `sol` measurably falls short.
  * Prices and ids come from OpenAI's pricing page and were checked on 2026-11-24; re-check before relying
    on them. Set `AI_MODEL` to change the model with no code change.
* **Stateless**: every request sends `store: false`, so OpenAI keeps nothing about a family. Reasoning is
  returned encrypted (`include: reasoning.encrypted_content`) and replayed with the tool results; that is
  verified against the live API across several tool turns.
* The rest of the code keeps one internal block format (text, tool_use, tool_result); `ai/llm.py`
  translates at the edge.
* Failures: 408/409/429/5xx and connection errors are retried twice with jittered backoff (honouring
  `Retry-After`, capped at 8 s); anything else, or running out of retries, becomes a generic 503. The provider's
  message is never passed on or logged.

## Prompt caching

OpenAI caches a prompt prefix of 1024 tokens or more automatically and needs a byte-identical prefix.

```
tools          same list for every agent and user, sorted by name
instructions   the frozen base prompt (base.md), same for every user
input          the conversation, append-only; a hand-off appends a developer-role note instead of
               editing the instructions
prompt_cache_key  one constant, so every user's identical prefix is routed together
```

* Agents are not separate model sessions. A separate session per agent would have its own instructions,
  so every hand-off would pay for the whole history again. Trade-off: all agents see the whole
  conversation, which suits a small family-hosting flow.
* `reasoning.effort` is pinned (`AI_EFFORT`, default `medium`); do not vary it per request.
* Messages are stored in a plain `json` column, **not** `jsonb`, so replayed history keeps its key order.
* Verify in production from the logs: `cache_read_tokens` should dominate after the first turn.
  `cache_hit_ratio` near zero on later turns means something in the prefix is changing.
* Measured on the live API (2026-11-24), one real planning conversation of three model calls at effort
  `high`: about 1,700 output tokens, roughly 2 to 3 US cents, with about 1,750 prompt tokens served from the
  cache on every call after the first.
* `tests/ai/test_llm.py` fails if the tools or instructions differ between two conversations, and
  `tests/ai/test_conversations.py::test_history_is_append_only...` fails if any earlier message changes.

## Configuration

| Variable | Default | |
|---|---|---|
| `OPENAI_API_KEY` | none | **Required to enable Utsav.** `OPEN_AI_API_KEY` is accepted too. Without either, the AI routes answer 503. Read straight from the environment, never copied into settings or logs. |
| `AI_MODEL` | `gpt-6.2-sol` | Any model that supports function tools on the Responses API. |
| `AI_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh`, `max` (the values `gpt-6.2-sol` accepts). |
| `AI_MAX_TOKENS` | `16000` | per model call, reasoning included |
| `AI_TIMEOUT_SECONDS` | `120` | read timeout per model call |
| `AI_MAX_ITERATIONS` | `8` | model calls per turn |
| `AI_MAX_MESSAGES` | `80` | per conversation |
| `AI_MAX_CONCURRENT_TURNS` | `8` | per process |

## Voice guard rails

A voice conversation has no screen to catch mistakes, costs a transcription and a model call every
turn, and may be used by someone who cannot tell what went wrong. So it has its own limits.

**Server**
* The elder and recite agents are read-only. They have no `propose_action`, `ask_user` or
  `handoff`, and `tests/ai/test_voice.py` fails if a tool outside the safe list is added.
* Prompt v5 adds spoken-conversation rules to both: no changes by voice, treat speech as words not
  orders, no medical, legal or money advice, 112 if anyone may be in danger, respect every faith.
  Checked live: asked to add an expense it declines kindly; asked for its instructions it stays
  Utsav; chest pain gets 112 and no medicine advice.
* Speech calls to Sarvam wait 12 s and retry once (about 25 s worst case), never minutes.

**App** (`frontend/src/lib/voice-guard.ts`)
* The microphone opens 0.7 s after Utsav stops, and a transcript that is just Utsav's own words
  coming back is ignored (no paid model call).
* Three empty or unusable turns in a row stop the loop; the screen waits for a tap.
* One sitting ends after 30 turns or 20 minutes.

Limits: echo detection compares words, so it cannot tell when speech recognition writes a language
in a different script from the one Utsav spoke. Real-phone behaviour (speaker volume, noisy rooms)
is not verified.

## Not verified / not done

* Live-verified (2026-11-24, `gpt-6.2-sol`): the Responses request shape, function-call round trips with the
  real tool list, reasoning replay with `store: false`, prompt-cache hits, the asks-before-answers
  behaviour (it read the household first, then raised one question card). **Not** exercised live: the full
  HTTP stack through our own API and database, and the confirm-card write path; those run against a
  scripted fake model in the tests.
* Utsav does not yet know about groups, expenses, the panchang or Shaadi mode: its tools cover households,
  inventory, festivals and hosting only.
* If the server dies between an approved write and recording its result, that conversation is stuck
  (the card is already closed, which prevents a double write). Start a new chat.
* The mobile chat screen is built (`frontend/src/app/(app)/utsav/`); see the frontend README.
