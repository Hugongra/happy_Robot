import type {
  CallRecord, DashboardAnalytics, EquipmentStat, FunnelStep,
  MissedOpportunity, Summary,
} from "./types";
import { brokerMargin, getLastCarrierOffer, resolveMiles } from "./format";
import { DEMO_MISSED_OPPORTUNITIES } from "./mockData";

const HUMAN_AGENT_COST_PER_CALL = 15;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

export function isTestOrIncompleteCall(c: CallRecord): boolean {
  return c.outcome === "platform_run" || !c.mc_number?.trim();
}

export function filterRealCalls(calls: CallRecord[], hideTest: boolean): CallRecord[] {
  if (!hideTest) return calls;
  return calls.filter((c) => !isTestOrIncompleteCall(c));
}

export function countHiddenTestCalls(calls: CallRecord[]): number {
  return calls.filter(isTestOrIncompleteCall).length;
}

const FINAL_PLATFORM_STATUSES = new Set([
  "completed", "complete", "done", "failed", "cancelled", "canceled",
]);

/** Run still active or awaiting post-call webhook / classification. */
export function isCallInProgress(c: CallRecord): boolean {
  if (c.sync_source === "platform") return true;

  const outcome = (c.outcome ?? "").trim().toLowerCase();
  if (!outcome || outcome === "pending") return true;

  const status = (c.platform_status ?? "").trim().toLowerCase();
  if (status && !FINAL_PLATFORM_STATUSES.has(status)) return true;

  return false;
}

export function countInProgressCalls(calls: CallRecord[]): number {
  return calls.filter(isCallInProgress).length;
}

export type PlatformSavings = {
  agentLaborSavings: number;
  marginCaptured: number;
  total: number;
  totalCalls: number;
};

export type PredictedAnnualSavings = {
  predictedAnnual: number;
  daysSinceFirstCall: number;
  totalSavingsToDate: number;
};

export function computePlatformSavings(
  calls: CallRecord[],
  costPerCall = HUMAN_AGENT_COST_PER_CALL,
): PlatformSavings {
  const totalCalls = calls.length;
  const marginCaptured = calls
    .filter((c) => c.outcome === "load_booked")
    .reduce((s, c) => s + brokerMargin(c.loadboard_rate, c.agreed_rate), 0);
  const agentLaborSavings = totalCalls * costPerCall;
  return {
    agentLaborSavings,
    marginCaptured,
    total: agentLaborSavings + marginCaptured,
    totalCalls,
  };
}

export type RoiDefaults = {
  callsPerDay: number;
  bookingRatePct: number;
  costPerCall: number;
  avgMarginPerBooked: number;
};

const DEFAULT_MARGIN_PER_BOOKED = 25;

/** Defaults for the ROI calculator from filtered window data. */
export function computeRoiDefaults(
  calls: CallRecord[],
  summary: Summary | null,
  windowDays: number,
): RoiDefaults {
  const window = Math.max(windowDays, 1);
  const callsPerDay = Math.max(1, Math.ceil(calls.length / window));

  const bookingRatePct = summary?.booking_rate ?? (
    calls.length
      ? Math.round((calls.filter((c) => c.outcome === "load_booked").length / calls.length) * 1000) / 10
      : 0
  );

  const booked = calls.filter((c) => c.outcome === "load_booked");
  const margins = booked
    .map((c) => brokerMargin(c.loadboard_rate, c.agreed_rate))
    .filter((m) => m > 0);
  const avgMarginPerBooked = margins.length
    ? Math.round(margins.reduce((s, m) => s + m, 0) / margins.length)
    : DEFAULT_MARGIN_PER_BOOKED;

  return {
    callsPerDay,
    bookingRatePct,
    costPerCall: HUMAN_AGENT_COST_PER_CALL,
    avgMarginPerBooked,
  };
}

export function computeRoiProjection(
  callsPerDay: number,
  bookingRatePct: number,
  costPerCall: number,
  avgMarginPerBooked: number,
) {
  const annualLaborSavings = Math.round(callsPerDay * DAYS_PER_YEAR * costPerCall);
  const bookingRate = bookingRatePct / 100;
  const annualNegotiationMargin = Math.round(
    callsPerDay * DAYS_PER_YEAR * bookingRate * avgMarginPerBooked,
  );
  return {
    annualLaborSavings,
    annualNegotiationMargin,
    totalAnnualSavings: annualLaborSavings + annualNegotiationMargin,
  };
}

export function computePredictedAnnualSavings(
  calls: CallRecord[],
  costPerCall = HUMAN_AGENT_COST_PER_CALL,
): PredictedAnnualSavings | null {
  if (calls.length === 0) return null;

  const { total } = computePlatformSavings(calls, costPerCall);
  const timestamps = calls
    .map((c) => {
      const iso = c.created_at.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(c.created_at)
        ? c.created_at
        : `${c.created_at}Z`;
      return new Date(iso).getTime();
    })
    .filter((t) => !Number.isNaN(t));
  if (timestamps.length === 0) return null;

  const firstCallMs = Math.min(...timestamps);
  const daysSinceFirstCall = Math.max((Date.now() - firstCallMs) / MS_PER_DAY, 1);
  const predictedAnnual = Math.round((total / daysSinceFirstCall) * DAYS_PER_YEAR);

  return {
    predictedAnnual,
    daysSinceFirstCall: Math.ceil(daysSinceFirstCall),
    totalSavingsToDate: total,
  };
}

export function buildFunnel(calls: CallRecord[]): FunnelStep[] {
  const total = calls.length || 1;

  const mcVerified = calls.filter((c) => c.carrier_eligible !== false && c.outcome !== "carrier_ineligible").length;
  const loadMatched = calls.filter((c) => !!c.load_id && c.loadboard_rate > 0).length;
  const offerMade = calls.filter(
    (c) => c.num_counter_offers > 0 || c.agreed_rate > 0
      || c.outcome === "load_booked" || c.outcome === "price_rejected",
  ).length;
  const booked = calls.filter((c) => c.outcome === "load_booked").length;

  const ineligible = calls.filter((c) => c.outcome === "carrier_ineligible").length;
  const noMatch = calls.filter((c) => c.carrier_eligible && !c.load_id && c.outcome !== "carrier_ineligible").length;
  const priceRejected = calls.filter((c) => c.outcome === "price_rejected").length;

  return [
    { key: "incoming", label: "Inbound calls", count: calls.length, pct_of_total: 100 },
    {
      key: "mc_verified", label: "MC verified", count: mcVerified, pct_of_total: Math.round((mcVerified / total) * 100),
      drop_label: ineligible > 0 ? `${ineligible} invalid MC` : undefined,
    },
    {
      key: "load_matched", label: "Load matched", count: loadMatched, pct_of_total: Math.round((loadMatched / total) * 100),
      drop_label: noMatch > 0 ? `${noMatch} no inventory` : undefined,
    },
    {
      key: "offer_made", label: "Offer made", count: offerMade, pct_of_total: Math.round((offerMade / total) * 100),
    },
    {
      key: "booked", label: "Load booked", count: booked, pct_of_total: Math.round((booked / total) * 100),
      drop_label: priceRejected > 0 ? `${priceRejected} price rejected` : undefined,
    },
  ];
}

export function buildEquipmentStats(calls: CallRecord[]): EquipmentStat[] {
  const groups = new Map<string, CallRecord[]>();
  calls.forEach((c) => {
    const eq = c.equipment_type || "Other";
    const list = groups.get(eq) ?? [];
    list.push(c);
    groups.set(eq, list);
  });

  return Array.from(groups.entries())
    .map(([equipment, rows]) => {
      const bookedRows = rows.filter((r) => r.outcome === "load_booked");
      const margins = bookedRows.map((r) => brokerMargin(r.loadboard_rate, r.agreed_rate));
      const totalMargin = margins.reduce((s, m) => s + m, 0);
      return {
        equipment,
        calls: rows.length,
        booked: bookedRows.length,
        booking_rate: rows.length ? Math.round((bookedRows.length / rows.length) * 1000) / 10 : 0,
        avg_margin: bookedRows.length ? Math.round(totalMargin / bookedRows.length) : 0,
        total_margin: totalMargin,
      };
    })
    .sort((a, b) => b.total_margin - a.total_margin);
}

export function computeBookedMiles(calls: CallRecord[]): number {
  return calls
    .filter((c) => c.outcome === "load_booked")
    .reduce((sum, c) => sum + resolveMiles(c), 0);
}

export function computeYield(calls: CallRecord[]): number {
  const miles = computeBookedMiles(calls);
  if (miles === 0) return 0;
  const margin = calls
    .filter((c) => c.outcome === "load_booked")
    .reduce((s, c) => s + brokerMargin(c.loadboard_rate, c.agreed_rate), 0);
  return Math.round((margin / miles) * 100) / 100;
}

export function computeAiRoi(totalCalls: number, extraMargin: number) {
  const humanSavings = totalCalls * HUMAN_AGENT_COST_PER_CALL;
  return {
    human_cost_savings: humanSavings,
    extra_margin_captured: extraMargin,
    ai_roi: humanSavings + extraMargin,
  };
}

export function enrichCalls(calls: CallRecord[]): CallRecord[] {
  return calls.map((c) => ({
    ...c,
    miles: c.miles ?? resolveMiles(c),
    last_carrier_offer: c.last_carrier_offer ?? getLastCarrierOffer(c) ?? undefined,
    transfer_status: c.transfer_status ?? (
      c.outcome === "load_booked" ? "successful" as const
      : c.outcome === "transferred" ? "pending" as const
      : "n/a" as const
    ),
    broker_margin: c.broker_margin ?? (
      c.outcome === "load_booked" ? brokerMargin(c.loadboard_rate, c.agreed_rate) : 0
    ),
  }));
}

export function buildAnalytics(
  calls: CallRecord[],
  summary: Summary | null,
  isDemoMode = false,
): DashboardAnalytics {
  const enriched = enrichCalls(calls);
  const totalCalls = enriched.length;
  const extraMargin = enriched
    .filter((c) => c.outcome === "load_booked")
    .reduce((s, c) => s + brokerMargin(c.loadboard_rate, c.agreed_rate), 0);
  const roi = computeAiRoi(totalCalls, extraMargin);

  return {
    yield_per_mile: computeYield(enriched),
    total_booked_miles: computeBookedMiles(enriched),
    ...roi,
    funnel: buildFunnel(enriched),
    equipment: buildEquipmentStats(enriched),
    missed_opportunities: isDemoMode ? DEMO_MISSED_OPPORTUNITIES : [],
    trends: {},
  };
}
