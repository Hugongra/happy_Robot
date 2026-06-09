import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import type { CallRecord } from "../lib/dashboard/types";
import {
  mergeWithDemoCalls, aggregateOutcomes, aggregateSentiments,
  aggregateRounds, buildMarginSeries, enrichSummary,
} from "../lib/dashboard/mockData";
import { useDashboardData } from "../lib/dashboard/useDashboardData";
import { fmtMoney } from "../lib/dashboard/format";
import {
  OUTCOME_COLORS, SENTIMENT_COLORS, tooltipStyle, selectStyle, kpiGrid, chartGrid,
} from "../lib/dashboard/theme";
import { Kpi, Card, ErrBox } from "../components/dashboard/ui";
import { CallDetailModal } from "../components/dashboard/CallDetailModal";
import { RouteMap } from "../components/dashboard/RouteMap";
import { BrokerMarginChart } from "../components/dashboard/BrokerMarginChart";
import { RateScatterChart } from "../components/dashboard/RateScatterChart";
import { NegotiationLadderChart } from "../components/dashboard/NegotiationLadderChart";
import { RecentCallsTable } from "../components/dashboard/RecentCallsTable";

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const { summary, apiCalls, marginApi, err, loading, lastUpdated, refresh } = useDashboardData(days);

  const calls = useMemo(() => mergeWithDemoCalls(apiCalls), [apiCalls]);
  const displaySummary = useMemo(() => enrichSummary(summary, calls), [summary, calls]);
  const outcomes = useMemo(() => aggregateOutcomes(calls), [calls]);
  const sentiments = useMemo(() => aggregateSentiments(calls), [calls]);
  const rounds = useMemo(() => aggregateRounds(calls), [calls]);
  const marginSeries = useMemo(() => {
    const fromApi = marginApi.length > 0 ? marginApi : [];
    const fromCalls = buildMarginSeries(calls);
    return fromApi.length >= fromCalls.length ? fromApi : fromCalls;
  }, [marginApi, calls]);

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", marginBottom: 20, gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Carrier Sales Dashboard</h1>
          <p style={{ margin: "4px 0 0", color: "#8a9ab2", fontSize: 13 }}>
            Ops intelligence · auto-refresh 30s · click any call for transcript & AI reasoning
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#8a9ab2" }}>
            {loading ? "Updating…" : `Updated ${updatedLabel}`}
          </span>
          <button
            type="button"
            onClick={() => refresh()}
            style={{
              ...selectStyle, cursor: "pointer", fontWeight: 600,
            }}
          >
            Refresh
          </button>
          <label style={{ color: "#8a9ab2", fontSize: 13 }}>Window</label>
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} style={selectStyle}>
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </header>

      {err && <ErrBox text={err} />}

      <div style={kpiGrid}>
        <Kpi label="Total calls" value={displaySummary?.total_calls ?? "—"} />
        <Kpi label="Loads booked" value={displaySummary?.booked_loads ?? "—"} />
        <Kpi label="Booking rate" value={displaySummary ? `${displaySummary.booking_rate}%` : "—"} tint="#19c37d" />
        <Kpi
          label="Total broker margin"
          value={displaySummary ? fmtMoney(displaySummary.total_broker_margin) : "—"}
          tint="#4ea1ff"
        />
        <Kpi label="Avg agreed rate" value={displaySummary ? fmtMoney(displaySummary.avg_agreed_rate) : "—"} />
        <Kpi
          label="Δ vs loadboard"
          value={displaySummary ? `${displaySummary.rate_delta_pct}%` : "—"}
          tint={displaySummary && displaySummary.rate_delta_pct < 0 ? "#ffae42" : "#19c37d"}
        />
        <Kpi label="Avg rounds" value={displaySummary?.avg_negotiation_rounds ?? "—"} />
        <Kpi label="Avg call (sec)" value={displaySummary?.avg_call_seconds ?? "—"} />
        <Kpi
          label="FMCSA reject %"
          value={displaySummary ? `${displaySummary.fmcsa_rejection_rate}%` : "—"}
          tint="#ff6b6b"
        />
      </div>

      <RouteMap
        calls={calls}
        selectedId={selected?.id ?? null}
        onSelectRoute={setSelected}
      />

      <div style={chartGrid}>
        <Card title="Calls by outcome">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={outcomes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2c4a" />
              <XAxis dataKey="outcome" stroke="#8a9ab2" fontSize={10} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis stroke="#8a9ab2" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {outcomes.map((d, i) => (
                  <Cell key={i} fill={OUTCOME_COLORS[d.outcome] ?? "#6b7280"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Carrier sentiment">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={sentiments} dataKey="count" nameKey="sentiment" outerRadius={90} innerRadius={45} label={false}>
                {sentiments.map((d, i) => (
                  <Cell key={i} fill={SENTIMENT_COLORS[d.sentiment] ?? "#6b7280"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, _n: string, item: { payload?: { sentiment?: string } }) =>
                  [`${value} call${value === 1 ? "" : "s"}`, item.payload?.sentiment ?? ""]}
              />
              <Legend wrapperStyle={{ color: "#8a9ab2", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Negotiation rounds distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rounds}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2c4a" />
              <XAxis dataKey="rounds" stroke="#8a9ab2" fontSize={11} />
              <YAxis stroke="#8a9ab2" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#4ea1ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <BrokerMarginChart data={marginSeries} />
        <RateScatterChart calls={calls} />
        <NegotiationLadderChart calls={calls} selectedId={selected?.id ?? null} />
      </div>

      <RecentCallsTable
        calls={calls}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      <CallDetailModal call={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
