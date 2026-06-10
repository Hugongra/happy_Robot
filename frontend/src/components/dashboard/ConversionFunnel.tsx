import type { FunnelStep } from "../../lib/dashboard/types";
import { BRAND } from "../../lib/brand";
import { Card } from "./ui";

const STEP_COLORS = [BRAND.blue, BRAND.blueAccent, BRAND.info, BRAND.warn, BRAND.green];

export function ConversionFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = steps[0]?.count ?? 1;

  return (
    <Card title="Conversion funnel">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((step, i) => {
          const widthPct = max > 0 ? Math.max((step.count / max) * 100, 8) : 8;
          const color = STEP_COLORS[i] ?? BRAND.muted;
          return (
            <div key={step.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.text }}>{step.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>
                  {step.count}
                  <span style={{ color: BRAND.muted, fontWeight: 500, marginLeft: 6 }}>({step.pct_of_total}%)</span>
                </span>
              </div>
              <div style={{
                height: 28, background: BRAND.bgAlt, borderRadius: 6, overflow: "hidden",
                border: `1px solid ${BRAND.border}`,
              }}>
                <div style={{
                  width: `${widthPct}%`, height: "100%",
                  background: `linear-gradient(90deg, ${color}cc, ${color})`,
                  borderRadius: 5,
                  display: "flex", alignItems: "center", paddingLeft: 10,
                  minWidth: 40,
                  transition: "width 0.3s ease",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: BRAND.white }}>{step.count}</span>
                </div>
              </div>
              {step.drop_label && (
                <div style={{ fontSize: 10, color: BRAND.danger, marginTop: 3, fontWeight: 500 }}>
                  ↓ {step.drop_label}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
