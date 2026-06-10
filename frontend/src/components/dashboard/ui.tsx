import type { KpiTrend } from "../../lib/dashboard/types";
import { BRAND } from "../../lib/brand";
import { OUTCOME_COLORS, SENTIMENT_COLORS } from "../../lib/dashboard/theme";

const cardStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
};

function trendColor(trend: KpiTrend, positiveIsGood = true): string {
  if (trend.direction === "flat") return BRAND.muted;
  const good = positiveIsGood ? trend.direction === "up" : trend.direction === "down";
  return good ? BRAND.greenBright : BRAND.danger;
}

export function Kpi({
  label, value, tint, trend, positiveIsGood = true,
}: {
  label: string;
  value: React.ReactNode;
  tint?: string;
  trend?: KpiTrend;
  positiveIsGood?: boolean;
}) {
  return (
    <div style={{ ...cardStyle, padding: "14px 16px", borderTop: `3px solid ${tint ?? BRAND.blue}` }}>
      <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tint ?? "var(--text)", lineHeight: 1.2 }}>{value}</div>
      {trend && (
        <div style={{ fontSize: 10, marginTop: 6, fontWeight: 600, color: trendColor(trend, positiveIsGood) }}>
          {trend.label}
        </div>
      )}
    </div>
  );
}

export function HighlightKpi({
  label, value, sublabel, trend,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  trend?: KpiTrend;
}) {
  return (
    <div style={{
      ...cardStyle,
      padding: "14px 16px",
      background: `linear-gradient(135deg, ${BRAND.orangeLight} 0%, ${BRAND.white} 100%)`,
      border: `2px solid ${BRAND.orange}`,
      borderRadius: 12,
    }}>
      <div style={{ color: BRAND.orange, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy, marginTop: 4 }}>{value}</div>
      {sublabel && <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 2 }}>{sublabel}</div>}
      {trend && (
        <div style={{ fontSize: 10, marginTop: 6, fontWeight: 600, color: BRAND.greenBright }}>
          {trend.label}
        </div>
      )}
    </div>
  );
}

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 600 }}>{title}</div>
        {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function Tag({ color, text }: { color?: string; text: string }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, fontSize: 11,
      background: (color ?? BRAND.muted) + "22", color: color ?? BRAND.muted, fontWeight: 600,
    }}>{text}</span>
  );
}

export function OutcomeTag({ outcome }: { outcome: string }) {
  return <Tag color={OUTCOME_COLORS[outcome]} text={outcome} />;
}

export function SentimentTag({ sentiment }: { sentiment: string }) {
  return <Tag color={SENTIMENT_COLORS[sentiment]} text={sentiment} />;
}

export function ErrBox({ text }: { text: string }) {
  return (
    <div style={{
      background: "#fef2f2", border: `1px solid ${BRAND.danger}`, color: "#991b1b",
      padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13,
    }}>
      <strong>API error:</strong> {text}
    </div>
  );
}
