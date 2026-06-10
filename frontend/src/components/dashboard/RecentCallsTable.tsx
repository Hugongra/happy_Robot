import { useMemo, useState } from "react";
import type { CallRecord } from "../../lib/dashboard/types";
import { fmtMoney, fmtWhen, getLastCarrierOffer } from "../../lib/dashboard/format";
import { tableStyle, selectStyle, OUTCOME_COLORS } from "../../lib/dashboard/theme";
import { BRAND } from "../../lib/brand";
import { outcomeLabel } from "../../lib/dashboard/cityCoords";
import { Card, OutcomeTag, SentimentTag } from "./ui";

type Props = {
  calls: CallRecord[];
  selectedId: number | null;
  onSelect: (call: CallRecord) => void;
  isDemoMode?: boolean;
  liveCount?: number;
  webhookCount?: number;
};

function SourceBadge({ isDemoMode, liveCount, webhookCount }: { isDemoMode: boolean; liveCount: number; webhookCount: number }) {
  if (isDemoMode) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 600, color: BRAND.warn,
        background: BRAND.orangeLight, padding: "3px 8px", borderRadius: 999,
      }}>
        Demo data — no live calls yet
      </span>
    );
  }
  const pending = Math.max(liveCount - webhookCount, 0);
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: BRAND.greenDark,
      background: BRAND.greenLight, padding: "3px 8px", borderRadius: 999,
    }}>
      Live · {liveCount} HappyRobot run{liveCount === 1 ? "" : "s"}
      {pending > 0 ? ` (${webhookCount} synced, ${pending} awaiting webhook)` : ""}
    </span>
  );
}

function AgreedCell({ call }: { call: CallRecord }) {
  if (call.agreed_rate > 0) {
    return (
      <span style={{ color: BRAND.greenDark, fontWeight: 600 }}>
        {fmtMoney(call.agreed_rate)}
      </span>
    );
  }
  if (call.outcome === "price_rejected" || call.outcome === "no_interest") {
    const last = call.last_carrier_offer ?? getLastCarrierOffer(call);
    if (last) {
      return (
        <span style={{ color: BRAND.danger, fontWeight: 600, fontSize: 12 }}>
          Asked {fmtMoney(last)}
        </span>
      );
    }
  }
  return <span style={{ color: "var(--muted)" }}>—</span>;
}

function TransferCell({ call }: { call: CallRecord }) {
  if (call.outcome !== "load_booked") return <span style={{ color: "var(--muted)" }}>—</span>;
  if (call.transfer_status === "successful") {
    return (
      <span title="Transfer to Sales Rep: Successful" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        <span style={{ color: BRAND.green }}>🟢</span>
        <span style={{ color: BRAND.greenDark, fontWeight: 600, marginLeft: 4 }}>Transferred</span>
      </span>
    );
  }
  if (call.transfer_status === "failed") {
    return <span style={{ color: BRAND.danger, fontSize: 12 }}>🔴 Failed</span>;
  }
  return <span style={{ color: BRAND.warn, fontSize: 12 }}>⏳ Pending</span>;
}

export function RecentCallsTable({
  calls, selectedId, onSelect, isDemoMode = false, liveCount = 0, webhookCount = 0,
}: Props) {
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  const outcomes = useMemo(() => {
    const set = new Set(calls.map((c) => c.outcome));
    return ["all", ...Array.from(set).sort()];
  }, [calls]);

  const filtered = useMemo(
    () => (outcomeFilter === "all" ? calls : calls.filter((c) => c.outcome === outcomeFilter)),
    [calls, outcomeFilter],
  );

  return (
    <Card
      title="Call logs"
      action={
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <SourceBadge isDemoMode={isDemoMode} liveCount={liveCount} webhookCount={webhookCount} />
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            style={{ ...selectStyle, fontSize: 11, padding: "4px 8px" }}
          >
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {o === "all" ? "All outcomes" : outcomeLabel(o)}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{filtered.length} rows</span>
        </div>
      }
    >
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left", fontSize: 12 }}>
              <th>When</th><th>MC</th><th>Carrier</th><th>Load</th><th>Lane</th>
              <th>Equip</th><th style={{ textAlign: "right" }}>Posted</th>
              <th style={{ textAlign: "right" }}>Agreed / Last ask</th>
              <th style={{ textAlign: "right" }}>Margin</th>
              <th style={{ textAlign: "right" }}>Rounds</th>
              <th>Transfer</th>
              <th>Outcome</th><th>Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const margin = r.broker_margin ?? Math.max(r.loadboard_rate - r.agreed_rate, 0);
              const active = selectedId === r.id;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r)}
                  style={{
                    borderTop: `1px solid ${BRAND.border}`,
                    fontSize: 13,
                    cursor: "pointer",
                    background: active ? BRAND.greenLight : "transparent",
                    boxShadow: active ? `inset 3px 0 0 ${OUTCOME_COLORS[r.outcome] ?? BRAND.muted}` : undefined,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--panel-2)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <td>
                    {fmtWhen(r.created_at)}
                  </td>
                  <td>{r.mc_number}</td>
                  <td>
                    {r.carrier_name || "—"}
                    {r.sync_source === "platform" && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: BRAND.warn, fontWeight: 600 }}>
                        HR
                      </span>
                    )}
                  </td>
                  <td>{r.load_id || "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{r.origin} → {r.destination}</td>
                  <td>{r.equipment_type}</td>
                  <td style={{ textAlign: "right" }}>{r.loadboard_rate ? fmtMoney(r.loadboard_rate) : "—"}</td>
                  <td style={{ textAlign: "right" }}><AgreedCell call={r} /></td>
                  <td style={{ textAlign: "right", color: margin ? BRAND.greenDark : "var(--muted)" }}>
                    {margin ? fmtMoney(margin) : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.num_counter_offers}</td>
                  <td><TransferCell call={r} /></td>
                  <td><OutcomeTag outcome={r.outcome} /></td>
                  <td><SentimentTag sentiment={r.sentiment} /></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>
                  {isDemoMode
                    ? "No calls in this window. Make a test call or check the HappyRobot post-call webhook."
                    : "No calls match this filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
