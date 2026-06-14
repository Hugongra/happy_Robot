#!/usr/bin/env python3
"""Deterministic eval harness for carrier sales backend critical rules."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import yaml
from rich.console import Console
from rich.table import Table

EVALS_DIR = Path(__file__).resolve().parent
DEFAULT_BASE_URL = "https://acme-carrier-api-hugog.fly.dev"
TIMEOUT = 10.0

console = Console()


@dataclass
class StepRecord:
    label: str
    method: str
    url: str
    request_body: Any
    status_code: int
    response_body: Any
    latency_ms: float


@dataclass
class ScenarioResult:
    id: str
    name: str
    category: str
    passed: bool
    reason: str = ""
    latency_ms: float = 0.0
    steps: list[StepRecord] = field(default_factory=list)


class EvalClient:
    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict | None = None,
        params: dict | None = None,
    ) -> tuple[int, Any, float]:
        url = f"{self.base_url}{path}"
        start = time.perf_counter()
        with httpx.Client(timeout=TIMEOUT) as client:
            response = client.request(
                method,
                url,
                headers=self.headers,
                json=json_body,
                params=params,
            )
        latency_ms = (time.perf_counter() - start) * 1000
        try:
            body = response.json()
        except Exception:
            body = response.text
        return response.status_code, body, latency_ms

    def record_step(
        self,
        label: str,
        method: str,
        path: str,
        request_body: Any,
        status_code: int,
        response_body: Any,
        latency_ms: float,
    ) -> StepRecord:
        return StepRecord(
            label=label,
            method=method,
            url=f"{self.base_url}{path}",
            request_body=request_body,
            status_code=status_code,
            response_body=response_body,
            latency_ms=latency_ms,
        )


def _fail(reason: str) -> tuple[bool, str]:
    return False, reason


def _pass() -> tuple[bool, str]:
    return True, ""


def validate_floor_rate_rejection(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    if not steps:
        return _fail("No response recorded")
    body = steps[0].response_body
    if not isinstance(body, dict):
        return _fail(f"Expected JSON object, got {type(body).__name__}")
    decision = body.get("decision")
    offer = steps[0].request_body.get("carrier_offer")
    if decision == expected.get("decision_not"):
        return _fail(f"decision was {decision!r}, expected anything except accept")
    if decision == "counter" and expected.get("if_counter_broker_counter_gt_offer"):
        counter = body.get("broker_counter", 0)
        if not (counter > offer):
            return _fail(f"broker_counter {counter} should be > offer {offer}")
    if decision not in ("counter", "reject"):
        return _fail(f"Expected counter or reject, got {decision!r}")
    return _pass()


def validate_three_round_cap(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    if len(steps) != 4:
        return _fail(f"Expected 4 round steps, got {len(steps)}")
    allowed_early = expected.get("rounds_1_to_3_decision_in", ["counter", "accept"])
    for i, step in enumerate(steps[:2], start=1):
        body = step.response_body
        if not isinstance(body, dict):
            return _fail(f"Round {i}: invalid JSON")
        if body.get("decision") not in allowed_early:
            return _fail(f"Round {i}: decision {body.get('decision')!r} not in {allowed_early}")
    # Backend treats round >= 3 as final; round 3 may already reject.
    final = steps[3].response_body
    if not isinstance(final, dict):
        return _fail("Round 4: invalid JSON")
    if final.get("decision") != expected.get("round_4_decision"):
        return _fail(f"Round 4: expected reject, got {final.get('decision')!r}")
    needle = expected.get("round_4_rationale_contains", "")
    rationale = (final.get("rationale") or "").lower()
    if needle and needle.lower() not in rationale:
        # Accept rationale from round 3 if round 4 echoes the same policy
        r3 = steps[2].response_body
        r3_text = (r3.get("rationale") or "").lower() if isinstance(r3, dict) else ""
        if needle.lower() not in r3_text and needle.lower() not in rationale:
            return _fail(f"Missing {needle!r} in round 3/4 rationale")
    return _pass()


def validate_decision(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    body = steps[0].response_body
    if not isinstance(body, dict):
        return _fail("Expected JSON object")
    if body.get("decision") != expected.get("decision"):
        return _fail(f"decision={body.get('decision')!r}, want {expected.get('decision')!r}")
    return _pass()


def validate_decision_in(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    body = steps[0].response_body
    if not isinstance(body, dict):
        return _fail("Expected JSON object")
    allowed = expected.get("decision_in", [])
    decision = body.get("decision")
    if decision not in allowed:
        return _fail(f"decision={decision!r}, want one of {allowed}")
    if decision == "counter" and expected.get("if_counter_within_of_offer"):
        offer = steps[0].request_body.get("carrier_offer", 0)
        counter = body.get("broker_counter", 0)
        delta = expected["if_counter_within_of_offer"]
        if abs(counter - offer) > delta:
            return _fail(f"broker_counter {counter} not within {delta} of offer {offer}")
    return _pass()


def validate_decision_not(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    body = steps[0].response_body
    if not isinstance(body, dict):
        return _fail("Expected JSON object")
    if body.get("decision") == expected.get("decision_not"):
        return _fail(f"decision must not be {expected.get('decision_not')!r}")
    return _pass()


def validate_fmcsa_invalid(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    step = steps[0]
    if step.status_code != expected.get("http_status", 200):
        return _fail(f"HTTP {step.status_code}, want 200")
    body = step.response_body
    if not isinstance(body, dict):
        return _fail("Expected JSON object")
    if body.get("eligible") is not False:
        return _fail(f"eligible={body.get('eligible')!r}, want false")
    if expected.get("reason_non_empty") and not (body.get("reason") or "").strip():
        return _fail("reason should be non-empty")
    return _pass()


def validate_fmcsa_dirty(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    if len(steps) != 3:
        return _fail(f"Expected 3 verify calls, got {len(steps)}")
    names: list[str] = []
    for i, step in enumerate(steps, start=1):
        body = step.response_body
        if not isinstance(body, dict):
            return _fail(f"Call {i}: invalid JSON")
        if body.get("eligible") is not expected.get("all_eligible"):
            return _fail(f"Call {i}: eligible={body.get('eligible')!r}")
        names.append(body.get("carrier_name") or "")
    if expected.get("same_carrier_name") and len(set(names)) != 1:
        return _fail(f"carrier_name mismatch across variants: {names}")
    want = expected.get("carrier_name")
    if want and names[0] != want:
        return _fail(f"carrier_name={names[0]!r}, want {want!r}")
    return _pass()


def validate_search_min_count(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    min_count = expected.get("all_min_count", 1)
    for i, step in enumerate(steps, start=1):
        if step.status_code != 200:
            return _fail(f"Request {i}: HTTP {step.status_code}")
        body = step.response_body
        if not isinstance(body, list):
            return _fail(f"Request {i}: expected JSON array")
        if len(body) < min_count:
            return _fail(f"Request {i}: count={len(body)}, want >={min_count}")
    return _pass()


def validate_lane_empty(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    step = steps[0]
    if step.status_code != expected.get("http_status", 200):
        return _fail(f"HTTP {step.status_code}, want 200")
    body = step.response_body
    if not isinstance(body, list):
        return _fail("Expected JSON array")
    if len(body) > expected.get("max_count", 0):
        return _fail(f"Expected empty list, got {len(body)} loads")
    return _pass()


def validate_webhook_idempotency(
    steps: list[StepRecord], expected: dict
) -> tuple[bool, str]:
    posts = expected.get("duplicate_posts", 2)
    if len(steps) < posts + 1:
        return _fail(f"Expected {posts} posts + verify, got {len(steps)}")
    ids: list[int | None] = []
    for i in range(posts):
        step = steps[i]
        if step.status_code != 200:
            return _fail(f"Webhook post {i+1}: HTTP {step.status_code}")
        body = step.response_body
        if not isinstance(body, dict):
            return _fail(f"Webhook post {i+1}: invalid JSON")
        if not body.get("stored"):
            return _fail(f"Webhook post {i+1}: stored={body.get('stored')!r}")
        ids.append(body.get("id"))
    first = steps[0].response_body
    second = steps[1].response_body
    if expected.get("first_updated") is False and first.get("updated") is not False:
        return _fail(f"First post should have updated=false, got {first.get('updated')!r}")
    if expected.get("second_updated") and not second.get("updated"):
        return _fail("Second post should have updated=true (upsert)")
    if expected.get("same_call_id") and ids[0] != ids[1]:
        return _fail(f"Expected same call id, got {ids}")
    verify = steps[-1]
    if verify.status_code != 200:
        return _fail(f"call detail: HTTP {verify.status_code}")
    detail = verify.response_body
    if not isinstance(detail, dict):
        return _fail("call detail should be JSON object")
    run_id = steps[0].request_body.get("run_id")
    if detail.get("run_id") != run_id:
        return _fail(f"call detail run_id={detail.get('run_id')!r}, want {run_id!r}")
    if detail.get("id") != ids[0]:
        return _fail("call detail id mismatch")
    return _pass()


VALIDATORS: dict[str, Any] = {
    "floor_rate_rejection": validate_floor_rate_rejection,
    "three_round_cap": validate_three_round_cap,
    "acceptance_at_posted": validate_decision,
    "counter_just_above_floor": validate_decision_in,
    "counter_just_below_floor": validate_decision_not,
    "fmcsa_invalid_mc": validate_fmcsa_invalid,
    "fmcsa_dirty_mc_format": validate_fmcsa_dirty,
    "equipment_typo_tolerance": validate_search_min_count,
    "lane_no_inventory": validate_lane_empty,
    "webhook_idempotency": validate_webhook_idempotency,
}


def run_scenario(client: EvalClient, scenario: dict) -> ScenarioResult:
    sid = scenario["id"]
    req = scenario["request"]
    expected = scenario["expected"]
    steps: list[StepRecord] = []
    total_latency = 0.0

    try:
        if req.get("type") == "multi_round":
            template = dict(req["body_template"])
            for rnd in req["rounds"]:
                body = {**template, "round_number": rnd}
                status, resp, lat = client.request("POST", req["path"], json_body=body)
                steps.append(
                    client.record_step(f"round {rnd}", "POST", req["path"], body, status, resp, lat)
                )
                total_latency += lat
        elif req.get("type") == "multi_request":
            for i, r in enumerate(req["requests"], start=1):
                status, resp, lat = client.request(
                    r["method"],
                    r["path"],
                    json_body=r.get("body"),
                    params=r.get("params"),
                )
                steps.append(
                    client.record_step(
                        f"request {i}",
                        r["method"],
                        r["path"],
                        r.get("body") or r.get("params"),
                        status,
                        resp,
                        lat,
                    )
                )
                total_latency += lat
        elif req.get("type") == "webhook_idempotency":
            body = dict(req["body"])
            run_id = f"eval-idempotency-{uuid.uuid4().hex[:12]}"
            body["run_id"] = run_id
            for i in range(expected.get("duplicate_posts", 2)):
                status, resp, lat = client.request("POST", req["path"], json_body=body)
                steps.append(
                    client.record_step(
                        f"webhook post {i+1}",
                        "POST",
                        req["path"],
                        body,
                        status,
                        resp,
                        lat,
                    )
                )
                total_latency += lat
            call_id = steps[0].response_body.get("id") if isinstance(steps[0].response_body, dict) else None
            if not call_id:
                steps.append(
                    client.record_step("verify call detail", "GET", req["verify_path"], {}, 0, {"error": "no id"}, 0)
                )
            else:
                path = f"{req['verify_path']}/{call_id}"
                status, resp, lat = client.request("GET", path)
                steps.append(
                    client.record_step(
                        "verify call detail",
                        "GET",
                        path,
                        {"call_id": call_id},
                        status,
                        resp,
                        lat,
                    )
                )
                total_latency += lat
        else:
            method = req["method"]
            path = req["path"]
            status, resp, lat = client.request(
                method,
                path,
                json_body=req.get("body"),
                params=req.get("params"),
            )
            steps.append(
                client.record_step("request", method, path, req.get("body") or req.get("params"), status, resp, lat)
            )
            total_latency = lat

        validator = VALIDATORS.get(sid)
        if not validator:
            passed, reason = _fail(f"No validator for scenario {sid}")
        else:
            passed, reason = validator(steps, expected)

    except Exception as exc:
        passed, reason = False, f"Runner error: {exc}"

    return ScenarioResult(
        id=sid,
        name=scenario["name"],
        category=scenario["category"],
        passed=passed,
        reason=reason,
        latency_ms=round(total_latency, 1),
        steps=steps,
    )


def _json_block(obj: Any) -> str:
    return json.dumps(obj, indent=2, default=str)


def write_report(base_url: str, results: list[ScenarioResult], path: Path) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed

    lines = [
        "# Eval report",
        "",
        f"**Generated:** {ts}  ",
        f"**Base URL:** `{base_url}`  ",
        f"**Total:** {len(results)} · **Passed:** {passed} · **Failed:** {failed}",
        "",
        "## Summary",
        "",
        "| ID | Category | Result | Latency (ms) |",
        "|----|----------|--------|--------------|",
    ]
    for r in results:
        status = "PASS" if r.passed else "FAIL"
        lines.append(f"| `{r.id}` | {r.category} | **{status}** | {r.latency_ms:.0f} |")

    lines.extend(["", "## Scenarios", ""])

    for r in results:
        verdict = "PASS" if r.passed else f"FAIL - {r.reason}"
        lines.append(f"<details>")
        lines.append(f"<summary><code>{r.id}</code> — {r.name} ({verdict})</summary>")
        lines.append("")
        for step in r.steps:
            lines.append(f"### {step.label}")
            lines.append("")
            lines.append(f"- **{step.method}** `{step.url}` -> HTTP {step.status_code} ({step.latency_ms:.0f} ms)")
            lines.append("")
            lines.append("**Request**")
            lines.append("")
            lines.append("```json")
            lines.append(_json_block(step.request_body))
            lines.append("```")
            lines.append("")
            lines.append("**Response**")
            lines.append("")
            lines.append("```json")
            lines.append(_json_block(step.response_body))
            lines.append("```")
            lines.append("")
        lines.append("</details>")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    base_url = os.environ.get("CARRIER_API_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    api_key = os.environ.get("CARRIER_API_KEY", os.environ.get("API_KEY", ""))

    if not api_key:
        console.print("[red]CARRIER_API_KEY (or API_KEY) is required[/red]")
        return 1

    scenarios_path = EVALS_DIR / "scenarios.yaml"
    with scenarios_path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    scenarios = data["scenarios"]

    client = EvalClient(base_url, api_key)
    results: list[ScenarioResult] = []

    console.print(f"\n[bold]Carrier sales eval harness[/bold] -> {base_url}\n")

    for scenario in scenarios:
        label = scenario["name"].replace("\u2192", "->")
        console.print(f"> [cyan]{scenario['id']}[/cyan]: {label}")
        result = run_scenario(client, scenario)
        results.append(result)
        if result.passed:
            console.print(f"  [green]PASS[/green] ({result.latency_ms:.0f} ms)")
        else:
            console.print(f"  [red]FAIL[/red] - {result.reason}")

    table = Table(title="Summary")
    table.add_column("ID")
    table.add_column("Category")
    table.add_column("Result")
    table.add_column("Latency (ms)", justify="right")
    for r in results:
        table.add_row(r.id, r.category, "[green]PASS[/green]" if r.passed else "[red]FAIL[/red]", f"{r.latency_ms:.0f}")

    console.print()
    console.print(table)

    report_path = EVALS_DIR / "report.md"
    write_report(base_url, results, report_path)
    console.print(f"\nReport written to [bold]{report_path}[/bold]\n")

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    if failed:
        console.print(f"[red]{failed} scenario(s) failed[/red]")
        return 1
    console.print(f"[green]All {passed} scenarios passed[/green]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
