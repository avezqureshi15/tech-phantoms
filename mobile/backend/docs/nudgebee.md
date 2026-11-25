# Incidents (NudgeBee)

When a paid provider keeps failing, or the AI is used far more than normal, the backend tells a NudgeBee
workflow. A person approves or rejects switching the feature off; on approval NudgeBee turns the
matching Flagsmith flag off, and the routes refuse the feature (see `feature-flags.md`). The workflow
and AWS side are in `../DEPLOY-AWS-NUDGEBEE.md`; the payload there is the contract.

**With no `NUDGEBEE_WEBHOOK_URL` set, nothing changes**: nothing is counted or sent.

## What is reported

| Reason | Feature | Threshold (per 10 minutes) | Counted where |
|---|---|---|---|
| `sarvam_credits_exhausted` | `utsav_voice`, `receipt_scan`, `document_upload` | 1 | Sarvam answers 402 (`integrations/sarvam.py`) |
| `sarvam_errors` | same | 5 | A Sarvam call fails after its retries (not a bad file: 400/413/415/422) |
| `ai_provider_errors` | `utsav` | 5 | An OpenAI call fails after its retries, or a stream breaks (`ai/llm.py`) |
| `ai_usage_spike` | `utsav` | 300 | Every successful model call |

Thresholds live in `integrations/nudgebee.py` (`REASONS`).

## How it behaves

* **Never in the way of a request.** Counting is in memory; the webhook goes out on one background
  thread with a 4 s timeout. A NudgeBee failure is one log line per five minutes, never an error.
* **No flood.** At most one incident per feature and reason per 10-minute window.
* **No personal data.** Feature, reason, counts and the environment name only.
* **https only.** Any other `NUDGEBEE_WEBHOOK_URL` is refused with a warning at startup. The URL is a
  secret (it starts the workflow) and is never logged.
* **Per process.** With several replicas each counts its own traffic, so a threshold is reached a
  little later. Fine for a signal whose answer is a human decision.

## Trying it

Point `NUDGEBEE_WEBHOOK_URL` at the workflow trigger, then set `SARVAM_API_KEY` to an invalid value
and use voice five times: Sarvam refuses the key, and one `sarvam_errors` incident for `utsav_voice`
reaches the workflow.
