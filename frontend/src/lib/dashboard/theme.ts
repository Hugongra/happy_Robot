export const OUTCOME_COLORS: Record<string, string> = {
  load_booked: "#19c37d",
  price_rejected: "#ffae42",
  no_interest: "#8a9ab2",
  carrier_ineligible: "#ff6b6b",
  transferred: "#4ea1ff",
  other: "#6b7280",
};

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#19c37d",
  neutral: "#8a9ab2",
  negative: "#ff6b6b",
};

export const tooltipStyle: React.CSSProperties = {
  background: "#111a2e",
  border: "1px solid #1f2c4a",
  borderRadius: 8,
  fontSize: 12,
};

export const selectStyle: React.CSSProperties = {
  background: "#18233d",
  color: "#e6ecf5",
  border: "1px solid #1f2c4a",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
};

export const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

export const chartGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
  gap: 16,
  marginBottom: 16,
};

export const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};
