import type {
  CallRecord, MissedOpportunity,
  OutcomeCount, RoundCount, SentimentCount, Summary,
} from "./types";
import { brokerMargin, computeNegotiationSavingsPct } from "./format";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(14 + (n % 5), 10 + n, 0, 0);
  return d.toISOString();
};

export const DEMO_MISSED_OPPORTUNITIES: MissedOpportunity[] = [
  {
    origin: "Dallas, TX", destination: "Miami, FL", equipment: "Dry Van",
    requests: 3, last_requested: daysAgo(2), sample_carrier: "Sunbelt Carriers",
  },
  {
    origin: "Chicago, IL", destination: "Houston, TX", equipment: "Reefer",
    requests: 2, last_requested: daysAgo(4), sample_carrier: "ColdChain Express",
  },
  {
    origin: "Denver, CO", destination: "Los Angeles, CA", equipment: "Flatbed",
    requests: 2, last_requested: daysAgo(6), sample_carrier: "Rocky Mtn Haul",
  },
  {
    origin: "Atlanta, GA", destination: "Boston, MA", equipment: "Dry Van",
    requests: 1, last_requested: daysAgo(8), sample_carrier: "East Coast Freight",
  },
];

/** Demo dataset — fills charts when API data is sparse. IDs are negative. */
export const DEMO_CALLS: CallRecord[] = [
  {
    id: -1,
    created_at: daysAgo(1),
    mc_number: "123456",
    carrier_name: "Acme Trucking LLC",
    carrier_eligible: true,
    load_id: "ACM-1001",
    origin: "Dallas, TX",
    destination: "Atlanta, GA",
    equipment_type: "Dry Van",
    loadboard_rate: 2100,
    agreed_rate: 2000,
    miles: 780,
    num_counter_offers: 2,
    counter_offers: [1900, 2075, 2000],
    last_carrier_offer: 2000,
    outcome: "load_booked",
    sentiment: "positive",
    duration_seconds: 165,
    broker_margin: 100,
    transfer_status: "successful",
    classification_reasoning:
      "Carrier accepted a counter-offer below posted rate after two negotiation rounds. FMCSA verified. Transfer completed.",
    transcript: [
      "Agent: Acme Logistics carrier desk, this is Alex.",
      "Carrier: Hi, Mike from Acme Trucking, MC 123456.",
      "Agent: Verified — you're active. What lane are you looking for?",
      "Carrier: Dallas to Atlanta, dry van.",
      "Agent: I've got ACM-1001 at $2,100 posted.",
      "Carrier: I can do nineteen hundred.",
      "Agent: Best I can do is $2,075.",
      "Carrier: What about two thousand even?",
      "Agent: $2,000 works. Transferring you now.",
    ].join("\n"),
    isDemo: true,
  },
  {
    id: -2,
    created_at: daysAgo(3),
    mc_number: "789012",
    carrier_name: "Swift Haul Inc",
    carrier_eligible: true,
    load_id: "ACM-1002",
    origin: "Los Angeles, CA",
    destination: "Phoenix, AZ",
    equipment_type: "Reefer",
    loadboard_rate: 1450,
    agreed_rate: 1380,
    miles: 370,
    num_counter_offers: 1,
    counter_offers: [1350, 1380],
    last_carrier_offer: 1350,
    outcome: "load_booked",
    sentiment: "positive",
    duration_seconds: 142,
    broker_margin: 70,
    transfer_status: "successful",
    classification_reasoning: "Single-round negotiation. Carrier accepted broker counter quickly.",
    transcript: "Agent: Looking for reefer out of LA?\nCarrier: Phoenix works.\nAgent: $1,450 posted.\nCarrier: Fourteen.\nAgent: $1,380 — deal.",
    isDemo: true,
  },
  {
    id: -3,
    created_at: daysAgo(5),
    mc_number: "445566",
    carrier_name: "Midwest Freight Co",
    carrier_eligible: true,
    load_id: "ACM-1003",
    origin: "Chicago, IL",
    destination: "Newark, NJ",
    equipment_type: "Dry Van",
    loadboard_rate: 2350,
    agreed_rate: 0,
    miles: 800,
    num_counter_offers: 3,
    counter_offers: [1800, 2100, 1950],
    last_carrier_offer: 1950,
    outcome: "price_rejected",
    sentiment: "negative",
    duration_seconds: 198,
    broker_margin: 0,
    transfer_status: "n/a",
    classification_reasoning:
      "After three rounds the carrier's final offer remained below floor. Call ended without agreement.",
    transcript: "Agent: Chicago to Newark dry van at $2,350.\nCarrier: Twelve hundred.\nAgent: Can't get there — best $2,200.\nCarrier: Fifteen max.\nAgent: Appreciate the call, can't align on this one.",
    isDemo: true,
  },
  {
    id: -4,
    created_at: daysAgo(7),
    mc_number: "998877",
    carrier_name: "Unknown Carrier",
    carrier_eligible: false,
    load_id: "",
    origin: "Houston, TX",
    destination: "Denver, CO",
    equipment_type: "Flatbed",
    loadboard_rate: 0,
    agreed_rate: 0,
    num_counter_offers: 0,
    outcome: "carrier_ineligible",
    sentiment: "neutral",
    duration_seconds: 45,
    broker_margin: 0,
    transfer_status: "n/a",
    classification_reasoning: "FMCSA returned inactive authority. Call terminated before load search.",
    transcript: "Agent: MC number?\nCarrier: 998877.\nAgent: Showing inactive — can't book today.",
    isDemo: true,
  },
  {
    id: -5,
    created_at: daysAgo(10),
    mc_number: "334455",
    carrier_name: "Gulf Coast Lines",
    carrier_eligible: true,
    load_id: "ACM-1005",
    origin: "Miami, FL",
    destination: "Charlotte, NC",
    equipment_type: "Dry Van",
    loadboard_rate: 1380,
    agreed_rate: 0,
    miles: 650,
    num_counter_offers: 1,
    counter_offers: [1500],
    last_carrier_offer: 1500,
    outcome: "no_interest",
    sentiment: "neutral",
    duration_seconds: 88,
    broker_margin: 0,
    transfer_status: "n/a",
    classification_reasoning: "Carrier declined lane due to appointment timing at destination.",
    transcript: "Agent: Miami to Charlotte, $1,380.\nCarrier: Delivery window won't work — pass for now.",
    isDemo: true,
  },
  {
    id: -6,
    created_at: daysAgo(14),
    mc_number: "112233",
    carrier_name: "Pacific Rim Transport",
    carrier_eligible: true,
    load_id: "ACM-1004",
    origin: "Seattle, WA",
    destination: "Portland, OR",
    equipment_type: "Dry Van",
    loadboard_rate: 980,
    agreed_rate: 950,
    miles: 175,
    num_counter_offers: 1,
    counter_offers: [920, 950],
    last_carrier_offer: 920,
    outcome: "load_booked",
    sentiment: "positive",
    duration_seconds: 120,
    broker_margin: 30,
    transfer_status: "successful",
    classification_reasoning: "Short-haul booked at minor discount from posted.",
    transcript: "Agent: Seattle-Portland at $980.\nCarrier: Nine fifty?\nAgent: Done.",
    isDemo: true,
  },
  {
    id: -7,
    created_at: daysAgo(2),
    mc_number: "556677",
    carrier_name: "Sunbelt Carriers",
    carrier_eligible: true,
    load_id: "",
    origin: "Dallas, TX",
    destination: "Miami, FL",
    equipment_type: "Dry Van",
    loadboard_rate: 0,
    agreed_rate: 0,
    num_counter_offers: 0,
    outcome: "no_interest",
    sentiment: "neutral",
    duration_seconds: 62,
    broker_margin: 0,
    transfer_status: "n/a",
    classification_reasoning: "No inventory on Dallas→Miami dry van. Carrier logged as missed demand.",
    transcript: "Agent: Dallas to Miami dry van?\nCarrier: Yes, what's the rate?\nAgent: Nothing on the board right now — I'll note the lane.",
    isDemo: true,
  },
  {
    id: -8,
    created_at: daysAgo(6),
    mc_number: "667788",
    carrier_name: "Flatbed Kings LLC",
    carrier_eligible: true,
    load_id: "ACM-1006",
    origin: "Houston, TX",
    destination: "Denver, CO",
    equipment_type: "Flatbed",
    loadboard_rate: 2650,
    agreed_rate: 2520,
    miles: 920,
    num_counter_offers: 2,
    counter_offers: [2400, 2580, 2520],
    last_carrier_offer: 2520,
    outcome: "load_booked",
    sentiment: "positive",
    duration_seconds: 175,
    broker_margin: 130,
    transfer_status: "successful",
    classification_reasoning: "Flatbed booked after two rounds. Tarps required — carrier confirmed.",
    transcript: "Agent: Houston to Denver flatbed, $2,650 posted with tarps.\nCarrier: Twenty-four.\nAgent: $2,580 counter.\nCarrier: $2,520 works.\nAgent: Booked — transferring.",
    isDemo: true,
  },
];

export function mergeWithDemoCalls(apiCalls: CallRecord[]): CallRecord[] {
  return resolveDashboardCalls(apiCalls).chartCalls;
}

/** Live API rows only — never mixed with demo when the API is unreachable. */
export function resolveDashboardCalls(
  apiCalls: CallRecord[],
  opts?: { allowDemo?: boolean },
) {
  const sortDesc = (rows: CallRecord[]) =>
    [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const allowDemo = opts?.allowDemo ?? true;
  const liveCalls = sortDesc(apiCalls);
  const isDemoMode = liveCalls.length === 0 && allowDemo;
  const chartCalls = isDemoMode ? sortDesc(DEMO_CALLS) : liveCalls;

  return { liveCalls, chartCalls, isDemoMode };
}

export function aggregateOutcomes(calls: CallRecord[]): OutcomeCount[] {
  const map = new Map<string, number>();
  calls.forEach((c) => map.set(c.outcome, (map.get(c.outcome) ?? 0) + 1));
  return Array.from(map, ([outcome, count]) => ({ outcome, count }));
}

export function aggregateSentiments(calls: CallRecord[]): SentimentCount[] {
  const map = new Map<string, number>();
  calls.forEach((c) => map.set(c.sentiment, (map.get(c.sentiment) ?? 0) + 1));
  return Array.from(map, ([sentiment, count]) => ({ sentiment, count }));
}

export function aggregateRounds(calls: CallRecord[]): RoundCount[] {
  const map = new Map<number, number>();
  calls.forEach((c) => map.set(c.num_counter_offers, (map.get(c.num_counter_offers) ?? 0) + 1));
  return Array.from(map, ([rounds, count]) => ({ rounds, count })).sort((a, b) => a.rounds - b.rounds);
}

export function computeTotalBrokerMargin(calls: CallRecord[]): number {
  return calls
    .filter((c) => c.outcome === "load_booked")
    .reduce((sum, c) => sum + brokerMargin(c.loadboard_rate, c.agreed_rate), 0);
}

export function enrichSummary(api: Summary | null, calls: CallRecord[], isDemoMode = false): Summary | null {
  if (!api) return null;

  const recomputeFromCalls = (rows: CallRecord[]): Summary => {
    const booked = rows.filter((c) => c.outcome === "load_booked");
    const withRates = rows.filter((c) => c.agreed_rate > 0 && c.loadboard_rate > 0);
    const avgAgreed = withRates.length
      ? withRates.reduce((s, c) => s + c.agreed_rate, 0) / withRates.length
      : 0;
    const avgPosted = withRates.length
      ? withRates.reduce((s, c) => s + c.loadboard_rate, 0) / withRates.length
      : 0;
    const negotiationSavings = computeNegotiationSavingsPct(rows);
    const ineligible = rows.filter((c) => c.outcome === "carrier_ineligible").length;
    const avgRounds = rows.length
      ? rows.reduce((s, c) => s + c.num_counter_offers, 0) / rows.length
      : 0;
    const avgDuration = rows.length
      ? rows.reduce((s, c) => s + c.duration_seconds, 0) / rows.length
      : 0;

    return {
      ...api,
      total_broker_margin: computeTotalBrokerMargin(rows),
      total_calls: rows.length,
      booked_loads: booked.length,
      booking_rate: rows.length ? Math.round((booked.length / rows.length) * 1000) / 10 : 0,
      avg_agreed_rate: Math.round(avgAgreed),
      avg_loadboard_rate: Math.round(avgPosted),
      rate_delta_pct: negotiationSavings ?? api.rate_delta_pct,
      avg_negotiation_rounds: Math.round(avgRounds * 100) / 100,
      avg_call_seconds: Math.round(avgDuration * 10) / 10,
      fmcsa_rejection_rate: rows.length
        ? Math.round((ineligible / rows.length) * 1000) / 10
        : 0,
    };
  };

  if (isDemoMode) return recomputeFromCalls(calls);
  if (calls.length > 0) return recomputeFromCalls(calls);
  return api;
}
