import { BRAND } from "../brand";

export const OUTCOME_COLORS: Record<string, string> = {
  load_booked: BRAND.green,
  price_rejected: BRAND.warn,
  no_interest: BRAND.muted,
  carrier_ineligible: BRAND.danger,
  transferred: BRAND.blueAccent,
  other: "#94a3b8",
  platform_run: "#64748b",
};

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: BRAND.green,
  neutral: BRAND.muted,
  negative: BRAND.danger,
};

export const tooltipStyle: React.CSSProperties = {
  background: BRAND.white,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: BRAND.text,
  boxShadow: "var(--shadow-md)",
};

export const selectStyle: React.CSSProperties = {
  background: BRAND.white,
  color: BRAND.text,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
};

export const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

export const chartGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 16,
  marginBottom: 16,
};

export const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

export const chartGridStroke = BRAND.border;
export const chartAxisColor = BRAND.muted;
