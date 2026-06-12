import type { CallRecord } from "../../lib/dashboard/types";
import { fmtMoney, getLastCarrierOffer } from "../../lib/dashboard/format";
import { BRAND } from "../../lib/brand";

type Step = {
  label: string;
  amount: number;
  kind: "posted" | "carrier" | "final" | "last";
};

function buildSteps(call: CallRecord): Step[] {
  const steps: Step[] = [];
  if (call.loadboard_rate > 0) {
    steps.push({ label: "Posted", amount: call.loadboard_rate, kind: "posted" });
  }

  const offers = call.counter_offers ?? [];
  let round = 0;
  for (let i = 0; i < offers.length; i += 2) {
    round += 1;
    steps.push({ label: `R${round}`, amount: offers[i], kind: "carrier" });
  }

  if (call.agreed_rate > 0 && call.outcome === "load_booked") {
    const last = steps[steps.length - 1];
    if (!last || last.amount !== call.agreed_rate || last.kind !== "carrier") {
      steps.push({ label: "Final", amount: call.agreed_rate, kind: "final" });
    } else {
      last.label = "Final";
      last.kind = "final";
    }
  } else {
    const lastAsk = getLastCarrierOffer(call);
    if (lastAsk) {
      steps.push({ label: "Last ask", amount: lastAsk, kind: "last" });
    }
  }

  return steps;
}

const STEP_COLORS: Record<Step["kind"], string> = {
  posted: BRAND.muted,
  carrier: BRAND.warn,
  final: BRAND.greenDark,
  last: BRAND.danger,
};

export function NegotiationLadderSteps({ call }: { call: CallRecord }) {
  const steps = buildSteps(call);

  if (steps.length === 0) {
    return (
      <div style={{ fontSize: 13, color: BRAND.muted, fontStyle: "italic" }}>
        No negotiation rounds recorded for this call.
      </div>
    );
  }

  const max = Math.max(...steps.map((s) => s.amount));

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        minWidth: steps.length * 72,
      }}>
        {steps.map((step, i) => {
          const height = max > 0 ? Math.max(28, (step.amount / max) * 72) : 28;
          return (
            <div
              key={`${step.label}-${i}`}
              style={{ flex: "1 1 0", minWidth: 64, textAlign: "center" }}
            >
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: BRAND.text,
                marginBottom: 4,
              }}>
                {fmtMoney(step.amount)}
              </div>
              <div style={{
                height,
                margin: "0 auto",
                width: "100%",
                maxWidth: 48,
                borderRadius: "6px 6px 2px 2px",
                background: STEP_COLORS[step.kind],
                opacity: step.kind === "posted" ? 0.45 : 1,
              }} />
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                color: BRAND.muted,
                marginTop: 6,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
