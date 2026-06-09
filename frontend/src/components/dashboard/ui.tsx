import { OUTCOME_COLORS, SENTIMENT_COLORS } from "../../lib/dashboard/theme";

export function Kpi({ label, value, tint }: { label: string; value: React.ReactNode; tint?: string }) {
  return (
    <div style={{ background: "#111a2e", border: "1px solid #1f2c4a", borderRadius: 12, padding: 16 }}>
      <div style={{ color: "#8a9ab2", fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tint ?? "#e6ecf5" }}>{value}</div>
    </div>
  );
}

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "#111a2e", border: "1px solid #1f2c4a", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: "#8a9ab2" }}>{title}</div>
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
      background: (color ?? "#6b7280") + "33", color: color ?? "#6b7280", fontWeight: 600,
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
      background: "#3a1a1a", border: "1px solid #ff6b6b", color: "#ffb4b4",
      padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13,
    }}>
      <strong>API error:</strong> {text}
    </div>
  );
}
