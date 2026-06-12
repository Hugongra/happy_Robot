import type { CallRecord } from "./types";
import { resolveMiles } from "./format";

/** Mirrors backend seed_loads.json for demo / offline enrichment. */
const LOAD_BOARD: Record<string, {
  pickup_datetime: string;
  delivery_datetime: string;
  weight: number;
  commodity_type: string;
  miles: number;
}> = {
  "ACM-1001": { pickup_datetime: "2026-06-09T08:00:00", delivery_datetime: "2026-06-10T18:00:00", weight: 38000, commodity_type: "Packaged consumer goods", miles: 780 },
  "ACM-1002": { pickup_datetime: "2026-06-08T06:30:00", delivery_datetime: "2026-06-08T20:00:00", weight: 42000, commodity_type: "Fresh produce", miles: 370 },
  "ACM-1003": { pickup_datetime: "2026-06-09T14:00:00", delivery_datetime: "2026-06-11T10:00:00", weight: 36500, commodity_type: "Auto parts", miles: 800 },
  "ACM-1004": { pickup_datetime: "2026-06-08T11:00:00", delivery_datetime: "2026-06-09T18:00:00", weight: 28000, commodity_type: "Electronics", miles: 175 },
  "ACM-1005": { pickup_datetime: "2026-06-09T07:00:00", delivery_datetime: "2026-06-10T15:00:00", weight: 40000, commodity_type: "Dairy products", miles: 650 },
  "ACM-1006": { pickup_datetime: "2026-06-10T09:00:00", delivery_datetime: "2026-06-12T17:00:00", weight: 44000, commodity_type: "Steel coils", miles: 920 },
};

export type ResolvedLoadDetails = {
  load_id: string;
  lane: string;
  equipment: string;
  pickup_datetime: string;
  delivery_datetime: string;
  miles: number;
  weight: number;
  commodity: string;
  posted_rate: number;
};

export function hasLoadMatched(call: CallRecord): boolean {
  return !!(
    call.load_id?.trim()
    || call.loadboard_rate > 0
    || (call.origin?.trim() && call.destination?.trim())
  );
}

export function resolveLoadDetails(call: CallRecord): ResolvedLoadDetails | null {
  if (!hasLoadMatched(call)) return null;

  const board = call.load_id ? LOAD_BOARD[call.load_id] : undefined;
  const miles = call.miles && call.miles > 0
    ? call.miles
    : board?.miles ?? resolveMiles(call);

  return {
    load_id: call.load_id || "—",
    lane: call.origin && call.destination
      ? `${call.origin} → ${call.destination}`
      : call.origin || call.destination || "—",
    equipment: call.equipment_type || "—",
    pickup_datetime: call.pickup_datetime || board?.pickup_datetime || "",
    delivery_datetime: call.delivery_datetime || board?.delivery_datetime || "",
    miles,
    weight: call.weight && call.weight > 0 ? call.weight : board?.weight ?? 0,
    commodity: call.commodity_type || board?.commodity_type || "",
    posted_rate: call.loadboard_rate,
  };
}

export type FmcsaStatus = "verified" | "rejected" | "not_provided";

export function resolveFmcsaStatus(call: CallRecord): FmcsaStatus {
  const mc = call.mc_number?.trim();
  if (!mc) return "not_provided";
  if (call.outcome === "carrier_ineligible" || call.carrier_eligible === false) {
    return "rejected";
  }
  if (call.carrier_eligible === true) return "verified";
  return "not_provided";
}
