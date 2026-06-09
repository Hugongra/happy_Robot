import { useMemo } from "react";
import type { CallRecord } from "./types";
import {
  resolveCityCoords,
  outcomeRouteColor,
  cityLabel,
  laneMiles,
} from "./cityCoords";

export type MapRoute = {
  id: number;
  call: CallRecord;
  origin: [number, number];
  destination: [number, number];
  originLabel: string;
  destLabel: string;
  color: string;
  outcome: string;
  miles: number;
  margin: number;
  strokeWidth: number;
};

export function buildMapRoutes(calls: CallRecord[]): MapRoute[] {
  const routes: MapRoute[] = [];
  for (const call of calls) {
    const origin = resolveCityCoords(call.origin);
    const dest = resolveCityCoords(call.destination);
    if (!origin || !dest) continue;

    const margin = Math.max(
      call.broker_margin ?? call.loadboard_rate - call.agreed_rate,
      0,
    );
    const rateScale = call.loadboard_rate > 0 ? call.loadboard_rate / 2500 : 0.5;

    routes.push({
      id: call.id,
      call,
      origin,
      destination: dest,
      originLabel: cityLabel(call.origin),
      destLabel: cityLabel(call.destination),
      color: outcomeRouteColor(call.outcome),
      outcome: call.outcome,
      miles: laneMiles(origin, dest),
      margin,
      strokeWidth: call.outcome === "load_booked"
        ? 2.5 + Math.min(margin / 80, 2)
        : 1.5 + rateScale * 0.8,
    });
  }
  return routes;
}

export type HubNode = {
  city: string;
  coords: [number, number];
  departures: number;
  arrivals: number;
  booked: number;
};

export function buildHubNodes(routes: MapRoute[]): HubNode[] {
  const hubs = new Map<string, HubNode>();

  const touch = (label: string, coords: [number, number], kind: "dep" | "arr", booked: boolean) => {
    const key = label.toLowerCase();
    const node = hubs.get(key) ?? {
      city: label,
      coords,
      departures: 0,
      arrivals: 0,
      booked: 0,
    };
    if (kind === "dep") node.departures += 1;
    else node.arrivals += 1;
    if (booked) node.booked += 1;
    hubs.set(key, node);
  };

  routes.forEach((r) => {
    const booked = r.outcome === "load_booked";
    touch(r.originLabel, r.origin, "dep", booked);
    touch(r.destLabel, r.destination, "arr", booked);
  });

  return Array.from(hubs.values()).sort(
    (a, b) => b.departures + b.arrivals - (a.departures + a.arrivals),
  );
}

export function outcomeCounts(routes: MapRoute[]): Record<string, number> {
  const counts: Record<string, number> = {};
  routes.forEach((r) => {
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  });
  return counts;
}

export function filterRoutes(
  routes: MapRoute[],
  activeOutcomes: Set<string> | null,
): MapRoute[] {
  if (!activeOutcomes) return routes;
  return routes.filter((r) => activeOutcomes.has(r.outcome));
}

export function mapStats(routes: MapRoute[]) {
  const booked = routes.filter((r) => r.outcome === "load_booked");
  return {
    lanes: routes.length,
    booked: booked.length,
    totalMiles: routes.reduce((s, r) => s + r.miles, 0),
    totalMargin: booked.reduce((s, r) => s + r.margin, 0),
    hubs: new Set(routes.flatMap((r) => [r.originLabel, r.destLabel])).size,
  };
}

export function useMapData(calls: CallRecord[]) {
  return useMemo(() => {
    const routes = buildMapRoutes(calls);
    const hubs = buildHubNodes(routes);
    const counts = outcomeCounts(routes);
    return { routes, hubs, counts, stats: mapStats(routes) };
  }, [calls]);
}
