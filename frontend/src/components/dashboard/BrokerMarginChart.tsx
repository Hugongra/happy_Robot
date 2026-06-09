import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import type { MarginPoint } from "../../lib/dashboard/types";
import { tooltipStyle } from "../../lib/dashboard/theme";
import { fmtMoney } from "../../lib/dashboard/format";
import { Card } from "./ui";

export function BrokerMarginChart({ data }: { data: MarginPoint[] }) {
  return (
    <Card title="Broker margin evolution">
      {data.length === 0 ? (
        <div style={{ color: "#8a9ab2", textAlign: "center", padding: "80px 0", fontSize: 13 }}>
          No booked loads with margin data in this window.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#19c37d" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#19c37d" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ea1ff" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#4ea1ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2c4a" />
            <XAxis dataKey="label" stroke="#8a9ab2" fontSize={11} />
            <YAxis stroke="#8a9ab2" fontSize={11} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [
                fmtMoney(value),
                name === "cumulative_margin" ? "Cumulative margin" : "Call margin",
              ]}
            />
            <Legend wrapperStyle={{ color: "#8a9ab2", fontSize: 12 }} />
            <Area type="monotone" dataKey="margin" name="Call margin" stroke="#19c37d" fill="url(#marginGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="cumulative_margin" name="Cumulative margin" stroke="#4ea1ff" fill="url(#cumGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
