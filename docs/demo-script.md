# 5-min demo video — script

Recording target: ~5 minutes. Tools: Loom or QuickTime + browser tab + a terminal tab.

---

## 0:00 – 0:25 — Frame the problem

> "I'm walking through the proof-of-concept for Acme Logistics' inbound carrier sales line. The customer asked for an AI voice agent that vets the carrier with FMCSA, finds them a load, negotiates a price up to three rounds, and hands off to a human when there's a deal — plus a custom dashboard so ops can see what's happening."

Show the cover image of the build doc on screen.

## 0:25 – 1:10 — Workflow on the platform

Switch to the HappyRobot workflow editor.

> "Here's the workflow on the platform. Web Call trigger because we're using the SDK, not a phone number. The voice agent node feeds the call into a prompt with four tool children — verify_carrier, search_loads, evaluate_offer, transfer_to_sales_rep. Each tool is a webhook to my backend. Below the agent, AI Extract pulls structured fields off the transcript, AI Classify tags the outcome, and a final webhook sends everything to the dashboard."

Hover over each node briefly. Click on `evaluate_offer` to show the parameters.

## 1:10 – 3:00 — Live demo of a happy-path call

Switch to the deployed frontend, `/call` page. Click Start Call.

Talk through this script, naturally, **with the recording showing the agent's responses**:

- "Hi, MC one two three four five six." → expect FMCSA call, agent uses the legal name
- "I'm looking out of Dallas headed to Atlanta. Dry van." → expect search_loads → pitch
- *Listen to the pitch — load ID, miles, posted rate.*
- "I can do nineteen hundred." → expect a counter
- "What about two grand?" → expect either accept or final counter
- *If accepted:* listen for the transfer line. Hang up.

> "Notice three things: the agent confirmed the MC number digit-by-digit before calling FMCSA, the negotiation went to a backend endpoint — the LLM didn't do that math itself — and the third-round cap kicks in even if I try to keep arguing."

## 3:00 – 3:45 — Show the floor protection / 3-round cap

Start a second call. Try to push past the floor.

- "MC one two three four five six."
- "Dallas to Atlanta, dry van."
- "I can do twelve hundred." → counter
- "How about fourteen?" → counter
- "Fifteen?" → either final counter or polite reject

> "The agent never reveals the floor. It also can't be social-engineered into one — the backend strips that field from every response. And the three-round cap is enforced server-side."

## 3:45 – 4:30 — Dashboard

Open `/dashboard`.

> "On the operator side, every call lands here within a few seconds of hang-up. The top row is the KPIs ops cares about — booking rate, average agreed vs loadboard rate, average rounds, FMCSA rejection rate. Below: outcomes bar, sentiment pie, rounds distribution, and an agreed-vs-loadboard scatter so you can spot loads that are getting beaten down. The bottom table is per-call detail with the lane, posted rate, agreed rate, and outcome tag."

Click the window selector to switch from 30 days to 24 hours; the charts update.

## 4:30 – 5:00 — Wrap and next steps

> "Everything runs in two Docker containers behind Caddy with Let's Encrypt. API key on every endpoint, FMCSA key never leaves the backend, HappyRobot key never leaves the backend. Loads are seeded from JSON for the POC — real next step is wiring `/api/loads/search` into Acme's TMS. Repo and dashboard links are in the email. Looking forward to the conversation."

Stop recording. Trim dead air at start and end.
