import { useMemo, useState, useCallback } from "react";
import {
  ComposableMap, Geographies, Geography, Marker, useMapContext,
} from "react-simple-maps";
import type { CallRecord } from "../../lib/dashboard/types";
import {
  greatCircleArc, outcomeLabel, outcomeRouteColor,
} from "../../lib/dashboard/cityCoords";
import {
  useMapData, filterRoutes, type MapRoute, type HubNode,
} from "../../lib/dashboard/routeMapUtils";
import { BRAND } from "../../lib/brand";
import { fmtMoney } from "../../lib/dashboard/format";
import { Card } from "./ui";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type Props = {
  calls: CallRecord[];
  selectedId?: number | null;
  onSelectRoute?: (call: CallRecord) => void;
};

export function RouteMap({ calls, selectedId, onSelectRoute }: Props) {
  const { routes, hubs, counts, stats } = useMapData(calls);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hiddenOutcomes, setHiddenOutcomes] = useState<Set<string>>(new Set());

  const visibleRoutes = useMemo(() => {
    if (hiddenOutcomes.size === 0) return routes;
    return filterRoutes(routes, new Set(routes.map((r) => r.outcome).filter((o) => !hiddenOutcomes.has(o))));
  }, [routes, hiddenOutcomes]);

  const visibleStats = useMemo(() => {
    const booked = visibleRoutes.filter((r) => r.outcome === "load_booked");
    return {
      lanes: visibleRoutes.length,
      booked: booked.length,
      totalMiles: visibleRoutes.reduce((s, r) => s + r.miles, 0),
      totalMargin: booked.reduce((s, r) => s + r.margin, 0),
    };
  }, [visibleRoutes]);

  const hovered = visibleRoutes.find((r) => r.id === hoveredId) ?? null;

  const toggleOutcome = useCallback((outcome: string) => {
    setHiddenOutcomes((prev) => {
      const next = new Set(prev);
      if (next.has(outcome)) next.delete(outcome);
      else next.add(outcome);
      return next;
    });
  }, []);

  const legendItems = useMemo(() => {
    const order = ["load_booked", "price_rejected", "carrier_ineligible", "no_interest", "transferred", "other"];
    return order
      .filter((o) => (counts[o] ?? 0) > 0)
      .map((o) => ({ outcome: o, count: counts[o], label: outcomeLabel(o), color: outcomeRouteColor(o) }));
  }, [counts]);

  return (
    <Card
      title="Logistics route map"
      action={
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          {visibleStats.lanes} lanes · {visibleStats.booked} booked · {visibleStats.totalMiles.toLocaleString()} mi
        </span>
      }
    >
      {routes.length === 0 ? (
        <EmptyMap />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
          <div style={{
            position: "relative",
            background: `radial-gradient(ellipse at 40% 35%, ${BRAND.greenLight} 0%, ${BRAND.bgAlt} 55%, ${BRAND.white} 100%)`,
            borderRadius: 12,
            overflow: "hidden",
            border: `1px solid ${BRAND.border}`,
            minHeight: 440,
          }}>
            {/* subtle grid overlay */}
            <div style={{
              position: "absolute", inset: 0, opacity: 0.12, pointerEvents: "none",
              backgroundImage: `
                linear-gradient(${BRAND.greenMuted} 1px, transparent 1px),
                linear-gradient(90deg, ${BRAND.greenMuted} 1px, transparent 1px)
              `,
              backgroundSize: "48px 48px",
            }} />

            <ComposableMap
              projection="geoAlbersUsa"
              width={900}
              height={480}
              style={{ width: "100%", height: "auto", position: "relative" }}
            >
              <MapDefs />
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={BRAND.greenLight}
                      stroke={BRAND.greenMuted}
                      strokeWidth={0.8}
                      style={{
                        default: { outline: "none", opacity: 1 },
                        hover: { outline: "none", fill: BRAND.greenMuted, opacity: 1 },
                        pressed: { outline: "none" },
                      }}
                    />
                  ))
                }
              </Geographies>

              <RouteLayer
                routes={visibleRoutes}
                selectedId={selectedId ?? null}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onSelect={onSelectRoute}
              />
              <HubLayer hubs={hubs} routes={visibleRoutes} />
            </ComposableMap>

            {hovered && <MapTooltip route={hovered} />}
          </div>

          <LanePanel
            routes={visibleRoutes}
            selectedId={selectedId ?? null}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={onSelectRoute}
            totalMargin={visibleStats.totalMargin}
          />
        </div>
      )}

      {legendItems.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          {legendItems.map((item) => {
            const off = hiddenOutcomes.has(item.outcome);
            return (
              <button
                key={item.outcome}
                type="button"
                onClick={() => toggleOutcome(item.outcome)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${off ? BRAND.border : item.color + "66"}`,
                  background: off ? "transparent" : item.color + "18",
                  color: off ? BRAND.muted : BRAND.text,
                  fontSize: 11, fontWeight: 600,
                  opacity: off ? 0.45 : 1,
                  transition: "all 0.15s",
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: item.color, boxShadow: off ? "none" : `0 0 8px ${item.color}`,
                }} />
                {item.label}
                <span style={{ color: "var(--muted)", fontWeight: 500 }}>({item.count})</span>
              </button>
            );
          })}
          {hiddenOutcomes.size > 0 && (
            <button
              type="button"
              onClick={() => setHiddenOutcomes(new Set())}
              style={{
                padding: "5px 10px", borderRadius: 999, fontSize: 11,
                border: `1px solid ${BRAND.border}`, background: BRAND.bgAlt, color: BRAND.muted, cursor: "pointer",
              }}
            >
              Show all
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function MapDefs() {
  return (
    <defs>
      <filter id="routeGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="hubGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor={BRAND.greenDark} stopOpacity={0.9} />
        <stop offset="100%" stopColor={BRAND.green} stopOpacity={0.9} />
      </linearGradient>
    </defs>
  );
}

function RouteLayer({
  routes, selectedId, hoveredId, onHover, onSelect,
}: {
  routes: MapRoute[];
  selectedId: number | null;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onSelect?: (call: CallRecord) => void;
}) {
  const { projection } = useMapContext();

  return (
    <g>
      {routes.map((route) => {
        const selected = route.id === selectedId;
        const hovered = route.id === hoveredId;
        const active = selected || hovered;
        const arc = greatCircleArc(route.origin, route.destination, 64);
        const pathD = arc
          .map((coord, i) => {
            const xy = projection(coord);
            if (!xy) return null;
            return `${i === 0 ? "M" : "L"} ${xy[0]},${xy[1]}`;
          })
          .filter(Boolean)
          .join(" ");

        if (!pathD) return null;

        const opacity = route.outcome === "load_booked" ? 0.92 : route.outcome === "carrier_ineligible" ? 0.55 : 0.72;
        const width = active ? route.strokeWidth + 1.5 : route.strokeWidth;

        return (
          <g key={route.id}>
            {/* glow underlay */}
            <path
              d={pathD}
              fill="none"
              stroke={route.color}
              strokeWidth={width + 3}
              strokeOpacity={active ? 0.35 : 0.12}
              strokeLinecap="round"
            />
            <path
              d={pathD}
              fill="none"
              stroke={route.color}
              strokeWidth={width}
              strokeOpacity={opacity}
              strokeLinecap="round"
              filter={route.outcome === "load_booked" ? "url(#routeGlow)" : undefined}
              strokeDasharray={route.outcome === "price_rejected" ? "6 4" : undefined}
              style={{
                cursor: "pointer",
                transition: "stroke-width 0.15s, stroke-opacity 0.15s",
              }}
              onMouseEnter={() => onHover(route.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect?.(route.call)}
            />
            {/* direction arrow at midpoint */}
            {active && <RouteArrow arc={arc} projection={projection} color={route.color} />}
          </g>
        );
      })}
    </g>
  );
}

function RouteArrow({
  arc, projection, color,
}: {
  arc: [number, number][];
  projection: (c: [number, number]) => [number, number] | null;
  color: string;
}) {
  const mid = arc[Math.floor(arc.length / 2)];
  const next = arc[Math.floor(arc.length / 2) + 1] ?? mid;
  const p1 = projection(mid);
  const p2 = projection(next);
  if (!p1 || !p2) return null;
  const angle = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
  return (
    <Marker coordinates={mid}>
      <polygon
        points="-4,-3 5,0 -4,3"
        fill={color}
        transform={`rotate(${angle})`}
        opacity={0.95}
      />
    </Marker>
  );
}

function HubLayer({ hubs, routes }: { hubs: HubNode[]; routes: MapRoute[] }) {
  const activeCities = new Set(
    routes.flatMap((r) => [r.originLabel.toLowerCase(), r.destLabel.toLowerCase()]),
  );
  const topHubs = hubs.filter((h) => activeCities.has(h.city.toLowerCase())).slice(0, 14);

  return (
    <>
      {topHubs.map((hub) => {
        const volume = hub.departures + hub.arrivals;
        const r = 3 + Math.min(volume * 1.2, 8);
        const hasBooked = hub.booked > 0;
        return (
          <Marker key={hub.city} coordinates={hub.coords}>
            {hasBooked && (
              <circle r={r + 5} fill={BRAND.green} opacity={0.12} filter="url(#hubGlow)">
                <animate attributeName="r" values={`${r + 4};${r + 7};${r + 4}`} dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.18;0.06;0.18" dur="2.5s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              r={r}
              fill={hasBooked ? BRAND.green : BRAND.greenDark}
              stroke={BRAND.white}
              strokeWidth={1.5}
              opacity={0.95}
            />
            <text
              textAnchor="middle"
              y={-r - 5}
              style={{ fontSize: 9, fill: BRAND.text, fontWeight: 600, pointerEvents: "none" }}
            >
              {hub.city}
            </text>
            {volume > 1 && (
              <text
                textAnchor="middle"
                y={r + 12}
                style={{ fontSize: 8, fill: BRAND.muted, pointerEvents: "none" }}
              >
                {volume} moves
              </text>
            )}
          </Marker>
        );
      })}
    </>
  );
}

function MapTooltip({ route }: { route: MapRoute }) {
  const c = route.call;
  return (
    <div style={{
      position: "absolute", bottom: 14, left: 14, right: 14,
      background: "rgba(255, 255, 255, 0.96)", backdropFilter: "blur(8px)",
      border: `1px solid ${route.color}55`, borderRadius: 10,
      padding: "12px 14px", pointerEvents: "none", zIndex: 10,
      boxShadow: "var(--shadow-md)",
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 4, alignSelf: "stretch", borderRadius: 4,
          background: route.color, boxShadow: `0 0 12px ${route.color}`,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>
            {route.originLabel} → {route.destLabel}
            <span style={{ marginLeft: 8, fontSize: 11, color: route.color }}>
              {outcomeLabel(route.outcome)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 4 }}>
            {c.carrier_name || "Unknown"} · MC {c.mc_number} · {c.load_id || "—"} · {route.miles} mi
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12 }}>
            {c.loadboard_rate > 0 && (
              <span>Posted <strong style={{ color: BRAND.text }}>{fmtMoney(c.loadboard_rate)}</strong></span>
            )}
            {c.agreed_rate > 0 && (
              <span>Agreed <strong style={{ color: BRAND.greenDark }}>{fmtMoney(c.agreed_rate)}</strong></span>
            )}
            {route.margin > 0 && (
              <span>Margin <strong style={{ color: BRAND.green }}>{fmtMoney(route.margin)}</strong></span>
            )}
            <span style={{ color: BRAND.muted }}>{c.equipment_type || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LanePanel({
  routes, selectedId, hoveredId, onHover, onSelect, totalMargin,
}: {
  routes: MapRoute[];
  selectedId: number | null;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onSelect?: (call: CallRecord) => void;
  totalMargin: number;
}) {
  return (
    <div style={{
      background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 12,
      display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: 440,
    }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BRAND.border}` }}>
        <div style={{ fontSize: 11, color: BRAND.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Active lanes
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.greenDark, marginTop: 4 }}>
          {fmtMoney(totalMargin)}
        </div>
        <div style={{ fontSize: 10, color: BRAND.muted }}>booked margin on map</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {routes.map((r) => {
          const active = r.id === selectedId || r.id === hoveredId;
          return (
            <button
              key={r.id}
              type="button"
              onMouseEnter={() => onHover(r.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect?.(r.call)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 10px", marginBottom: 6, borderRadius: 8,
                border: `1px solid ${active ? r.color + "88" : BRAND.border}`,
                background: active ? r.color + "14" : BRAND.bgAlt,
                cursor: "pointer", transition: "all 0.12s",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.text }}>
                {r.originLabel} → {r.destLabel}
              </div>
              <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 3 }}>
                {r.miles} mi · {outcomeLabel(r.outcome)}
                {r.margin > 0 && <span style={{ color: BRAND.greenDark }}> · +{fmtMoney(r.margin)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyMap() {
  return (
    <div style={{
      color: BRAND.muted, textAlign: "center", padding: "60px 0", fontSize: 13,
      background: BRAND.bgAlt,
      borderRadius: 12, border: `1px solid ${BRAND.border}`,
    }}>
      No geocodable lanes in this window — calls need origin/destination cities we recognize.
    </div>
  );
}
