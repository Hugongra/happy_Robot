# Runbook — Carrier Sales Agent

Operational guide for verifying health, diagnosing common failures, and correlating HappyRobot runs with backend records.

**Related:** [README webhook section](../README.md#happyrobot-post-call-webhook) · [workflow-setup.md](./workflow-setup.md) · [architecture.md](./architecture.md)

---

## How to verify the system is healthy in 60 seconds

Set your target API and key (local or Fly.io):

```bash
export BASE_URL=https://acme-carrier-api-hugog.fly.dev   # or http://localhost:8000
export API_KEY=<your-api-key>
```

Or run the bundled script (see [Automated smoke test](#automated-smoke-test) below).

### 1. Liveness — `GET /healthz` (no auth)

```bash
curl -s "$BASE_URL/healthz"
```

**Expected:** `{"status":"ok"}`

### 2. Load board — `GET /api/loads/search` (auth required)

```bash
curl -s -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/loads/search?origin=Dallas&destination=Atlanta&equipment_type=Dry%20Van&limit=3"
```

**Expected:** HTTP 200, JSON array with at least one load (e.g. `ACM-1001`). Each object includes `load_id`, `origin`, `destination`, `loadboard_rate` and **must not** include `min_acceptable_rate`.

### 3. FMCSA — `POST /api/fmcsa/verify` (demo MC)

```bash
curl -s -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"mc_number":"123456"}' \
  "$BASE_URL/api/fmcsa/verify"
```

**Expected:** HTTP 200, `"eligible": true`, `"carrier_name": "Acme Trucking LLC"`. Demo MC `123456` skips upstream FMCSA and always succeeds.

### 4. Metrics — `GET /api/metrics/summary`

```bash
curl -s -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/metrics/summary?days=30"
```

**Expected:** HTTP 200, JSON with `total_calls`, `booked_loads`, `booking_rate`, `total_broker_margin`, etc.

---

## Symptom → Diagnosis → Fix

### 1. Dashboard shows "Unknown caller" rows / empty fields

| | |
|---|---|
| **Symptom** | Call log rows with blank MC, lane, rates, or carrier name "Unknown caller" / "HappyRobot run". |
| **Diagnosis** | Post-call **AI Extract** received an empty transcript (Extract/Classify Input not wired to `inbound_voice_agent.transcript`), or webhook body used unresolved `@` placeholders. |
| **Fix** | In HappyRobot workflow: set **AI Extract** and **AI Classify** Input to `inbound_voice_agent.transcript`. Publish workflow. See [README webhook section](../README.md#happyrobot-post-call-webhook). |
| **Repair existing rows** | Trigger platform backfill: `curl -X POST -H "X-API-Key: $API_KEY" "$BASE_URL/api/metrics/sync-happyrobot"`. Then refresh the dashboard (Refresh button runs sync automatically). |

### 2. Webhook node shows 422

| | |
|---|---|
| **Symptom** | HappyRobot webhook node fails with HTTP 422 Unprocessable Entity. |
| **Diagnosis** | Wrong node-reference syntax — common mistake: `@classify.outcome` instead of `@classify.classification`, or boolean/number fields sent as quoted strings. |
| **Fix** | Use the recommended body in [README](../README.md#recommended-webhook-body-happyrobot-node-reference-syntax). For legacy `@extract` / `@classify` style, set `"outcome": "@classify.classification"` (not `.outcome`). Republish workflow. |

### 3. FMCSA verification fails or times out

| | |
|---|---|
| **Symptom** | Agent says carrier cannot be verified; tool returns 500 or times out. |
| **Diagnosis** | Missing `FMCSA_WEB_KEY`, upstream FMCSA 403/slow response, or cold start on Fly.io. |
| **Fix** | Confirm `FMCSA_WEB_KEY` is set (`fly secrets list -a acme-carrier-api-hugog`). Backend uses a **5s timeout**. For demos, use MC **`123456`** (hardcoded demo carrier, no upstream call). |

### 4. Agent quotes a wrong rate

| | |
|---|---|
| **Symptom** | Carrier hears a posted or counter rate that does not match the load board or negotiation policy. |
| **Diagnosis** | LLM improvised a number instead of reading tool output, or `evaluate_offer` / `search_loads` not called. |
| **Fix** | Verify workflow tools point to `/api/loads/search` and `/api/loads/evaluate-offer` with correct `X-API-Key`. Confirm voice prompt instructs agent to **only** quote rates from tool responses. Floor enforcement is server-side in `evaluate-offer`. |

### 5. Call connects but no record appears in dashboard

| | |
|---|---|
| **Symptom** | Web call completes; dashboard KPIs and call log unchanged after refresh. |
| **Diagnosis** | Post-call webhook not configured, wrong URL, missing `X-API-Key`, or Extract/Classify produced empty payload. |
| **Fix** | Webhook URL: `POST https://<api-host>/api/webhooks/call-completed` with header `X-API-Key: <API_KEY>`. Check HappyRobot run for webhook node errors. Run `POST /api/metrics/sync-happyrobot` to backfill from platform tool outputs. |

### 6. Frontend cannot reach API (401 / CORS)

| | |
|---|---|
| **Symptom** | Dashboard shows API error, 401 on metrics, or browser CORS failure. |
| **Diagnosis** | `VITE_API_KEY` (frontend build) does not match backend `API_KEY`, or `CORS_ORIGINS` omits the dashboard origin. |
| **Fix** | Rebuild frontend with matching `--build-arg VITE_API_KEY=...`. Set backend `CORS_ORIGINS` to include the app origin (e.g. `https://acme-carrier-app-hugog.fly.dev`, `http://localhost:5173`). |

---

## Live debugging

### Tail API logs (Fly.io)

```bash
fly logs -a acme-carrier-api-hugog
```

**Grep for tool-call issues:**

```bash
fly logs -a acme-carrier-api-hugog | grep -iE "error|422|fmcsa|webhook|timeout|sync"
```

Local Docker: `docker compose logs -f backend`

### Correlate HappyRobot `run_id` → `call_records`

1. In HappyRobot platform UI, open the **Workflow run** and copy the run ID.
2. Dashboard call rows include `run_id` when synced from platform (or in call detail raw JSON).
3. Query API: `GET /api/metrics/recent-calls?days=30&limit=50` with `X-API-Key` — match `run_id` field.
4. Single record: `GET /api/metrics/calls/{id}` for full `raw_payload` and transcript.

Log lines from webhook handler and `platform_sync` include run IDs when reconstruction runs.

### Inspect tool outputs in HappyRobot UI

1. Open the run in **HappyRobot → Runs**.
2. Expand node outputs for: **FMCSA Verify** (`verify_carrier`), **Search Loads**, **Evaluate Offer**, **Inbound Voice Agent** (transcript).
3. Compare tool JSON to dashboard row — if tools have data but webhook row is empty, fix Extract/Classify input wiring and run sync.

---

## Automated smoke test

From repo root (requires `curl` and `bash`):

```bash
export BASE_URL=https://acme-carrier-api-hugog.fly.dev
export API_KEY=<your-api-key>
./scripts/smoke.sh
```

Prints `PASS` / `FAIL` per check. See [`scripts/smoke.sh`](../scripts/smoke.sh).
