import { useMemo, useState } from "react";
import type { CallRecord } from "../../lib/dashboard/types";
import { fmtMoney, fmtWhen } from "../../lib/dashboard/format";
import { tableStyle, selectStyle, OUTCOME_COLORS } from "../../lib/dashboard/theme";
import { outcomeLabel } from "../../lib/dashboard/cityCoords";
import { Card, OutcomeTag, SentimentTag } from "./ui";

type Props = {
  calls: CallRecord[];
  selectedId: number | null;
  onSelect: (call: CallRecord) => void;
};

export function RecentCallsTable({ calls, selectedId, onSelect }: Props) {
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
      title="Recent calls"
      action={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          <span style={{ fontSize: 11, color: "#8a9ab2" }}>{filtered.length} rows</span>
        </div>
      }
    >
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ color: "#8a9ab2", textAlign: "left", fontSize: 12 }}>
              <th>When</th><th>MC</th><th>Carrier</th><th>Load</th><th>Lane</th>
              <th>Equip</th><th style={{ textAlign: "right" }}>Posted</th>
              <th style={{ textAlign: "right" }}>Agreed</th>
              <th style={{ textAlign: "right" }}>Margin</th>
              <th style={{ textAlign: "right" }}>Rounds</th>
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
                    borderTop: "1px solid #1f2c4a",
                    fontSize: 13,
                    cursor: "pointer",
                    background: active ? "#18233d" : "transparent",
                    boxShadow: active ? `inset 3px 0 0 ${OUTCOME_COLORS[r.outcome] ?? "#6b7280"}` : undefined,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#141e36"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <td>
                    {fmtWhen(r.created_at)}
                    {r.isDemo && <span style={{ marginLeft: 4, fontSize: 10, color: "#4ea1ff" }}>demo</span>}
                  </td>
                  <td>{r.mc_number}</td>
                  <td>{r.carrier_name}</td>
                  <td>{r.load_id}</td>
                  <td style={{ color: "#8a9ab2" }}>{r.origin} → {r.destination}</td>
                  <td>{r.equipment_type}</td>
                  <td style={{ textAlign: "right" }}>{r.loadboard_rate ? fmtMoney(r.loadboard_rate) : "—"}</td>
                  <td style={{ textAlign: "right", color: r.agreed_rate ? "#19c37d" : "#8a9ab2" }}>
                    {r.agreed_rate ? fmtMoney(r.agreed_rate) : "—"}
                  </td>
                  <td style={{ textAlign: "right", color: margin ? "#4ea1ff" : "#8a9ab2" }}>
                    {margin ? fmtMoney(margin) : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.num_counter_offers}</td>
                  <td><OutcomeTag outcome={r.outcome} /></td>
                  <td><SentimentTag sentiment={r.sentiment} /></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} style={{ color: "#8a9ab2", textAlign: "center", padding: 24 }}>
                  No calls match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
