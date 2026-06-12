import { useCallback, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import type { CallRecord } from "../lib/dashboard/types";
import {
  resolveDashboardCalls, aggregateOutcomes, aggregateSentiments,
  aggregateRounds, enrichSummary,
} from "../lib/dashboard/mockData";
import {
  buildAnalytics, computeRoiDefaults, countHiddenTestCalls,
  countInProgressCalls, enrichCalls, filterRealCalls,
} from "../lib/dashboard/analytics";
import { useDashboardData } from "../hooks/useDashboardData";
import { useLiveMode } from "../hooks/useLiveMode";
import { fmtMoney, formatNegotiationSavings } from "../lib/dashboard/format";
import {
  OUTCOME_COLORS, SENTIMENT_COLORS, tooltipStyle, selectStyle, kpiGrid, chartGrid,
  chartGridStroke, chartAxisColor,
} from "../lib/dashboard/theme";
import { BRAND } from "../lib/brand";
import { Kpi, Card, ErrBox } from "../components/dashboard/ui";
import { CallDetailModal } from "../components/dashboard/CallDetailModal";
import { RouteMap } from "../components/dashboard/RouteMap";
import { RateScatterChart } from "../components/dashboard/RateScatterChart";
import { NegotiationLadderChart } from "../components/dashboard/NegotiationLadderChart";
import { ConversionFunnel } from "../components/dashboard/ConversionFunnel";
import { EquipmentPerformance } from "../components/dashboard/EquipmentPerformance";
import { MissedOpportunities } from "../components/dashboard/MissedOpportunities";
import { PlatformSavingsSection } from "../components/dashboard/PlatformSavingsSection";
import { RecentCallsTable } from "../components/dashboard/RecentCallsTable";

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const [hideTestCalls, setHideTestCalls] = useState(true);
  const [liveMode, setLiveMode] = useLiveMode();
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const { summary, apiCalls, err, loading, lastUpdated, refresh } = useDashboardData(days, liveMode);

  const { liveCalls, chartCalls, isDemoMode } = useMemo(
    () => resolveDashboardCalls(apiCalls, { allowDemo: !err }),
    [apiCalls, err],
  );
  const filteredChartCalls = useMemo(
    () => filterRealCalls(chartCalls, hideTestCalls),
    [chartCalls, hideTestCalls],
  );
  const filteredLiveCalls = useMemo(
    () => filterRealCalls(liveCalls, hideTestCalls),
    [liveCalls, hideTestCalls],
  );
  const hiddenTestCount = useMemo(
    () => (hideTestCalls ? countHiddenTestCalls(chartCalls) : 0),
    [chartCalls, hideTestCalls],
  );
  const calls = useMemo(() => enrichCalls(filteredChartCalls), [filteredChartCalls]);
  const tableCalls = useMemo(() => enrichCalls(filteredLiveCalls), [filteredLiveCalls]);
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
  const roiDefaults = useMemo(
    () => computeRoiDefaults(calls, displaySummary, days),
    [calls, displaySummary, days],
  );
  const outcomes = useMemo(() => aggregateOutcomes(calls), [calls]);
  const sentiments = useMemo(() => aggregateSentiments(calls), [calls]);
  const rounds = useMemo(() => aggregateRounds(calls), [calls]);

  const negotiationSavings = displaySummary?.rate_delta_pct != null
    ? formatNegotiationSavings(displaySummary.rate_delta_pct)
    : null;
  const inProgressCount = useMemo(
    () => (isDemoMode ? 0 : countInProgressCalls(liveCalls)),
    [isDemoMode, liveCalls],
  );

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  const { trends } = analytics;

  const handleSelectCall = useCallback(async (call: CallRecord) => {
    setSelected(call);
    if (call.id > 0) {
      try {
        const detail = await api<CallRecord>(`/api/metrics/calls/${call.id}`);
        setSelected((prev) => (prev?.id === call.id ? { ...call, ...detail } : prev));
      } catch {
        /* keep list row data */
      }
    }
  }, []);

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "flex-start", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: BRAND.navy, fontWeight: 800 }}>
            Acme Logistics Carrier Operations
          </h1>
          <p style={{ margin: "4px 0 0", color: BRAND.muted, fontSize: 13 }}>
            Powered by HappyRobot · Ops intelligence · auto-refresh {liveMode ? "5s" : "30s"}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {inProgressCount > 0 && (
            <span className="live-in-progress-badge">
              <span className="live-pulse-dot">●</span>
              {inProgressCount} call{inProgressCount === 1 ? "" : "s"} in progress
            </span>
          )}
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
          <label style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 13, color: "var(--muted)", cursor: "pointer", userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={liveMode}
              onChange={(e) => setLiveMode(e.target.checked)}
            />
            Live
          </label>
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
        <Kpi label="Avg agreed rate" value={displaySummary ? fmtMoney(displaySummary.avg_agreed_rate) : "—"} trend={trends.avg_agreed_rate} positiveIsGood={false} />
        <Kpi
          label="Negotiation savings"
          value={negotiationSavings ? negotiationSavings.display : "—"}
          tint={negotiationSavings?.isSavings ? BRAND.greenBright : BRAND.danger}
          trend={trends.rate_delta_pct}
          positiveIsGood
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

      <PlatformSavingsSection
        agentLaborSavings={analytics.human_cost_savings}
        marginCaptured={analytics.extra_margin_captured}
        totalCalls={displaySummary?.total_calls ?? 0}
        roiDefaults={roiDefaults}
      />

      <RouteMap
        calls={calls}
        selectedId={selected?.id ?? null}
        onSelectRoute={handleSelectCall}
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

        <RateScatterChart calls={calls} />
        <NegotiationLadderChart calls={calls} selectedId={selected?.id ?? null} />
      </div>

      <RecentCallsTable
        calls={tableCalls}
        selectedId={selected?.id ?? null}
        onSelect={handleSelectCall}
        isDemoMode={isDemoMode}
        liveCount={liveCalls.length}
        webhookCount={webhookCount}
        hideTestCalls={hideTestCalls}
        onHideTestCallsChange={setHideTestCalls}
        hiddenTestCount={hiddenTestCount}
      />

      <CallDetailModal call={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
