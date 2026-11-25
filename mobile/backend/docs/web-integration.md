# Integration with the web support platform ("Diya", `web/`)

A FestiveOS user can ask for a **call back**. The mobile backend sends the request to the web
platform, which creates a customer and a query for the `festiveos` tenant, and its outbound caller
phones the person in their language.

```
App (support screen)        Mobile backend                        Web server (web/server)
 phone + language   --->   POST /api/v1/support/callback   --->   POST /api/integrations/support-requests
 + explicit consent         checks, rate limit, flag               verifies HMAC signature + 5 min window
                            signs the request (HMAC)               upserts Customer, creates Query
                            records "asked, consented"             caller phones them (consent on file)
```

## What is sent, and what is kept

Sent to the web server, once, over a signed request:
`requestId`, `externalUserId` (an opaque id), `name`, `phone`, `preferredLang`, `consent`
(`at`, `source: "festiveos_app"`, `version`), `category: "festiveos_support"`, `topic`, `issueSummary`.

Never sent: email, groups, festivals, expenses, messages, or anything else about the person.

The mobile backend stores only that a request was made (topic, language, consent time and wording
version, the web query id). **It does not store the phone number or the note.** Deleting an account
removes these rows.

## Signing

Header `X-Festiveos-Timestamp` (unix seconds) and `X-Festiveos-Signature` =
`hex(HMAC-SHA256(secret, "<timestamp>." + exact body bytes))`. The web server rejects anything older
or newer than 5 minutes, or with a different body. A shared test vector is asserted on both sides
(`tests/test_support.py` and `web/server/src/integrations/__tests__/festiveos.test.ts`) so a change to
either signer fails a test instead of silently returning 401.

## Behaviour worth knowing

* **Consent is required and explicit.** The app sends `consent: true` only if the person ticked the
  box; the server refuses anything else (422). The web server records the consent time and source.
* **Do-not-call is respected.** If the number is already marked do-not-call, no query is created and
  the person is told so. Only a staff decision on the web side lifts that.
* **Retries are safe.** The web server recognises the same `requestId`.
* **Limits.** Three requests per person per day.
* **Failure is calm.** If the web platform is down, the person gets a 503 message and nothing is
  recorded (so no phone number is left behind).
* **Switch-off.** The `support_callback` flag in Flagsmith turns the whole thing off (server answers
  503, the app hides the entry).

## Setup checklist

1. In the web console, create a tenant with slug `festiveos` (or set `INTEGRATION_TENANT_SLUG`).
2. Generate one long random secret and set it as `INTEGRATION_SECRET` on the web server **and**
   `DIYA_INTEGRATION_SECRET` on the mobile backend. Keep it in Secrets Manager, never in the repo.
3. Set `DIYA_BASE_URL` on the mobile backend to the web server's public HTTPS address.
4. Add `festiveos_support` to the web server's `CALLABLE_QUERY_CATEGORIES`, or the caller will not
   dial these automatically.
5. Create the `support_callback` flag in Flagsmith (on by default if the flag is absent).
6. Teach the web agent what FestiveOS problems are (expense disputes, group help, account access):
   its current tools are built around orders and refunds.

## Not done yet

* The web agent's FestiveOS-specific behaviour (step 6).
* A status screen in the app showing whether a call back happened.
* A per-IP rate limit on the web endpoint (the signature already blocks anonymous callers).
