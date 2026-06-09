# HappyRobot Workflow — step-by-step setup

This is what you build inside the HappyRobot platform editor. The backend code in this repo
serves the webhooks the workflow calls; the workflow itself lives on platform.happyrobot.ai.

Replace `BACKEND_URL` everywhere with your deployed API URL (e.g. `https://api.acme-demo.fly.dev`)
and `API_KEY` with the value of `API_KEY` from `backend/.env`. Set the same `BACKEND_URL` and
`API_KEY` in the frontend `.env` so the dashboard and web-call UI can also reach it.

---

## 1. Trigger — Web Call

- Add a **Web Call** trigger node (do **not** add a phone number — the challenge requires web call).
- No parameters needed on the trigger for this use case.

## 2. Action — Inbound Voice Agent

Add an **Inbound Voice Agent** node, link its Call field to the Web Call trigger.

Configure:

| Field | Value |
|---|---|
| **Languages** | English (en-US) only for demos. Add es-MX only if you update the prompt for bilingual (see `voice-agent-prompt.md`). |
| **Voice** | Pick a confident, conversational voice. ElevenLabs "Adam" or Cartesia "Newsman" are good defaults. |
| **Initial message** | *(empty — we set it on the prompt node instead so we get the receiving variant)* |
| **Receiving initial message** | `Acme Logistics carrier desk, this is Alex — thanks for calling in. Who do I have on the line?` |
| **No initial message** | OFF |
| **Background noise** | Call center |
| **Voice speed** | 1.00 |
| **Max call duration** | 600 |
| **Record** | ON. Disclaimer **Robotic** unless you're targeting a 2-party state. |

### Transcription tab

- **Transcription context**:
  > Callers are freight carriers requesting loads. Expect US city and state names, MC numbers (e.g. MC-123456), DOT numbers, freight equipment types (Dry Van, Reefer, Flatbed), and dollar amounts that may be spoken as "twenty-one hundred", "two thousand bucks", etc.
- **Key terms** (add these):
  `MC number`, `DOT number`, `MC-`, `Dry Van`, `Reefer`, `Flatbed`, `loadboard`, `lumper`, `deadhead`, `BOL`, `Acme Logistics`, plus the names of your seeded loads' origin / destination cities.
- **Numerals**: ON
- **End-of-turn detection**: English

### Real-time Analysis tab

- **Sentiment Classifier**: enabled (built-in 3-class: positive / neutral / negative).
- **Custom Classifier** "Call outcome":
  - Name: `outcome`
  - Prompt: `Classify the outcome of this carrier sales call. Choose the single best label.`
  - Classes:
    - `load_booked` — A specific price was agreed and the call moved to transfer.
    - `price_rejected` — Carrier and broker negotiated but could not agree on a price.
    - `no_interest` — Carrier did not want any load Alex offered.
    - `carrier_ineligible` — FMCSA verification failed.
    - `transferred` — Call was transferred mid-flow for any other reason.
    - `other` — Anything else (e.g. caller hung up early).

## 3. Prompt node (inside the voice agent)

Paste the contents of `docs/voice-agent-prompt.md` into the **Prompt** field.

| Field | Value |
|---|---|
| **Model** | `gpt-4.1` (or `gpt-5` if your org has it; `gpt-4.1-mini` is OK for cost-tuning later). |
| **Initial message** | *(leave empty — we use the receiving variant on the agent node above)* |

## 4. Tool nodes (children of the prompt node)

Add each of these as a **Tool** child of the prompt node.

### Tool 1 — `verify_carrier`

- **Description**: "Use this tool as soon as the caller gives you an MC number. It verifies the carrier is authorized to operate with FMCSA and returns their legal name."
- **Message**: AI generated (let the agent say "let me pull up your authority").
- **Hold music**: any short office ambience.
- **Parameters**:
  - `mc_number` (string) — "The MC number the caller said. Pass the raw digits the caller spoke; the server will normalize."
- **Child node**: **Webhook**
  - URL: `{BACKEND_URL}/api/fmcsa/verify`
  - Method: `POST`
  - Headers: `{ "X-API-Key": "API_KEY", "Content-Type": "application/json" }`
  - Body (JSON): `{ "mc_number": "@mc_number" }`

### Tool 2 — `search_loads`

- **Description**: "Search our load board for loads matching the caller's lane and equipment. Call this once you have origin, destination, and/or equipment type."
- **Message**: AI generated.
- **Hold music**: enabled.
- **Parameters**:
  - `origin` (string, optional) — "Origin **city only** (e.g. `Dallas`, not `Dallas, Texas`). Pass empty if not provided."
  - `destination` (string, optional) — "Destination **city only** (e.g. `Atlanta`). Empty if not provided."
  - `equipment_type` (string, optional) — "Exactly one of: `Dry Van`, `Reefer`, `Flatbed`. Empty if not provided."
- **Child node**: **Webhook**
  - URL: `{BACKEND_URL}/api/loads/search?origin=@origin&destination=@destination&equipment_type=@equipment_type&limit=3`
  - Method: `GET`
  - Headers: `{ "X-API-Key": "API_KEY" }`

### Tool 3 — `evaluate_offer`

- **Description**: "Call this every time the carrier proposes a price. It computes the broker's decision (accept / counter / reject) and the counter-price."
- **Message**: AI generated (a short "let me check that for you" is fine).
- **Hold music**: brief or none.
- **Parameters**:
  - `load_id` (string)
  - `carrier_offer` (number)
  - `round_number` (number) — "1, 2, or 3 — the current negotiation round."
  - `last_broker_offer` (number, optional) — "The broker's previous counter, if any."
- **Child node**: **Webhook**
  - URL: `{BACKEND_URL}/api/loads/evaluate-offer`
  - Method: `POST`
  - Headers: `{ "X-API-Key": "API_KEY", "Content-Type": "application/json" }`
  - Body: `{ "load_id": "@load_id", "carrier_offer": @carrier_offer, "round_number": @round_number, "last_broker_offer": @last_broker_offer }`

### Tool 4 — `transfer_to_sales_rep`

- **Description**: "Call only after a price is agreed. Hands the carrier off to a human sales rep to finalize the BOL."
- **Message**: **Fixed message** — `Transfer was successful — please wrap up the conversation now.`
- **Parameters**:
  - `agreed_rate` (number)
  - `load_id` (string)
- **Child node**: *(optional)* **Transfer Popup** node so the receiving rep gets context:
  - Phone number: `@from_phone` *(or a placeholder for web calls)*
  - Summary: `Carrier @carrier_name agreed at $@agreed_rate on load @load_id.`
  - Transcript: `@transcript`
  - Data:
    - Carrier — `@carrier_name`
    - MC — `@mc_number`
    - Load — `@load_id`
    - Agreed rate — `@agreed_rate`
  - TTL: 30 days

  *(In a real phone-trunked deployment you would chain a Direct Transfer node here. For the web-call demo the Fixed Message above is the entire "transfer".)*

## 5. Post-call nodes (children of the voice agent, not the prompt)

These run after the call ends.

### AI Extract — "extract call data"

- Input: `@transcript`
- Mode: Parameters
- Parameters:
  - `mc_number` (string) — "MC number the carrier provided."
  - `carrier_name` (string) — "Legal name of the carrier from verification."
  - `carrier_eligible` (boolean) — "True if FMCSA verification passed."
  - `load_id` (string) — "Load they booked or last discussed."
  - `loadboard_rate` (number) — "The **posted/broker rate** the agent quoted (higher number). NOT the final agreed price."
  - `agreed_rate` (number) — "The **final agreed rate** the carrier accepted. Must be ≤ loadboard_rate. 0 if no deal."
  - `counter_offers` (array of numbers) — "All numeric offers exchanged in order: carrier's first, broker's counter, carrier's next, etc."
  - `origin` (string)
  - `destination` (string)
  - `equipment_type` (string)
  - `duration_seconds` (number) — "Leave 0; platform duration is sent separately."

### AI Classify — "classify outcome"

(You may already have this as a real-time custom classifier; this is the post-call backup.)
- Input: `@transcript`
- Tags: `load_booked`, `price_rejected`, `no_interest`, `carrier_ineligible`, `transferred`, `other`

### Webhook — "send to dashboard"

- URL: `{BACKEND_URL}/api/webhooks/call-completed`
- Method: `POST`
- Headers: `{ "X-API-Key": "API_KEY", "Content-Type": "application/json" }`
- Body:
  ```json
  {
    "run_id": "@run_id",
    "mc_number": "@extract.mc_number",
    "carrier_name": "@extract.carrier_name",
    "carrier_eligible": @extract.carrier_eligible,
    "load_id": "@extract.load_id",
    "loadboard_rate": @extract.loadboard_rate,
    "agreed_rate": @extract.agreed_rate,
    "counter_offers": @extract.counter_offers,
    "origin": "@extract.origin",
    "destination": "@extract.destination",
    "equipment_type": "@extract.equipment_type",
    "outcome": "@classify.outcome",
    "sentiment": "@sentiment_classifier.result",
    "classification_reasoning": "@classify.reasoning",
    "duration_seconds": 0,
    "call_duration_seconds": @duration,
    "transcript": "@transcript"
  }
  ```

  > **Important:** `@duration` is the platform call length in seconds (from the voice agent run).
  > The dashboard uses `call_duration_seconds` for **Avg call (sec)**. Keep `duration_seconds` at 0
  > unless you prefer AI Extract to estimate it.
  > **Frontend `.env`** must set `VITE_API_BASE_URL` to the same `{BACKEND_URL}` so the dashboard
  > reads the same database the webhooks write to.

## 6. Publish

Hit **Publish** in the workflow editor. The Web Call endpoint becomes live, and your token
server can mint LiveKit tokens against this workflow's ID.

## 7. Smoke-test it

1. Open the web-call page in this repo (`/call`).
2. Click **Start Call**, allow microphone.
3. Try this script:
   - "Hi, MC one-two-three-four-five-six."
   - "I'm looking out of Dallas, going to Atlanta."
   - "Dry van."
   - "I can do nineteen hundred." *(should counter)*
   - "How about twenty grand even?" *(should accept or final-counter)*
4. Open the Dashboard. The call should appear within ~5 seconds of hang-up.
