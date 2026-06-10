import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import type { CallRecord } from "../../lib/dashboard/types";
import { tooltipStyle, chartGridStroke, chartAxisColor } from "../../lib/dashboard/theme";
import { BRAND } from "../../lib/brand";
import { fmtMoney } from "../../lib/dashboard/format";
import { Card } from "./ui";

type LadderStep = { step: string; amount: number; kind: "carrier" | "broker" };

function buildLadder(call: CallRecord): LadderStep[] {
  const offers = call.counter_offers ?? [];
  if (offers.length === 0) return [];

  const steps: LadderStep[] = [];
  offers.forEach((amount, i) => {
    steps.push({
      step: `R${Math.ceil((i + 1) / 2)} ${i % 2 === 0 ? "Carrier" : "Broker"}`,
      amount,
      kind: i % 2 === 0 ? "carrier" : "broker",
    });
  });
  if (call.agreed_rate > 0) {
    steps.push({ step: "Final", amount: call.agreed_rate, kind: "broker" });
  }
  return steps;
}

export function NegotiationLadderChart({
  calls,
  selectedId,
}: {
  calls: CallRecord[];
  selectedId?: number | null;
}) {
  const call = (selectedId != null ? calls.find((c) => c.id === selectedId) : null)
    ?? calls.find((c) => (c.counter_offers?.length ?? 0) > 0)
    ?? calls.find((c) => c.num_counter_offers > 0);

  const ladder = call ? buildLadder(call) : [];
  const posted = call?.loadboard_rate ?? 0;

  return (
    <Card
      title="Negotiation ladder"
      action={
        call ? (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {call.load_id || call.carrier_name} · posted {posted ? fmtMoney(posted) : "—"}
          </span>
        ) : undefined
      }
    >
      {ladder.length === 0 ? (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: "80px 0", fontSize: 13 }}>
          No counter-offer sequences captured yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={ladder} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
            <XAxis type="number" stroke={chartAxisColor} fontSize={11} tickFormatter={(v) => `$${v}`} />
            <YAxis type="category" dataKey="step" stroke={chartAxisColor} fontSize={11} width={72} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
              {ladder.map((d, i) => (
                <Cell key={i} fill={d.kind === "carrier" ? BRAND.warn : BRAND.greenDark} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function NegotiationLadderInline({ call }: { call: CallRecord }) {
  const ladder = buildLadder(call);
  if (ladder.length === 0) return null;

  const max = Math.max(...ladder.map((s) => s.amount), call.loadboard_rate);

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: BRAND.greenDark,
        textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
      }}>
        Negotiation ladder
      </div>
      <div style={{
        background: BRAND.bgAlt, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 14,
      }}>
        {call.loadboard_rate > 0 && (
          <LadderRow label="Posted" amount={call.loadboard_rate} max={max} color={BRAND.muted} />
        )}
        {ladder.map((s) => (
          <LadderRow key={s.step} label={s.step} amount={s.amount} max={max}
            color={s.kind === "carrier" ? BRAND.warn : BRAND.greenDark} />
        ))}
      </div>
    </section>
  );
}

function LadderRow({ label, amount, max, color }: {
  label: string; amount: number; max: number; color: string;
}) {
  const pct = max > 0 ? (amount / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: BRAND.muted }}>{label}</span>
        <span style={{ color: BRAND.text, fontWeight: 600 }}>{fmtMoney(amount)}</span>
      </div>
      <div style={{ height: 6, background: BRAND.white, borderRadius: 999, overflow: "hidden", border: `1px solid ${BRAND.border}` }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}
