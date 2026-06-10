/** Lat/lon [longitude, latitude] for US freight lanes. */
import { BRAND } from "../brand";

export const CITY_COORDS: Record<string, [number, number]> = {
  dallas: [-96.797, 32.7767],
  atlanta: [-84.388, 33.749],
  "los angeles": [-118.2437, 34.0522],
  phoenix: [-112.074, 33.4484],
  chicago: [-87.6298, 41.8781],
  newark: [-74.1724, 40.7357],
  houston: [-95.3698, 29.7604],
  denver: [-104.9903, 39.7392],
  miami: [-80.1918, 25.7617],
  charlotte: [-80.8431, 35.2271],
  seattle: [-122.3321, 47.6062],
  portland: [-122.6765, 45.5152],
  memphis: [-90.049, 35.1495],
  nashville: [-86.7816, 36.1627],
  "kansas city": [-94.5786, 39.0997],
  "san antonio": [-98.4936, 29.4241],
  indianapolis: [-86.1581, 39.7684],
  columbus: [-82.9988, 39.9612],
  detroit: [-83.0458, 42.3314],
  boston: [-71.0589, 42.3601],
};

export function resolveCityCoords(label: string): [number, number] | null {
  if (!label) return null;
  const city = label.split(",")[0].trim().toLowerCase();
  return CITY_COORDS[city] ?? null;
}

export function cityLabel(label: string): string {
  return label.split(",")[0].trim() || label;
}

export function outcomeRouteColor(outcome: string): string {
  switch (outcome) {
    case "load_booked": return BRAND.green;
    case "price_rejected": return BRAND.warn;
    case "carrier_ineligible": return BRAND.danger;
    case "no_interest": return BRAND.muted;
    case "transferred": return BRAND.info;
    default: return "#9ca3af";
  }
}

export function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "load_booked": return "Booked";
    case "price_rejected": return "Rejected";
    case "carrier_ineligible": return "Ineligible";
    case "no_interest": return "No interest";
    case "transferred": return "Transferred";
    case "platform_run": return "Platform run";
    default: return "Other";
  }
}

/** Haversine distance in miles between two lon/lat points. */
export function laneMiles(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

/** Great-circle interpolation for curved freight arcs. */
export function greatCircleArc(
  start: [number, number],
  end: [number, number],
  steps = 48,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lon1, lat1] = start.map(toRad) as [number, number];
  const [lon2, lat2] = end.map(toRad) as [number, number];

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );

  if (d === 0) return [start, end];

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return points;
}
