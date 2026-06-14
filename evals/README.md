# Evaluation harness

Deterministic checks for the carrier sales backend's load-bearing business rules.

## Why this exists

HappyRobot's forward-deployment team stress-tests voice agents with **adversarial agents** — another model playing the hardest possible customer — before go-live. That approach catches edge cases in languages and flows the team may not speak fluently.

This submission scopes that philosophy down to something reproducible for reviewers: **10 fixed scenarios** that hit the negotiation policy, FMCSA gate, search normalization, and webhook idempotency over HTTP. No LLM in the loop — just requests, assertions, and a markdown report.

The natural next step is replacing fixed inputs with a **Claude-driven adversarial carrier** that negotiates freely against `/api/loads/evaluate-offer` for N turns and flags any floor breach or policy violation autonomously.

## What it covers

| Category | Scenarios | Rules exercised |
|----------|-----------|-----------------|
| **Negotiation** (5) | `floor_rate_rejection`, `three_round_cap`, `acceptance_at_posted`, `counter_just_above_floor`, `counter_just_below_floor` | Floor rate, 3-round cap, accept at posted |
| **Verification** (2) | `fmcsa_invalid_mc`, `fmcsa_dirty_mc_format` | Ineligible MC handling, MC string normalization |
| **Search** (2) | `equipment_typo_tolerance`, `lane_no_inventory` | Equipment aliases, empty lane → 200 not 500 |
| **Telemetry** (1) | `webhook_idempotency` | Duplicate `run_id` upsert, single dashboard row |

### API field mapping (vs generic spec)

The backend uses these response fields (documented here so reviewers aren't surprised):

| Spec term | Actual API field |
|-----------|------------------|
| `action` | `decision` (`accept` \| `counter` \| `reject`) |
| `counter_price` | `broker_counter` |
| Max rounds signal | `rationale` contains `"3 rounds"` on final reject |

Reference load **ACM-1001** (Dallas → Atlanta, Dry Van): posted **$2100**, internal floor **$1950** (from `seed_loads.json`; floor echoed as `floor_rate` in evaluate-offer responses but not on load search).

### Known findings on Fly.io (production)

| Scenario | Behavior | Notes |
|----------|----------|-------|
| `fmcsa_invalid_mc` | May return **HTTP 502** for unknown MCs when FMCSA upstream errors | Demo MC `123456` bypasses upstream; real unknown MCs do not. Backend could degrade to `eligible: false` with 200 instead of 502. |
| `lane_no_inventory` | Dallas→Phoenix **Reefer** or **Dallas** origin queries return loads via filter relaxation | Scenario uses **Fairbanks→Nome Tanker** (equipment not in seed). |
| `webhook_idempotency` | Verified via webhook `id` + `GET /api/metrics/calls/{id}` | `recent-calls` merges HappyRobot platform runs and may omit eval-only webhook rows. |

## How to run

```bash
pip install -r evals/requirements.txt

export CARRIER_API_BASE_URL=https://acme-carrier-api-hugog.fly.dev
export CARRIER_API_KEY=<same value as backend API_KEY>

python evals/run_evals.py
```

Against local Docker Compose:

```bash
export CARRIER_API_BASE_URL=http://localhost:8000
export CARRIER_API_KEY=<from backend/.env>
python evals/run_evals.py
```

Exit code **0** = all pass; **1** = at least one failure. Console output uses [rich](https://github.com/Textualize/rich); full request/response traces land in [`report.md`](report.md).

## Latest run

See [`report.md`](report.md) for the most recent committed results (timestamp, base URL, per-scenario PASS/FAIL).

## Future work

- **Adversarial agent** — Claude-driven carrier negotiates freely for N turns; log any floor breach or rule violation.
- **Multi-language** — re-run voice-level scenarios in Spanish / other languages via HappyRobot web call.
- **CI gate** — run evals on every backend deploy; block promotion on regression.
