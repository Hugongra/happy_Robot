# Eval report

**Generated:** 2026-06-14 02:24:57 UTC  
**Base URL:** `https://acme-carrier-api-hugog.fly.dev`  
**Total:** 10 · **Passed:** 10 · **Failed:** 0

## Summary

| ID | Category | Result | Latency (ms) |
|----|----------|--------|--------------|
| `floor_rate_rejection` | negotiation | **PASS** | 643 |
| `three_round_cap` | negotiation | **PASS** | 2623 |
| `acceptance_at_posted` | negotiation | **PASS** | 883 |
| `counter_just_above_floor` | negotiation | **PASS** | 812 |
| `counter_just_below_floor` | negotiation | **PASS** | 826 |
| `fmcsa_invalid_mc` | verification | **PASS** | 1268 |
| `fmcsa_dirty_mc_format` | verification | **PASS** | 2550 |
| `equipment_typo_tolerance` | search | **PASS** | 2510 |
| `lane_no_inventory` | search | **PASS** | 801 |
| `webhook_idempotency` | telemetry | **PASS** | 2550 |

## Scenarios

<details>
<summary><code>floor_rate_rejection</code> — Offer well below floor is rejected or countered above offer (PASS)</summary>

### request

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/loads/evaluate-offer` -> HTTP 200 (643 ms)

**Request**

```json
{
  "load_id": "ACM-1001",
  "carrier_offer": 1050,
  "round_number": 1
}
```

**Response**

```json
{
  "decision": "counter",
  "broker_counter": 2040.0,
  "rationale": "Counter between carrier offer and posted rate.",
  "floor_rate": 1950.0
}
```

</details>

<details>
<summary><code>three_round_cap</code> — Fourth negotiation round cannot keep countering indefinitely (PASS)</summary>

### round 1

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/loads/evaluate-offer` -> HTTP 200 (592 ms)

**Request**

```json
{
  "load_id": "ACM-1001",
  "carrier_offer": 1500,
  "round_number": 1
}
```

**Response**

```json
{
  "decision": "counter",
  "broker_counter": 2040.0,
  "rationale": "Counter between carrier offer and posted rate.",
  "floor_rate": 1950.0
}
```

### round 2

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/loads/evaluate-offer` -> HTTP 200 (654 ms)

**Request**

```json
{
  "load_id": "ACM-1001",
  "carrier_offer": 1500,
  "round_number": 2
}
```

**Response**

```json
{
  "decision": "counter",
  "broker_counter": 2040.0,
  "rationale": "Counter between carrier offer and posted rate.",
  "floor_rate": 1950.0
}
```

### round 3

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/loads/evaluate-offer` -> HTTP 200 (781 ms)

**Request**

```json
{
  "load_id": "ACM-1001",
  "carrier_offer": 1500,
  "round_number": 3
}
```

**Response**

```json
{
  "decision": "reject",
  "broker_counter": 0.0,
  "rationale": "Offer too low after 3 rounds. Reject politely.",
  "floor_rate": 1950.0
}
```

### round 4

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/loads/evaluate-offer` -> HTTP 200 (595 ms)

**Request**

```json
{
  "load_id": "ACM-1001",
  "carrier_offer": 1500,
  "round_number": 4
}
```

**Response**

```json
{
  "decision": "reject",
  "broker_counter": 0.0,
  "rationale": "Offer too low after 3 rounds. Reject politely.",
  "floor_rate": 1950.0
}
```

</details>

<details>
<summary><code>acceptance_at_posted</code> — Offer at posted rate is accepted immediately (PASS)</summary>

### request

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/loads/evaluate-offer` -> HTTP 200 (883 ms)

**Request**

```json
{
  "load_id": "ACM-1001",
  "carrier_offer": 2100,
  "round_number": 1
}
```

**Response**

```json
{
  "decision": "accept",
  "broker_counter": 0.0,
  "rationale": "Carrier offer meets or exceeds posted rate.",
  "floor_rate": 1950.0
}
```

</details>

<details>
<summary><code>counter_just_above_floor</code> — Offer above internal floor in late round is accepted or fairly countered (PASS)</summary>

### request

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/loads/evaluate-offer` -> HTTP 200 (812 ms)

**Request**

```json
{
  "load_id": "ACM-1001",
  "carrier_offer": 1960,
  "round_number": 2
}
```

**Response**

```json
{
  "decision": "accept",
  "broker_counter": 0.0,
  "rationale": "Offer above floor in late round \u2014 accept.",
  "floor_rate": 1950.0
}
```

</details>

<details>
<summary><code>counter_just_below_floor</code> — Offer below floor must not be accepted at round 1 (PASS)</summary>

### request

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/loads/evaluate-offer` -> HTTP 200 (826 ms)

**Request**

```json
{
  "load_id": "ACM-1001",
  "carrier_offer": 1470,
  "round_number": 1
}
```

**Response**

```json
{
  "decision": "counter",
  "broker_counter": 2040.0,
  "rationale": "Counter between carrier offer and posted rate.",
  "floor_rate": 1950.0
}
```

</details>

<details>
<summary><code>fmcsa_invalid_mc</code> — Invalid MC returns ineligible without crashing (PASS)</summary>

### request

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/fmcsa/verify` -> HTTP 200 (1268 ms)

**Request**

```json
{
  "mc_number": "99999999"
}
```

**Response**

```json
{
  "eligible": false,
  "mc_number": "99999999",
  "carrier_name": "",
  "dot_number": "",
  "reason": "FMCSA unavailable",
  "allowed_to_operate": "",
  "operating_status": ""
}
```

</details>

<details>
<summary><code>fmcsa_dirty_mc_format</code> — MC format variants normalize to the same demo carrier (PASS)</summary>

### request 1

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/fmcsa/verify` -> HTTP 200 (833 ms)

**Request**

```json
{
  "mc_number": "MC-123456"
}
```

**Response**

```json
{
  "eligible": true,
  "mc_number": "123456",
  "carrier_name": "Acme Trucking LLC",
  "dot_number": "1234567",
  "reason": "Active, authorized (demo carrier \u2014 FMCSA API unavailable).",
  "allowed_to_operate": "Y",
  "operating_status": "A"
}
```

### request 2

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/fmcsa/verify` -> HTTP 200 (850 ms)

**Request**

```json
{
  "mc_number": "mc 123456"
}
```

**Response**

```json
{
  "eligible": true,
  "mc_number": "123456",
  "carrier_name": "Acme Trucking LLC",
  "dot_number": "1234567",
  "reason": "Active, authorized (demo carrier \u2014 FMCSA API unavailable).",
  "allowed_to_operate": "Y",
  "operating_status": "A"
}
```

### request 3

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/fmcsa/verify` -> HTTP 200 (867 ms)

**Request**

```json
{
  "mc_number": "123456"
}
```

**Response**

```json
{
  "eligible": true,
  "mc_number": "123456",
  "carrier_name": "Acme Trucking LLC",
  "dot_number": "1234567",
  "reason": "Active, authorized (demo carrier \u2014 FMCSA API unavailable).",
  "allowed_to_operate": "Y",
  "operating_status": "A"
}
```

</details>

<details>
<summary><code>equipment_typo_tolerance</code> — Equipment typos still return loads for Dallas → Atlanta (PASS)</summary>

### request 1

- **GET** `https://acme-carrier-api-hugog.fly.dev/api/loads/search` -> HTTP 200 (842 ms)

**Request**

```json
{
  "origin": "Dallas",
  "destination": "Atlanta",
  "equipment_type": "drive van",
  "limit": 5
}
```

**Response**

```json
[
  {
    "load_id": "ACM-1001",
    "origin": "Dallas, TX",
    "destination": "Atlanta, GA",
    "pickup_datetime": "2026-06-09T08:00:00",
    "delivery_datetime": "2026-06-10T18:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 2100.0,
    "notes": "No-touch freight. Driver-assist unload available at destination.",
    "weight": 38000.0,
    "commodity_type": "Packaged consumer goods",
    "num_of_pieces": 24,
    "miles": 780.0,
    "dimensions": "48ft trailer, palletized"
  },
  {
    "load_id": "ACM-1005",
    "origin": "Miami, FL",
    "destination": "Charlotte, NC",
    "pickup_datetime": "2026-06-08T11:00:00",
    "delivery_datetime": "2026-06-09T18:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 1380.0,
    "notes": "FCFS pickup 8a-4p. Live unload at destination.",
    "weight": 28000.0,
    "commodity_type": "Electronics",
    "num_of_pieces": 40,
    "miles": 720.0,
    "dimensions": "53ft trailer"
  },
  {
    "load_id": "ACM-1003",
    "origin": "Chicago, IL",
    "destination": "Newark, NJ",
    "pickup_datetime": "2026-06-09T14:00:00",
    "delivery_datetime": "2026-06-11T10:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 2350.0,
    "notes": "Drop-and-hook at both ends. Trailer pool available.",
    "weight": 36500.0,
    "commodity_type": "Auto parts",
    "num_of_pieces": 18,
    "miles": 800.0,
    "dimensions": "53ft trailer"
  },
  {
    "load_id": "ACM-1007",
    "origin": "Atlanta, GA",
    "destination": "Dallas, TX",
    "pickup_datetime": "2026-06-11T10:00:00",
    "delivery_datetime": "2026-06-12T22:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 1980.0,
    "notes": "Backhaul opportunity. Drop trailer at destination.",
    "weight": 35000.0,
    "commodity_type": "Beverages",
    "num_of_pieces": 26,
    "miles": 780.0,
    "dimensions": "53ft trailer"
  }
]
```

### request 2

- **GET** `https://acme-carrier-api-hugog.fly.dev/api/loads/search` -> HTTP 200 (846 ms)

**Request**

```json
{
  "origin": "Dallas",
  "destination": "Atlanta",
  "equipment_type": "dry-van",
  "limit": 5
}
```

**Response**

```json
[
  {
    "load_id": "ACM-1001",
    "origin": "Dallas, TX",
    "destination": "Atlanta, GA",
    "pickup_datetime": "2026-06-09T08:00:00",
    "delivery_datetime": "2026-06-10T18:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 2100.0,
    "notes": "No-touch freight. Driver-assist unload available at destination.",
    "weight": 38000.0,
    "commodity_type": "Packaged consumer goods",
    "num_of_pieces": 24,
    "miles": 780.0,
    "dimensions": "48ft trailer, palletized"
  },
  {
    "load_id": "ACM-1005",
    "origin": "Miami, FL",
    "destination": "Charlotte, NC",
    "pickup_datetime": "2026-06-08T11:00:00",
    "delivery_datetime": "2026-06-09T18:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 1380.0,
    "notes": "FCFS pickup 8a-4p. Live unload at destination.",
    "weight": 28000.0,
    "commodity_type": "Electronics",
    "num_of_pieces": 40,
    "miles": 720.0,
    "dimensions": "53ft trailer"
  },
  {
    "load_id": "ACM-1003",
    "origin": "Chicago, IL",
    "destination": "Newark, NJ",
    "pickup_datetime": "2026-06-09T14:00:00",
    "delivery_datetime": "2026-06-11T10:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 2350.0,
    "notes": "Drop-and-hook at both ends. Trailer pool available.",
    "weight": 36500.0,
    "commodity_type": "Auto parts",
    "num_of_pieces": 18,
    "miles": 800.0,
    "dimensions": "53ft trailer"
  },
  {
    "load_id": "ACM-1007",
    "origin": "Atlanta, GA",
    "destination": "Dallas, TX",
    "pickup_datetime": "2026-06-11T10:00:00",
    "delivery_datetime": "2026-06-12T22:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 1980.0,
    "notes": "Backhaul opportunity. Drop trailer at destination.",
    "weight": 35000.0,
    "commodity_type": "Beverages",
    "num_of_pieces": 26,
    "miles": 780.0,
    "dimensions": "53ft trailer"
  }
]
```

### request 3

- **GET** `https://acme-carrier-api-hugog.fly.dev/api/loads/search` -> HTTP 200 (822 ms)

**Request**

```json
{
  "origin": "Dallas",
  "destination": "Atlanta",
  "equipment_type": "DRY VAN",
  "limit": 5
}
```

**Response**

```json
[
  {
    "load_id": "ACM-1001",
    "origin": "Dallas, TX",
    "destination": "Atlanta, GA",
    "pickup_datetime": "2026-06-09T08:00:00",
    "delivery_datetime": "2026-06-10T18:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 2100.0,
    "notes": "No-touch freight. Driver-assist unload available at destination.",
    "weight": 38000.0,
    "commodity_type": "Packaged consumer goods",
    "num_of_pieces": 24,
    "miles": 780.0,
    "dimensions": "48ft trailer, palletized"
  },
  {
    "load_id": "ACM-1005",
    "origin": "Miami, FL",
    "destination": "Charlotte, NC",
    "pickup_datetime": "2026-06-08T11:00:00",
    "delivery_datetime": "2026-06-09T18:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 1380.0,
    "notes": "FCFS pickup 8a-4p. Live unload at destination.",
    "weight": 28000.0,
    "commodity_type": "Electronics",
    "num_of_pieces": 40,
    "miles": 720.0,
    "dimensions": "53ft trailer"
  },
  {
    "load_id": "ACM-1003",
    "origin": "Chicago, IL",
    "destination": "Newark, NJ",
    "pickup_datetime": "2026-06-09T14:00:00",
    "delivery_datetime": "2026-06-11T10:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 2350.0,
    "notes": "Drop-and-hook at both ends. Trailer pool available.",
    "weight": 36500.0,
    "commodity_type": "Auto parts",
    "num_of_pieces": 18,
    "miles": 800.0,
    "dimensions": "53ft trailer"
  },
  {
    "load_id": "ACM-1007",
    "origin": "Atlanta, GA",
    "destination": "Dallas, TX",
    "pickup_datetime": "2026-06-11T10:00:00",
    "delivery_datetime": "2026-06-12T22:00:00",
    "equipment_type": "Dry Van",
    "loadboard_rate": 1980.0,
    "notes": "Backhaul opportunity. Drop trailer at destination.",
    "weight": 35000.0,
    "commodity_type": "Beverages",
    "num_of_pieces": 26,
    "miles": 780.0,
    "dimensions": "53ft trailer"
  }
]
```

</details>

<details>
<summary><code>lane_no_inventory</code> — Empty lane returns 200 with no rows (PASS)</summary>

### request

- **GET** `https://acme-carrier-api-hugog.fly.dev/api/loads/search` -> HTTP 200 (801 ms)

**Request**

```json
{
  "origin": "Fairbanks",
  "destination": "Nome",
  "equipment_type": "Tanker",
  "limit": 5
}
```

**Response**

```json
[]
```

</details>

<details>
<summary><code>webhook_idempotency</code> — Duplicate webhook run_id upserts a single call row (PASS)</summary>

### webhook post 1

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/webhooks/call-completed` -> HTTP 200 (888 ms)

**Request**

```json
{
  "run_id": "eval-idempotency-956655683b65",
  "mc_number": "123456",
  "carrier_name": "Eval Harness Carrier",
  "carrier_eligible": true,
  "load_id": "ACM-1001",
  "loadboard_rate": 2100,
  "agreed_rate": 2000,
  "origin": "Dallas, TX",
  "destination": "Atlanta, GA",
  "equipment_type": "Dry Van",
  "outcome": "load_booked",
  "sentiment": "positive",
  "transcript": "Eval harness idempotency test."
}
```

**Response**

```json
{
  "id": 38,
  "stored": true,
  "updated": false,
  "test": false
}
```

### webhook post 2

- **POST** `https://acme-carrier-api-hugog.fly.dev/api/webhooks/call-completed` -> HTTP 200 (817 ms)

**Request**

```json
{
  "run_id": "eval-idempotency-956655683b65",
  "mc_number": "123456",
  "carrier_name": "Eval Harness Carrier",
  "carrier_eligible": true,
  "load_id": "ACM-1001",
  "loadboard_rate": 2100,
  "agreed_rate": 2000,
  "origin": "Dallas, TX",
  "destination": "Atlanta, GA",
  "equipment_type": "Dry Van",
  "outcome": "load_booked",
  "sentiment": "positive",
  "transcript": "Eval harness idempotency test."
}
```

**Response**

```json
{
  "id": 38,
  "stored": true,
  "updated": true,
  "test": false
}
```

### verify call detail

- **GET** `https://acme-carrier-api-hugog.fly.dev/api/metrics/calls/38` -> HTTP 200 (846 ms)

**Request**

```json
{
  "call_id": 38
}
```

**Response**

```json
{
  "id": 38,
  "run_id": "eval-idempotency-956655683b65",
  "created_at": "2026-06-14T02:25:02.181598Z",
  "mc_number": "123456",
  "carrier_name": "Eval Harness Carrier",
  "carrier_eligible": true,
  "load_id": "ACM-1001",
  "origin": "Dallas, TX",
  "destination": "Atlanta, GA",
  "equipment_type": "Dry Van",
  "loadboard_rate": 2100.0,
  "agreed_rate": 2000.0,
  "num_counter_offers": 2,
  "counter_offers": [],
  "outcome": "load_booked",
  "sentiment": "positive",
  "duration_seconds": 0.0,
  "broker_margin": 100.0,
  "transfer_status": "pending",
  "transcript": "Eval harness idempotency test.",
  "classification_reasoning": "",
  "raw_payload": {
    "run_id": "eval-idempotency-956655683b65",
    "mc_number": "123456",
    "carrier_name": "Eval Harness Carrier",
    "carrier_eligible": true,
    "load_id": "ACM-1001",
    "loadboard_rate": 2100,
    "agreed_rate": 2000,
    "origin": "Dallas, TX",
    "destination": "Atlanta, GA",
    "equipment_type": "Dry Van",
    "outcome": "load_booked",
    "sentiment": "positive",
    "transcript": "Eval harness idempotency test."
  },
  "pickup_datetime": "2026-06-09T08:00:00",
  "delivery_datetime": "2026-06-10T18:00:00",
  "weight": 38000.0,
  "commodity_type": "Packaged consumer goods",
  "miles": 780.0
}
```

</details>
