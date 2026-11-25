# Feature flags (Flagsmith)

Flags let you switch a feature off, or change the AI model, without a release.

**With no `FLAGSMITH_SERVER_KEY` set, nothing changes**: every feature is on and the configured
model is used. The code holds the defaults (`integrations/flags.py`, `DEFAULTS`).

## Set up (you do this once)

1. Create a project and an environment in Flagsmith (Cloud, or self-hosted).
2. Copy the environment's **server-side key** (starts with `ser.`) into the environment variable
   `FLAGSMITH_SERVER_KEY`. Never commit it or paste it in chat. For self-hosted, also set
   `FLAGSMITH_API_URL`.
3. Create flags with exactly these names. A flag you do not create keeps its default.

| Flag | Kind | Controls |
|---|---|---|
| `utsav` | on/off | The whole assistant: chat, voice, documents. Off answers 503 before any paid call. |
| `utsav_voice` | on/off | Talking to Utsav and hearing it speak (`/ai/transcribe`, `/ai/speak`). |
| `elder_mode` | on/off | Starting an elder conversation. |
| `recite_mode` | on/off | Starting a recitation practice. |
| `event_search` | on/off | Live web search for events (the costly part). Site links still work. |
| `receipt_scan` | on/off | `POST .../expenses/scan`. |
| `document_upload` | on/off | `POST .../ai/documents`. |
| `support_callback` | on/off | Asking the support team to phone you back (`POST /support/callback`). |
| `ai_model` | value | Model id, e.g. a cheaper model in an incident. Ignored if blank, over 60 chars or has spaces. |
| `ai_effort` | value | `low`, `medium`, `high`, `xhigh` or `max`. Anything else is ignored. |
| `announcement` | value | A short notice shown on Home (capped at 280 characters). |

## How it behaves

* **Server-enforced.** `GET /api/v1/features` tells the app what to hide, but the routes
  themselves return 503 ("X is switched off for now") when a feature is off.
* **Never takes the app down.** Flagsmith slow, unreachable or the key revoked: defaults apply, one
  log line per five minutes, no stack traces.
* **Privacy.** Only the opaque user id is sent to Flagsmith: no email, name, faith or traits.
* **Latency.** A `ser.` key downloads the rules and evaluates locally (refresh every 60 s). Each
  person's result is also cached for 30 s, so a change takes effect within about a minute.
* The app needs no Flagsmith key; it reads `/features` and keeps working with everything on if that
  call fails.

## Not verified

Tested against a local server that speaks Flagsmith's HTTP API and with a bogus key (falls back to
defaults). It has **not** been run against a real Flagsmith project, since none exists yet.
