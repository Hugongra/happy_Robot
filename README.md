# HappyRobot FDE Technical Challenge Submission

## Acme Logistics — Inbound Carrier Sales

AI voice agent for inbound carrier sales: FMCSA verification, load matching, bounded negotiation (3 rounds), and handoff to a human rep. Custom ops dashboard fed by post-call telemetry and HappyRobot platform sync.

---

## Challenge fit

Submission for the **FDE Technical Challenge: Inbound Carrier Sales**.

| Objective | Implementation |
|-----------|----------------|
| **1. Inbound use case** | HappyRobot voice agent, FMCSA gate, load search, negotiation, mocked transfer, post-call Extract/Classify |
| **2. Metrics** | Custom React + FastAPI dashboard (not HappyRobot analytics UI) |
| **3. Deployment** | Docker Compose locally, live on Fly.io |

### Submission artifacts

- **Build description** — [`deliverables/acme-logistics-build-description.md`](deliverables/acme-logistics-build-description.md)
- **Architecture** — [`docs/architecture.md`](docs/architecture.md)
- **Support runbook** — [`docs/runbook.md`](docs/runbook.md)
- **Workflow setup** — [`docs/workflow-setup.md`](docs/workflow-setup.md)
- **MCP server (extra)** — [`mcp/`](mcp/) — exposes the API as tools for Claude / any MCP client
- **Evaluation harness (extra)** — [`evals/`](evals/) — deterministic checks for negotiation rules, FMCSA gate, normalization, and webhook idempotency
- **Live demo** — links below

---

## Live demo (Fly.io)

| App | URL |
|-----|-----|
| **Dashboard** | https://acme-carrier-app-hugog.fly.dev/dashboard |
| **Web call** | https://acme-carrier-app-hugog.fly.dev/call |
| **API** | https://acme-carrier-api-hugog.fly.dev |
| **Swagger** | https://acme-carrier-api-hugog.fly.dev/docs |

---

## What to test in 3 minutes

1. Open **web call**, start a session as a carrier.
2. Use demo MC **`123456`** for a deterministic happy path.
3. Ask for `Dallas → Atlanta`, `Dry Van`; counter on price twice.
4. Open **dashboard**, refresh — call appears in KPIs, route map, funnel, call log.
5. Click a call row — drill-down panel with load details, negotiation ladder, raw JSON.

Proves: server-side tool use, pricing guardrails, telemetry into ops visibility.

---

## Screenshots

| | |
|---|---|
| HappyRobot workflow | ![Workflow](docs/screenshots/workflow.png) |
| Web call | ![Web call](docs/screenshots/web-call.png) |
| Ops dashboard | ![Dashboard](docs/screenshots/dashboard.png) |

---

## Architecture

```
┌─────────────┐    LiveKit WebRTC   ┌──────────────────┐
│   Browser   │◄──────────────────► │  HappyRobot      │
│ (Web Call)  │                     │  Voice Agent     │
└──────┬──────┘                     └─────────┬────────┘
       │  POST /api/voice/token               │ webhook tools:
       ▼                                      │ verify · search · evaluate
┌─────────────────────────────────────────────┴─────────────┐
│                     Backend (FastAPI)                     │
│  /api/fmcsa/verify  /api/loads/*  /api/webhooks/call-completed │
│  /api/metrics/*     /api/metrics/sync-happyrobot            │
└────────────────────────────┬────────────────────────────────┘
                             │ SQLite call_records
                             ▼
                    ┌────────────────┐
                    │  React SPA     │
                    │  /call /dashboard │
                    └────────────────┘
```

**Telemetry paths:** (1) post-call webhook from HappyRobot Extract/Classify; (2) dashboard refresh triggers platform sync to reconstruct sparse rows from Runs API tool outputs.

### Key design decisions

- [**Server-side negotiation**](docs/architecture.md#server-side-negotiation) — `evaluate-offer` enforces floor and 3-round cap; not in the prompt.
- [**FMCSA proxy**](docs/architecture.md#fmcsa-proxy) — normalized eligibility; API key server-only.
- [**Dual telemetry**](docs/architecture.md#dual-telemetry) — webhook + platform sync backfill.
- [**Defensive normalization**](docs/architecture.md#defensive-normalization) — tolerates STT/LLM dirty tool params.
- [**run_id idempotency**](docs/architecture.md#run-id-idempotency) — upsert on sync prevents duplicate call rows.

Full system design, scaling path, data model, and repository tree: [`docs/architecture.md`](docs/architecture.md).

---

## Dashboard

The ops dashboard (`/dashboard`) includes:

- **KPIs** — total calls, loads booked, booking rate, total broker margin, yield per mile, avg agreed rate, **negotiation savings** (avg discount vs posted on booked loads), avg rounds, avg call duration, FMCSA reject %
- **Platform savings** — per-window agent labor savings, margin captured, total; **interactive ROI calculator** with sliders (calls/day, booking rate, cost per human call) projecting annual labor + negotiation margin
- **Live mode** — toggle for **5s** auto-refresh (default 30s); pulsing **call-in-progress** badge; new call-log rows flash on arrival
- **Hide test calls** — filter (on by default) excludes `platform_run` and empty-MC rows from all metrics and the call log
- **Route map** — booked lanes with per-lane margin
- **Operational views** — conversion funnel, equipment performance, missed opportunities, outcomes, sentiment, negotiation rounds
- **Pricing analysis** — agreed-vs-posted scatter, negotiation ladder chart
- **Call logs** — merged HappyRobot runs + webhook records; **click any row** for slide-in detail (FMCSA status, load details, per-call negotiation ladder, margin, transfer status, collapsible raw JSON)
- **Auto-refresh** — every 30s (or 5s in Live mode); syncs HappyRobot runs then reloads metrics

Demo data fills charts only when there are **no** live API calls.

---

## MCP server (extra)

Beyond the dashboard UI, the same API is exposed as a **read-only MCP server** so Claude (Desktop, Code, or any MCP client) can query loads, KPIs, and call records in natural language. Same contract, same `X-API-Key` — the dashboard is one consumer, Claude is another.

| Tool | What it does |
|------|----------------|
| `search_loads` | Open loads on the loadboard (max 10 from API) |
| `get_metrics_summary` | Aggregated KPIs (60s cache) |
| `get_recent_calls` | Recent voice-agent calls with filters |
| `get_call_detail` | Transcript, payload, load, transfer status |

**Resilience:** retries on 429/5xx, metrics cache, rate limit **120 req/min** (configurable via `MCP_RATE_LIMIT_PER_MIN`). Write tools are not implemented — read-only by design.

**Claude Desktop (2 min):** `pip install -r mcp/requirements.txt`, set `CARRIER_API_KEY` in `mcp/.env`, add server with `"args": ["-m", "mcp.server"]` and `"cwd": "<repo root>"`. Full config and demo prompts: [`mcp/README.md`](mcp/README.md).

---

## Evaluation harness (extra)

Inspired by HappyRobot's adversarial-agent testing approach, the repo ships a deterministic eval harness covering the 10 most load-bearing rules: floor rate, 3-round cap, FMCSA gate, MC and equipment normalization, lane-without-inventory handling, and webhook idempotency. One command, one markdown report.

Setup, scenarios, and the natural evolution toward Claude-driven adversarial carriers: [`evals/README.md`](evals/README.md).

---

## Repository layout

```
backend/ · frontend/ · mcp/ · caddy/ · docs/ · deliverables/
```

Full tree, layering rules, and production evolution: [`docs/architecture.md#repository-layout`](docs/architecture.md#repository-layout).

---

## Quick start

```bash
git clone <this-repo>
cd carrier-sales-agent
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# fill in: API_KEY (same in both), FMCSA_WEB_KEY,
#          HAPPYROBOT_API_KEY, HAPPYROBOT_WORKFLOW_ID
docker compose up --build
```

| Page | URL |
|------|-----|
| Swagger | http://localhost:8000/docs |
| Web call | http://localhost:5173/call |
| Dashboard | http://localhost:5173/dashboard |

DB auto-seeds 8 loads on first start. Wipe: `docker compose down -v`.

**Health check:** `export API_KEY=... && ./scripts/smoke.sh` — see [`docs/runbook.md`](docs/runbook.md).

---

## Docker & deployment

Fully containerized: `python:3.12-slim` backend, `node:20` → `nginx` frontend, optional Caddy TLS.

| Target | How |
|--------|-----|
| **Local** | See [Quick start](#quick-start) |
| **Fly.io** (live demo) | `fly deploy` per app — [`backend/fly.toml`](backend/fly.toml), [`frontend/fly.toml`](frontend/fly.toml) |
| **VPS + domain** | Caddy + Let's Encrypt — [`docs/deployment.md`](docs/deployment.md) |

Frontend bakes `VITE_API_BASE_URL` and `VITE_API_KEY` at build time. HTTPS on Fly.io is automatic.

### Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `API_KEY` | backend + `VITE_API_KEY` | Auth for all `/api/*` |
| `FMCSA_WEB_KEY` | backend | FMCSA verification |
| `HAPPYROBOT_API_KEY` | backend | Voice tokens + platform sync |
| `HAPPYROBOT_WORKFLOW_ID` | backend | Workflow for tokens & runs |
| `VITE_API_BASE_URL` | frontend (build) | Backend URL |
| `CORS_ORIGINS` | backend | Allowed dashboard origins |
| `CARRIER_API_KEY` | mcp | MCP server → backend auth (same value as `API_KEY`) |
| `MCP_RATE_LIMIT_PER_MIN` | mcp | Max backend calls/min per MCP session (default 120) |

---

## HappyRobot post-call webhook

Webhook node (child of Inbound Voice Agent):

```
POST https://<api-host>/api/webhooks/call-completed
Header: X-API-Key: <API_KEY>
```

### Wire transcript into Extract / Classify

Set **Input** on AI Extract and AI Classify to:

```
inbound_voice_agent.transcript
```

Empty `@transcript` → blank dashboard rows even with a correct webhook body.

### Recommended webhook body

```json
{
  "run_id": "current.run_id",
  "mc_number": "ai_extract_telemetry.response.mc_number",
  "carrier_name": "ai_extract_telemetry.response.carrier_name",
  "carrier_eligible": ai_extract_telemetry.response.carrier_eligible,
  "load_id": "ai_extract_telemetry.response.load_id",
  "loadboard_rate": ai_extract_telemetry.response.loadboard_rate,
  "agreed_rate": ai_extract_telemetry.response.agreed_rate,
  "counter_offers": ai_extract_telemetry.response.counter_offers,
  "origin": "ai_extract_telemetry.response.origin",
  "destination": "ai_extract_telemetry.response.destination",
  "equipment_type": "ai_extract_telemetry.response.equipment_type",
  "outcome": "ai_classify_telemetry.response.classification",
  "sentiment": "inbound_voice_agent.real_time_sentiment_classifier",
  "classification_reasoning": "ai_classify_telemetry.response.reasoning",
  "duration_seconds": 0,
  "call_duration_seconds": inbound_voice_agent.duration,
  "transcript": "inbound_voice_agent.transcript"
}
```

**Legacy `@` syntax:** use `"outcome": "@classify.classification"` — **not** `@classify.outcome` (causes 422).

Backend coerces messy payloads and **always returns HTTP 200**. Sparse rows: `POST /api/metrics/sync-happyrobot` or dashboard Refresh.

**Troubleshooting:** [`docs/runbook.md`](docs/runbook.md)

---

## API reference (summary)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/healthz` | — | Liveness |
| `POST` | `/api/voice/token` | ✓ | LiveKit token |
| `POST` | `/api/fmcsa/verify` | ✓ | Carrier MC check |
| `GET` | `/api/loads/search` | ✓ | Load board |
| `POST` | `/api/loads/evaluate-offer` | ✓ | Negotiation policy |
| `POST` | `/api/webhooks/call-completed` | ✓ | Post-call sink |
| `GET` | `/api/metrics/summary` | ✓ | Dashboard KPIs |
| `GET` | `/api/metrics/recent-calls` | ✓ | Call logs (merged) |
| `GET` | `/api/metrics/calls/{id}` | ✓ | Call detail |
| `POST` | `/api/metrics/sync-happyrobot` | ✓ | Platform backfill |

---

## Security

[`docs/security.md`](docs/security.md) — HTTPS, API key, CORS.

- `X-API-Key` on all `/api/*` (public: `/healthz`, `/docs` only).
- FMCSA and HappyRobot keys server-side only.
- `min_acceptable_rate` stripped from load responses.
- Negotiation policy enforced server-side.

---

## What's deliberately not in the POC

- **TMS integration** — loads from seeded JSON, not a live TMS.
- **Carrier allowlist** — FMCSA only.
- **Real phone transfer** — web-call constraint; transfer mocked per brief.
- **Dashboard SSO** — the SPA embeds `VITE_API_KEY` at build time. Acceptable here because the dashboard is **read-only**, serves **synthetic/demo telemetry**, and reviewers need frictionless access to the live Fly.io demo without an identity provider. In production, an **SSO proxy** sits in front of the dashboard and a **session-gated token endpoint** replaces the static bundle key.
