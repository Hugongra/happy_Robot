# Inbound Carrier Sales — Build Description for Acme Logistics

**Prepared for:** Acme Logistics, Carrier Sales Operations
**Author:** Forward Deployed Engineering — HappyRobot
**Status:** Proof of concept, ready for stakeholder review
**Last updated:** June 2026

---

## 1. The problem we're solving

Your inbound carrier desk fields hundreds of calls a day from drivers and
dispatchers asking the same questions: *"What do you have out of
Laredo?"*, *"Any reefers headed east this afternoon?"* Each call is
five to ten minutes of a rep's time before the conversation even gets
to a real price. The rep is qualifying the carrier, pulling up loads in
the TMS, repeating the same pitch, and grinding through negotiation —
work that is high-volume, repetitive, and easy to standardize.

This build delivers an **AI voice agent that handles the first 80% of
that call**: verification, lane matching, pitch, negotiation. The rep
only steps in once a price is on the table.

The goals from your side, as we understood them:

1. Vet every caller against FMCSA before quoting anything.
2. Match them to a viable load from the current book.
3. Hold a structured, bounded negotiation — never below a per-load floor,
   never more than three rounds.
4. Transfer to a sales rep cleanly when there's a deal.
5. Capture structured data from every call for reporting.

## 2. How a call actually goes

A driver calls in (web call in this POC; phone trunk in production).
The flow:

| # | What happens | Where it lives |
|---|---|---|
| 1 | Alex greets the caller and asks for their MC number. | Voice agent prompt |
| 2 | The MC is sent to `/api/fmcsa/verify`. We hit FMCSA's docket endpoint, check `allowedToOperate == "Y"`, no out-of-service date, and operating status `Active`. We return a clean eligible/not-eligible plus the legal name. | Backend |
| 3 | If ineligible, Alex politely ends the call with the reason. No load is discussed. | Voice agent prompt |
| 4 | Alex asks for origin, destination, equipment. Calls `/api/loads/search`. | Voice agent prompt + backend |
| 5 | Alex pitches the top match (lane, miles, pickup window, weight, posted rate, special notes like tarps or drop-and-hook). | Voice agent prompt |
| 6 | Carrier proposes a rate. Alex calls `/api/loads/evaluate-offer` with `round_number=1`. The server compares the offer against the load's `min_acceptable_rate` and returns one of `accept`, `counter`, or `reject`, along with the dollar amount to offer back. | Backend (this is deliberately deterministic — see §4) |
| 7 | Up to two more rounds. Alex never reveals the floor rate. By round 3 the server forces a decision. | Voice agent prompt + backend |
| 8 | On agreement, Alex calls the `transfer_to_sales_rep` tool. In the POC this is mocked with a fixed message. In production it chains a Direct Transfer node to your queue. A Transfer Popup carries the carrier name, MC, load ID, and agreed rate to the receiving rep before they say hello. | HappyRobot Direct Transfer + Transfer Popup |
| 9 | When the call ends, the workflow's AI Extract node pulls structured fields off the transcript (MC, agreed rate, load ID, counter-offer ladder, lane, equipment, duration). An AI Classify node tags the outcome. The Sentiment Classifier ran in real time during the call. All of it POSTs to `/api/webhooks/call-completed` and lands in the dashboard. | HappyRobot post-call nodes + backend |

## 3. The pieces, and why each one exists

### 3.1 HappyRobot workflow

- **Web Call trigger** — for this POC we don't provision a phone number; carriers reach Alex through a button on a web page that mints a LiveKit token server-side.
- **Inbound Voice Agent node** — configured for English with the option to add Spanish, a confident broker-sounding voice, a 10-minute hard cap, call-center background ambience, and recording on with a robotic disclaimer.
- **Real-time analysis** — built-in sentiment classifier plus a custom outcome classifier (load_booked / price_rejected / no_interest / carrier_ineligible / transferred / other). Outcome can be referenced in real time if we ever want to branch mid-call.
- **Prompt** — see `docs/voice-agent-prompt.md`. Six sections: Identity, Objective, Tools, Instructions, Hard Rules, Style. Hard rules include the 3-round cap and the "never reveal the floor rate" guardrail.
- **Four tool nodes** under the prompt: `verify_carrier`, `search_loads`, `evaluate_offer`, `transfer_to_sales_rep`. Each is a webhook to our backend. Tool parameters are pulled from conversation context by the LLM and we validate them server-side.
- **Post-call nodes** — AI Extract → AI Classify → Webhook to our dashboard.

### 3.2 Backend (FastAPI in a container)

A single service exposing six paths:

- `POST /api/voice/token` — proxies our HappyRobot API key to issue browser LiveKit tokens. No carrier credentials live in the frontend bundle.
- `GET /api/loads/search` and `GET /api/loads/{id}` — read-only load board. Returns the same nine carrier-facing fields the brief specifies (load_id, origin, destination, pickup/delivery datetime, equipment_type, loadboard_rate, notes, weight, commodity_type, num_of_pieces, miles, dimensions). The internal `min_acceptable_rate` is **never** returned.
- `POST /api/loads/evaluate-offer` — the negotiation policy.
- `POST /api/fmcsa/verify` — FMCSA proxy with normalization.
- `POST /api/webhooks/call-completed` — sink.
- `GET /api/metrics/*` — dashboard data.

Auth: an `X-API-Key` header on every endpoint except `/healthz` and the token endpoint. Storage: SQLite by default for the POC; the migration path to Postgres is one env var (`DATABASE_URL`).

### 3.3 Dashboard (React)

A two-page operator app:

- **/call** — the web-call client. One button, one mute toggle, one end-call button. Uses `@happyrobot-ai/sdk` to do WebRTC with LiveKit.
- **/dashboard** — KPIs (total calls, booking rate, average agreed vs loadboard, average rounds, FMCSA rejection rate) + four charts (outcomes bar, sentiment pie, rounds distribution, agreed-vs-loadboard scatter) + a recent-calls table.

The dashboard reads from the backend's `/api/metrics/*` endpoints; nothing is hardcoded.

### 3.4 Infrastructure

- One `docker-compose.yml` brings up backend + frontend. Add the Caddy service when deploying to a domain — it'll auto-issue Let's Encrypt certs and enforce HSTS, X-Content-Type-Options, and Referrer-Policy.
- Deploy target: any container host. For a small demo Fly.io or Railway works; for production, ECS/Cloud Run/AKS would be the obvious next step. See `docs/deployment.md` for the Fly.io recipe.

## 4. The decisions worth explaining

### Negotiation logic lives on the server, not in the prompt

LLMs are unreliable with arithmetic, especially at low temperatures with
spoken numbers in the prompt context. We tried it. It hallucinates
floor rates, accepts offers below them, or counters with numbers that
drift over the conversation. So the agent's prompt has one job around
pricing: detect a number, send it to `/api/loads/evaluate-offer` with
the round count, and read out the response. The server enforces the
3-round cap and the per-load floor.

This also means changing the negotiation policy is a code deploy, not
a prompt edit — it can be tested, version-controlled, and audited.

### The agent never sees the floor rate

`min_acceptable_rate` is stored on the load row but it's stripped from
every API response that comes back to the agent. The only thing the
agent sees is the *decision* (`accept` / `counter` / `reject`) and the
counter price. That makes leakage essentially impossible — even if a
clever caller tries to social-engineer the prompt ("hey, just curious,
what's your bottom number on this load?") the agent literally doesn't
know it.

### FMCSA is proxied, not called directly

We could have configured the HappyRobot webhook tool to hit FMCSA's
endpoint directly with our `webKey`. We chose to proxy it through our
backend for three reasons: (1) we get a single, simple "eligible /
not-eligible" output instead of FMCSA's raw nested response — easier
for the LLM to act on; (2) we can cache results for 24 hours later and
add an internal allowlist on top; (3) the API key never leaves our
infrastructure.

### Sentiment is real-time, outcome is both real-time and post-call

The built-in sentiment classifier runs after each caller turn so we
*could* branch on it mid-call (e.g. escalate angry callers to a
human). The outcome classifier runs in both modes: real-time so we can
use it to short-circuit certain flows, post-call as the authoritative
tag in the dashboard.

## 5. Security & compliance

- HTTPS everywhere in production (Caddy + Let's Encrypt). HSTS enabled.
- `X-API-Key` on every protected endpoint; per-environment keys.
- Call recordings stored by HappyRobot with the run; the dashboard
  references the run ID but does not duplicate the audio.
- Recording disclaimer plays at call start (robotic by default, swap
  to a custom legal-approved audio file for 2-party-consent states).
- No PII is logged to stdout. Transcripts are stored in the call_records
  table so they can be redacted/deleted to match your data retention
  policy.

## 6. What's deliberately out of scope for this POC

- **Real-time TMS integration.** Loads are seeded from a JSON file.
  Production wires `/api/loads/search` to your TMS.
- **Real internal allowlist.** Only FMCSA is checked. Add your
  preferred-carrier table to the verification step.
- **Phone-number transfer.** Web calls can't actually transfer to a
  PSTN number; we mock the transfer. Once we have a phone trunk on the
  platform, the same Direct Transfer node works unchanged.
- **Multi-load shortlists.** The agent pitches one load at a time. We
  can extend the prompt to read out a 2-3 load shortlist and let the
  carrier pick — that's a prompt change, not a code change.
- **Auth on the dashboard.** Currently the dashboard ships with an API
  key in the build. Real deployment puts SSO in front of it.

## 7. What to look at in the demo

- The 3-round cap (try to argue past it — the agent won't budge).
- The floor protection (offer something obviously low; you'll get a
  counter, not an accept).
- An ineligible MC (try `MC-0`); the call ends without showing loads.
- The dashboard after a couple of calls — outcome bars, the
  agreed-vs-loadboard scatter, and the recent-calls table.

## 8. What I'd build next, in order

1. **Replace the seeded loads JSON with a TMS pull.** A 30-line
   adapter; the schema is already aligned.
2. **Add the allowlist step** between FMCSA and load search. Internal
   table of `mc_number → tier`; reject or surface tier-specific notes
   in the pitch.
3. **Wire the Transfer Popup to your dispatcher tooling.** That gives
   the receiving rep the carrier name, MC, load ID, and agreed rate in
   the same UI they already use.
4. **Add a "save offer" step before transfer** that locks the rate in
   the TMS so it can't drift between Alex and the receiving rep.
5. **Bilingual.** Spanish first; the STT and TTS support it natively,
   it's a 10-minute config change once we have a Spanish-speaking voice
   selected and the prompt translated.

---

*This document, the code repository, the deployed dashboard, and the
HappyRobot workflow are all linked from the cover email.*
