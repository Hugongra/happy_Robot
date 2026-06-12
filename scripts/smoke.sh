#!/usr/bin/env bash
# Smoke test for Carrier Sales API — see docs/runbook.md
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
API_KEY="${API_KEY:?Set API_KEY (must match backend/.env)}"

pass=0
fail=0

run_check() {
  local name="$1"
  shift
  if "$@"; then
    echo "PASS  $name"
    pass=$((pass + 1))
  else
    echo "FAIL  $name"
    fail=$((fail + 1))
  fi
}

check_healthz() {
  curl -sf "$BASE_URL/healthz" | grep -q '"status":"ok"'
}

check_loads_search() {
  local code body
  body=$(curl -sf -H "X-API-Key: $API_KEY" \
    "$BASE_URL/api/loads/search?origin=Dallas&destination=Atlanta&equipment_type=Dry%20Van&limit=1")
  echo "$body" | grep -q '"load_id"'
}

check_fmcsa_demo() {
  local body
  body=$(curl -sf -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
    -d '{"mc_number":"123456"}' \
    "$BASE_URL/api/fmcsa/verify")
  echo "$body" | grep -q '"eligible":true' && echo "$body" | grep -q 'Acme Trucking'
}

check_metrics_summary() {
  local body
  body=$(curl -sf -H "X-API-Key: $API_KEY" \
    "$BASE_URL/api/metrics/summary?days=30")
  echo "$body" | grep -q '"total_calls"'
}

echo "Smoke test → $BASE_URL"
echo "---"

run_check "GET /healthz" check_healthz
run_check "GET /api/loads/search (authed)" check_loads_search
run_check "POST /api/fmcsa/verify MC 123456" check_fmcsa_demo
run_check "GET /api/metrics/summary" check_metrics_summary

echo "---"
echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
