import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import type { CallRecord } from "../lib/dashboard/types";
import {
  resolveDashboardCalls, aggregateOutcomes, aggregateSentiments,
  aggregateRounds, buildMarginSeries, enrichSummary,
} from "../lib/dashboard/mockData";
import { buildAnalytics, enrichCalls } from "../lib/dashboard/analytics";
import { useDashboardData } from "../hooks/useDashboardData";
import { fmtMoney, formatMarketDiscount } from "../lib/dashboard/format";
import {
  OUTCOME_COLORS, SENTIMENT_COLORS, tooltipStyle, selectStyle, kpiGrid, chartGrid,
  chartGridStroke, chartAxisColor,
} from "../lib/dashboard/theme";
import { BRAND } from "../lib/brand";
import { Kpi, HighlightKpi, Card, ErrBox } from "../components/dashboard/ui";
import { CallDetailModal } from "../components/dashboard/CallDetailModal";
import { RouteMap } from "../components/dashboard/RouteMap";
import { BrokerMarginChart } from "../components/dashboard/BrokerMarginChart";
import { RateScatterChart } from "../components/dashboard/RateScatterChart";
import { NegotiationLadderChart } from "../components/dashboard/NegotiationLadderChart";
import { ConversionFunnel } from "../components/dashboard/ConversionFunnel";
import { EquipmentPerformance } from "../components/dashboard/EquipmentPerformance";
import { MissedOpportunities } from "../components/dashboard/MissedOpportunities";
import { RecentCallsTable } from "../components/dashboard/RecentCallsTable";

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const { summary, apiCalls, marginApi, err, loading, lastUpdated, refresh } = useDashboardData(days);

  const { liveCalls, chartCalls, isDemoMode } = useMemo(
    () => resolveDashboardCalls(apiCalls, { allowDemo: !err }),
    [apiCalls, err],
  );
  const calls = useMemo(() => enrichCalls(chartCalls), [chartCalls]);
  const tableCalls = useMemo(() => enrichCalls(liveCalls), [liveCalls]);
  const webhookCount = useMemo(
    () => liveCalls.filter((c) => c.sync_source !== "platform" && c.outcome !== "platform_run").length,
    [liveCalls],
  );
  const displaySummary = useMemo(
    () => enrichSummary(summary, calls, isDemoMode),
    [summary, calls, isDemoMode],
  );
  const analytics = useMemo(
    () => buildAnalytics(calls, displaySummary, isDemoMode),
    [calls, displaySummary, isDemoMode],
  );
  const outcomes = useMemo(() => aggregateOutcomes(calls), [calls]);
  const sentiments = useMemo(() => aggregateSentiments(calls), [calls]);
  const rounds = useMemo(() => aggregateRounds(calls), [calls]);
  const marginSeries = useMemo(() => {
    const fromCalls = buildMarginSeries(calls);
    if (!isDemoMode) return fromCalls.length > 0 ? fromCalls : marginApi;
    return marginApi.length >= fromCalls.length ? marginApi : fromCalls;
  }, [marginApi, calls, isDemoMode]);

  const marketDiscount = displaySummary
    ? formatMarketDiscount(displaySummary.rate_delta_pct)
    : null;

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  const { trends } = analytics;

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "flex-start", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: BRAND.navy, fontWeight: 800 }}>
            Acme Logistics Carrier Operations
          </h1>
          <p style={{ margin: "4px 0 0", color: BRAND.muted, fontSize: 13 }}>
            Powered by HappyRobot · Ops intelligence · auto-refresh 30s
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {loading ? "Updating…" : `Updated ${updatedLabel}`}
          </span>
          <button
            type="button"
            onClick={() => refresh()}
            style={{
              ...selectStyle, cursor: "pointer", fontWeight: 600,
              background: BRAND.blue, color: BRAND.white, border: "none",
            }}
          >
            Refresh
          </button>
          <label style={{ color: "var(--muted)", fontSize: 13 }}>Window</label>
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
        <Kpi label="Total calls" value={displaySummary?.total_calls ?? "—"} trend={trends.total_calls} />
        <Kpi label="Loads booked" value={displaySummary?.booked_loads ?? "—"} trend={trends.booked_loads} tint={BRAND.green} />
        <Kpi
          label="Booking rate"
          value={displaySummary ? `${displaySummary.booking_rate}%` : "—"}
          tint={BRAND.green}
          trend={trends.booking_rate}
        />
        <Kpi
          label="Total broker margin"
          value={displaySummary ? fmtMoney(displaySummary.total_broker_margin) : "—"}
          tint={BRAND.greenDark}
          trend={trends.total_broker_margin}
        />
        <Kpi
          label="Yield (margin/mile)"
          value={analytics.yield_per_mile ? `$${analytics.yield_per_mile}/mi` : "—"}
          tint={BRAND.blue}
          trend={trends.yield_per_mile}
        />
        <HighlightKpi
          label="Platform Savings"
          value={fmtMoney(analytics.ai_roi)}
          sublabel={`${fmtMoney(analytics.human_cost_savings)} agent labor + ${fmtMoney(analytics.extra_margin_captured)} margin`}
          trend={trends.ai_roi}
        />
        <Kpi label="Avg agreed rate" value={displaySummary ? fmtMoney(displaySummary.avg_agreed_rate) : "—"} trend={trends.avg_agreed_rate} positiveIsGood={false} />
        <Kpi
          label="Extra Margin %"
          value={marketDiscount ? marketDiscount.display : "—"}
          tint={marketDiscount?.isGood ? BRAND.greenBright : BRAND.danger}
          trend={trends.rate_delta_pct}
          positiveIsGood={false}
        />
        <Kpi label="Avg rounds" value={displaySummary?.avg_negotiation_rounds ?? "—"} trend={trends.avg_negotiation_rounds} positiveIsGood={false} />
        <Kpi label="Avg call (sec)" value={displaySummary?.avg_call_seconds ?? "—"} trend={trends.avg_call_seconds} positiveIsGood={false} />
        <Kpi
          label="FMCSA reject %"
          value={displaySummary ? `${displaySummary.fmcsa_rejection_rate}%` : "—"}
          tint={BRAND.danger}
          trend={trends.fmcsa_rejection_rate}
          positiveIsGood={false}
        />
      </div>

      <RouteMap
        calls={calls}
        selectedId={selected?.id ?? null}
        onSelectRoute={setSelected}
      />

      <div style={chartGrid}>
        <ConversionFunnel steps={analytics.funnel} />
        <EquipmentPerformance data={analytics.equipment} />
        <MissedOpportunities rows={analytics.missed_opportunities} />

        <Card title="Calls by outcome">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={outcomes}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
              <XAxis dataKey="outcome" stroke={chartAxisColor} fontSize={10} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis stroke={chartAxisColor} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {outcomes.map((d, i) => (
                  <Cell key={i} fill={OUTCOME_COLORS[d.outcome] ?? "#94a3b8"} />
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
                  <Cell key={i} fill={SENTIMENT_COLORS[d.sentiment] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, _n: string, item: { payload?: { sentiment?: string } }) =>
                  [`${value} call${value === 1 ? "" : "s"}`, item.payload?.sentiment ?? ""]}
              />
              <Legend wrapperStyle={{ color: chartAxisColor, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Negotiation rounds distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rounds}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
              <XAxis dataKey="rounds" stroke={chartAxisColor} fontSize={11} />
              <YAxis stroke={chartAxisColor} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill={BRAND.blueAccent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <BrokerMarginChart data={marginSeries} />
        <RateScatterChart calls={calls} />
        <NegotiationLadderChart calls={calls} selectedId={selected?.id ?? null} />
      </div>

      <RecentCallsTable
        calls={tableCalls}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        isDemoMode={isDemoMode}
        liveCount={liveCalls.length}
        webhookCount={webhookCount}
      />

      <CallDetailModal call={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
