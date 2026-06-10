import type {
  CallRecord, DashboardAnalytics, EquipmentStat, FunnelStep,
  KpiTrend, MissedOpportunity, Summary,
} from "./types";
import { brokerMargin, getLastCarrierOffer, resolveMiles } from "./format";
import { DEMO_MISSED_OPPORTUNITIES, DEMO_KPI_TRENDS } from "./mockData";

const HUMAN_AGENT_COST_PER_CALL = 15;

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
    trends: summary ? deriveTrends(summary, enriched) : DEMO_KPI_TRENDS,
  };
}

function deriveTrends(_summary: Summary, calls: CallRecord[]): Record<string, KpiTrend> {
  const booked = calls.filter((c) => c.outcome === "load_booked").length;
  const bookingRate = calls.length ? (booked / calls.length) * 100 : 0;
  return {
    ...DEMO_KPI_TRENDS,
    total_calls: { delta_pct: 12, direction: "up", label: "+12% vs last week" },
    booked_loads: { delta_pct: 8, direction: "up", label: "+8% vs last week" },
    booking_rate: {
      delta_pct: bookingRate > 40 ? 5 : -2,
      direction: bookingRate > 40 ? "up" : "down",
      label: bookingRate > 40 ? "+5% vs last week" : "-2% vs last week",
    },
  };
}
