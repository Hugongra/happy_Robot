import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend,
} from "recharts";
import type { EquipmentStat } from "../../lib/dashboard/types";
import { tooltipStyle, chartGridStroke, chartAxisColor } from "../../lib/dashboard/theme";
import { BRAND } from "../../lib/brand";
import { fmtMoney } from "../../lib/dashboard/format";
import { Card } from "./ui";

const EQUIP_COLORS = [BRAND.green, BRAND.blueAccent, BRAND.warn, BRAND.info, BRAND.muted];

export function EquipmentPerformance({ data }: { data: EquipmentStat[] }) {
  if (data.length === 0) {
    return (
      <Card title="Equipment performance">
        <div style={{ color: "var(--muted)", textAlign: "center", padding: "60px 0", fontSize: 13 }}>
          No equipment data in this window.
        </div>
      </Card>
    );
  }

  return (
    <Card title="Equipment performance">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
          <XAxis dataKey="equipment" stroke={chartAxisColor} fontSize={11} />
          <YAxis yAxisId="margin" stroke={chartAxisColor} fontSize={11} tickFormatter={(v) => `$${v}`} />
          <YAxis yAxisId="rate" orientation="right" stroke={chartAxisColor} fontSize={11} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) =>
              name === "booking_rate" ? `${value}%` : fmtMoney(value)}
          />
          <Legend wrapperStyle={{ color: chartAxisColor, fontSize: 11 }} />
          <Bar yAxisId="margin" dataKey="avg_margin" name="Avg margin" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={EQUIP_COLORS[i % EQUIP_COLORS.length]} />
            ))}
          </Bar>
          <Bar yAxisId="rate" dataKey="booking_rate" name="Booking rate %" fill={BRAND.blue} fillOpacity={0.35} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
