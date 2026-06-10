import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import type { CallRecord } from "../../lib/dashboard/types";
import { tooltipStyle, OUTCOME_COLORS, chartGridStroke, chartAxisColor } from "../../lib/dashboard/theme";
import { fmtMoney } from "../../lib/dashboard/format";
import { Card } from "./ui";

type Point = {
  load_id: string;
  loadboard_rate: number;
  agreed_rate: number;
  rounds: number;
  outcome: string;
};

function toPoints(calls: CallRecord[]): Point[] {
  return calls
    .filter((c) => c.loadboard_rate > 0 && c.agreed_rate > 0)
    .map((c) => ({
      load_id: c.load_id || `#${c.id}`,
      loadboard_rate: c.loadboard_rate,
      agreed_rate: c.agreed_rate,
      rounds: c.num_counter_offers,
      outcome: c.outcome,
    }));
}

export function RateScatterChart({ calls }: { calls: CallRecord[] }) {
  const data = toPoints(calls);
  const byOutcome = data.reduce<Record<string, Point[]>>((acc, p) => {
    (acc[p.outcome] ??= []).push(p);
    return acc;
  }, {});

  return (
    <Card title="Agreed rate vs loadboard rate">
      {data.length === 0 ? (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: "80px 0", fontSize: 13 }}>
          No negotiated rates in this window yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
            <XAxis
              type="number" dataKey="loadboard_rate" name="Posted"
              stroke={chartAxisColor} fontSize={11} tickFormatter={(v) => `$${v}`}
              label={{ value: "Posted ($)", fill: chartAxisColor, fontSize: 11, dy: 12 }}
            />
            <YAxis
              type="number" dataKey="agreed_rate" name="Agreed"
              stroke={chartAxisColor} fontSize={11} tickFormatter={(v) => `$${v}`}
              label={{ value: "Agreed ($)", fill: chartAxisColor, fontSize: 11, angle: -90, dx: -8 }}
            />
            <ZAxis type="number" dataKey="rounds" range={[50, 220]} name="Rounds" />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, name: string) =>
                name === "Rounds" ? v : fmtMoney(v)}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as Point | undefined;
                return p ? `${p.load_id} · ${p.outcome}` : "";
              }}
            />
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 3000, y: 3000 }]}
              stroke={chartAxisColor}
              strokeDasharray="4 4"
              strokeOpacity={0.35}
            />
            {Object.entries(byOutcome).map(([outcome, points]) => (
              <Scatter
                key={outcome}
                name={outcome}
                data={points}
                fill={OUTCOME_COLORS[outcome] ?? "#9ca3af"}
                fillOpacity={0.85}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
