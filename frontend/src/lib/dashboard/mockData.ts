import type { CallRecord, MarginPoint, OutcomeCount, RoundCount, SentimentCount, Summary } from "./types";
import { brokerMargin } from "./format";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(14 + (n % 5), 10 + n, 0, 0);
  return d.toISOString();
};

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
    num_counter_offers: 2,
    counter_offers: [1900, 2075, 2000],
    outcome: "load_booked",
    sentiment: "positive",
    duration_seconds: 165,
    broker_margin: 100,
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
    num_counter_offers: 1,
    outcome: "load_booked",
    sentiment: "positive",
    duration_seconds: 142,
    broker_margin: 70,
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
    num_counter_offers: 3,
    counter_offers: [1800, 2100, 1950],
    outcome: "price_rejected",
    sentiment: "negative",
    duration_seconds: 198,
    broker_margin: 0,
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
    num_counter_offers: 0,
    outcome: "no_interest",
    sentiment: "neutral",
    duration_seconds: 88,
    broker_margin: 0,
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
    num_counter_offers: 1,
    outcome: "load_booked",
    sentiment: "positive",
    duration_seconds: 120,
    broker_margin: 30,
    classification_reasoning: "Short-haul booked at minor discount from posted.",
    transcript: "Agent: Seattle-Portland at $980.\nCarrier: Nine fifty?\nAgent: Done.",
    isDemo: true,
  },
];

export function mergeWithDemoCalls(apiCalls: CallRecord[]): CallRecord[] {
  const apiIds = new Set(apiCalls.map((c) => c.id));
  const missingOutcomes = new Set(["price_rejected", "carrier_ineligible", "no_interest"]);
  apiCalls.forEach((c) => missingOutcomes.delete(c.outcome));

  const demoToAdd = DEMO_CALLS.filter((d) => {
    if (apiIds.has(d.id)) return false;
    if (apiCalls.length >= 6 && missingOutcomes.size === 0) return false;
    if (missingOutcomes.size > 0 && missingOutcomes.has(d.outcome)) return true;
    return apiCalls.length < 4;
  });

  return [...apiCalls, ...demoToAdd].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
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

export function buildMarginSeries(calls: CallRecord[]): MarginPoint[] {
  const booked = calls
    .filter((c) => c.outcome === "load_booked" && c.loadboard_rate > 0 && c.agreed_rate > 0)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let cumulative = 0;
  return booked.map((c) => {
    const margin = brokerMargin(c.loadboard_rate, c.agreed_rate);
    cumulative += margin;
    const d = new Date(c.created_at.endsWith("Z") ? c.created_at : `${c.created_at}Z`);
    return {
      date: c.created_at,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      margin,
      cumulative_margin: cumulative,
      load_id: c.load_id,
    };
  });
}

export function computeTotalBrokerMargin(calls: CallRecord[]): number {
  return calls
    .filter((c) => c.outcome === "load_booked")
    .reduce((sum, c) => sum + brokerMargin(c.loadboard_rate, c.agreed_rate), 0);
}

export function enrichSummary(api: Summary | null, calls: CallRecord[]): Summary | null {
  if (!api) return null;
  const booked = calls.filter((c) => c.outcome === "load_booked").length;
  return {
    ...api,
    total_broker_margin: computeTotalBrokerMargin(calls),
    total_calls: calls.length,
    booked_loads: booked,
    booking_rate: calls.length ? Math.round((booked / calls.length) * 1000) / 10 : 0,
  };
}
