import type { MissedOpportunity } from "../../lib/dashboard/types";
import { BRAND } from "../../lib/brand";
import { fmtWhen } from "../../lib/dashboard/format";
import { tableStyle } from "../../lib/dashboard/theme";
import { Card } from "./ui";

export function MissedOpportunities({ rows }: { rows: MissedOpportunity[] }) {
  return (
    <Card
      title="Missed opportunities"
      action={<span style={{ fontSize: 11, color: BRAND.warn, fontWeight: 600 }}>{rows.length} lanes without inventory</span>}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left", fontSize: 11 }}>
              <th>Lane</th>
              <th>Equip</th>
              <th style={{ textAlign: "center" }}>Requests</th>
              <th>Last asked</th>
              <th>Sample carrier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${BRAND.border}`, fontSize: 12 }}>
                <td style={{ fontWeight: 600, color: BRAND.text, padding: "8px 4px" }}>
                  {r.origin} → {r.destination}
                </td>
                <td>{r.equipment}</td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    background: BRAND.orangeLight, color: BRAND.orange,
                    padding: "2px 8px", borderRadius: 999, fontWeight: 700, fontSize: 11,
                  }}>
                    {r.requests}
                  </span>
                </td>
                <td style={{ color: BRAND.muted }}>{fmtWhen(r.last_requested)}</td>
                <td style={{ color: BRAND.muted }}>{r.sample_carrier ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
