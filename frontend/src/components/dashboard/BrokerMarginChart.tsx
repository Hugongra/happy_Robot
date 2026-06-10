import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import type { MarginPoint } from "../../lib/dashboard/types";
import { tooltipStyle, chartGridStroke, chartAxisColor } from "../../lib/dashboard/theme";
import { BRAND } from "../../lib/brand";
import { fmtMoney } from "../../lib/dashboard/format";
import { Card } from "./ui";

export function BrokerMarginChart({ data }: { data: MarginPoint[] }) {
  return (
    <Card title="Broker margin evolution">
      {data.length === 0 ? (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: "80px 0", fontSize: 13 }}>
          No booked loads with margin data in this window.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BRAND.green} stopOpacity={0.35} />
                <stop offset="95%" stopColor={BRAND.green} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BRAND.greenDark} stopOpacity={0.25} />
                <stop offset="95%" stopColor={BRAND.greenDark} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
            <XAxis dataKey="label" stroke={chartAxisColor} fontSize={10} angle={-20} textAnchor="end" height={52} interval={0} />
            <YAxis stroke={chartAxisColor} fontSize={11} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as MarginPoint | undefined;
                return row?.load_id ? `${label}` : String(label);
              }}
              formatter={(value: number, name: string) => [
                fmtMoney(value),
                name === "cumulative_margin" ? "Cumulative margin" : "Call margin",
              ]}
            />
            <Legend wrapperStyle={{ color: chartAxisColor, fontSize: 12 }} />
            <Area type="monotone" dataKey="margin" name="Call margin" stroke={BRAND.green} fill="url(#marginGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="cumulative_margin" name="Cumulative margin" stroke={BRAND.greenDark} fill="url(#cumGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
