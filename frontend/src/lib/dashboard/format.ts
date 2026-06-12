import type { CallRecord } from "./types";

export function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function fmtMoney(n: number) {
  return `$${fmt(n)}`;
}

/** Parse UTC ISO from API and show in the user's local timezone. */
export function fmtScheduled(iso: string): string {
  if (!iso?.trim()) return "—";
  const utc = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function fmtWhen(iso: string): string {
  const utc = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(utc));
}

export function brokerMargin(loadboard: number, agreed: number): number {
  return Math.max(loadboard - agreed, 0);
}

/** Last carrier-side offer from alternating counter-offer ladder (even indices). */
export function getLastCarrierOffer(call: { counter_offers?: number[] }): number | null {
  const offers = call.counter_offers ?? [];
  for (let i = offers.length - 1; i >= 0; i--) {
    if (i % 2 === 0) return offers[i];
  }
  return null;
}

const LOAD_MILES: Record<string, number> = {
  "ACM-1001": 780,
  "ACM-1002": 370,
  "ACM-1003": 800,
  "ACM-1004": 175,
  "ACM-1005": 650,
  "ACM-1006": 920,
  "ACM-1007": 510,
  "ACM-1008": 440,
  "ACM-1009": 290,
};

export function resolveMiles(call: { load_id?: string; origin?: string; destination?: string; miles?: number }): number {
  if (call.miles && call.miles > 0) return call.miles;
  if (call.load_id && LOAD_MILES[call.load_id]) return LOAD_MILES[call.load_id];
  return estimateLaneMiles(call.origin ?? "", call.destination ?? "");
}

function estimateLaneMiles(origin: string, destination: string): number {
  const pairs: Record<string, number> = {
    "dallas|atlanta": 780,
    "los angeles|phoenix": 370,
    "chicago|newark": 800,
    "seattle|portland": 175,
    "miami|charlotte": 650,
    "houston|denver": 920,
    "dallas|miami": 1180,
  };
  const key = `${origin.split(",")[0].trim().toLowerCase()}|${destination.split(",")[0].trim().toLowerCase()}`;
  return pairs[key] ?? 500;
}

/** Average (loadboard − agreed) / loadboard over booked loads with a posted rate. */
export function computeNegotiationSavingsPct(calls: CallRecord[]): number | null {
  const booked = calls.filter((c) => c.outcome === "load_booked" && c.loadboard_rate > 0);
  if (booked.length === 0) return null;
  const avg = booked.reduce(
    (s, c) => s + (c.loadboard_rate - c.agreed_rate) / c.loadboard_rate,
    0,
  ) / booked.length;
  return Math.round(avg * 1000) / 10;
}

/** Positive = broker savings; negative = overpayment vs posted. */
export function formatNegotiationSavings(pct: number): { display: string; isSavings: boolean } {
  const isSavings = pct >= 0;
  const abs = Math.abs(pct);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return {
    display: isSavings ? `+${formatted}%` : `-${formatted}%`,
    isSavings,
  };
}
