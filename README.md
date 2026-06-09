# Acme Logistics — Inbound Carrier Sales

A full implementation of the HappyRobot FDE technical challenge: an AI
voice agent that takes inbound calls from freight carriers, verifies
them with FMCSA, matches them to a load, negotiates a price (max 3
rounds), and hands off to a human sales rep on agreement. Plus a custom
dashboard for the ops team.

> 📄 **For the customer narrative**, read [`deliverables/acme-logistics-build-description.md`](deliverables/acme-logistics-build-description.md).
> 📧 **For the email to Carlos Becker**, see [`deliverables/email-to-carlos-becker.txt`](deliverables/email-to-carlos-becker.txt).
> 🎙️ **For the HappyRobot workflow setup**, see [`docs/workflow-setup.md`](docs/workflow-setup.md).
> 🚢 **To deploy**, see [`docs/deployment.md`](docs/deployment.md).
> 🎬 **For the 5-min video script**, see [`docs/demo-script.md`](docs/demo-script.md).

---

## Architecture

```
┌─────────────┐    LiveKit WebRTC   ┌──────────────────┐
│   Browser   │◄──────────────────► │  HappyRobot      │
│ (Web Call)  │                     │  Voice Agent     │
└──────┬──────┘                     │  (your workflow) │
       │  POST /api/voice/token     └─────────┬────────┘
       │                                      │   webhook tools:
       │                                      │   - verify_carrier
       ▼                                      │   - search_loads
┌─────────────────────────────────────────────┴─────────────┐
│                        Backend (FastAPI)                  │
│                                                           │
│  /api/voice/token      ← mints LiveKit tokens             │
│  /api/fmcsa/verify     ← proxies FMCSA, normalizes        │
│  /api/loads/search     ← load board (8 seeded loads)      │
│  /api/loads/evaluate-offer ← deterministic negotiation    │
│  /api/webhooks/call-completed ← post-call sink            │
│  /api/metrics/*        ← powers the dashboard             │
└────────────────────────────┬──────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  React UI      │
                    │  /call         │
                    │  /dashboard    │
                    └────────────────┘
```

## Repository layout

```
.
├── backend/                FastAPI app (auth, loads, FMCSA, voice token, webhooks, metrics)
│   ├── app/
│   │   ├── main.py
│   │   ├── settings.py
│   │   ├── database.py
│   │   ├── auth.py
│   │   ├── seed_loads.json
│   │   └── routers/
│   │       ├── loads.py
│   │       ├── fmcsa.py
│   │       ├── voice.py
│   │       ├── webhooks.py
│   │       └── metrics.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/               React (Vite) — Web call UI + Dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   ├── lib/api.ts
│   │   └── pages/
│   │       ├── WebCall.tsx
│   │       └── Dashboard.tsx
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
│
├── caddy/
│   └── Caddyfile           Reverse proxy + Let's Encrypt for prod
│
├── docs/
│   ├── voice-agent-prompt.md   ← Paste into the HappyRobot prompt node
│   ├── workflow-setup.md       ← Step-by-step platform configuration
│   ├── deployment.md           ← Local / Fly.io / VPS recipes
│   └── demo-script.md          ← Script for the 5-min walkthrough
│
├── deliverables/
│   ├── email-to-carlos-becker.txt
│   └── acme-logistics-build-description.md
│
└── docker-compose.yml
```

## Quick start

```bash
git clone <this-repo>
cd carrier-sales-agent
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# fill in: API_KEY (same in both), FMCSA_WEB_KEY, HAPPYROBOT_API_KEY, HAPPYROBOT_WORKFLOW_ID
docker compose up --build
```

- Backend Swagger: <http://localhost:8000/docs>
- Web call page: <http://localhost:5173/call>
- Dashboard: <http://localhost:5173/dashboard>

The DB is auto-seeded with 8 sample loads (`backend/app/seed_loads.json`)
on first start. Wipe with `docker compose down -v`.

## Security

- `X-API-Key` header on every endpoint except `/healthz` and `/api/voice/token`
  (the token endpoint is called from the browser pre-auth; in production
  it should be gated by a session cookie + Origin allowlist).
- FMCSA web key never leaves the backend.
- HappyRobot API key never leaves the backend.
- The internal `min_acceptable_rate` field is **stripped** from every
  load response — even the agent can't see it.
- HTTPS via Caddy + Let's Encrypt in production.
- Negotiation policy and the 3-round cap are enforced **server-side**,
  not in the prompt.

## What's deliberately not in the POC

- Real TMS integration (loads come from JSON, not from a TMS).
- Internal carrier allowlist on top of FMCSA.
- Actual phone transfer (web-call constraint — mocked per the brief).
- Auth on the dashboard (a build-time API key in the bundle; behind SSO
  in production).
