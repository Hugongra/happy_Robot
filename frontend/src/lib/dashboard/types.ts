export type TransferStatus = "successful" | "failed" | "pending" | "n/a";

export type SyncSource = "webhook" | "platform";

export type CallRecord = {
  id: number;
  run_id?: string;
  sync_source?: SyncSource;
  platform_status?: string;
  created_at: string;
  mc_number: string;
  carrier_name: string;
  carrier_eligible?: boolean;
  load_id: string;
  origin: string;
  destination: string;
  equipment_type: string;
  loadboard_rate: number;
  agreed_rate: number;
  num_counter_offers: number;
  counter_offers?: number[];
  outcome: string;
  sentiment: string;
  duration_seconds: number;
  broker_margin?: number;
  miles?: number;
  transfer_status?: TransferStatus;
  last_carrier_offer?: number;
  transcript?: string;
  classification_reasoning?: string;
  isDemo?: boolean;
};

export type Summary = {
  window_days: number;
  total_calls: number;
  booked_loads: number;
  booking_rate: number;
  avg_agreed_rate: number;
  avg_loadboard_rate: number;
  rate_delta_pct: number;
  avg_negotiation_rounds: number;
  avg_call_seconds: number;
  fmcsa_rejection_rate: number;
  total_broker_margin: number;
};

export type OutcomeCount = { outcome: string; count: number };
export type SentimentCount = { sentiment: string; count: number };
export type RoundCount = { rounds: number; count: number };
export type MarginPoint = {
  date: string;
  label: string;
  margin: number;
  cumulative_margin: number;
  load_id: string;
};

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  pct_of_total: number;
  drop_label?: string;
};

export type EquipmentStat = {
  equipment: string;
  calls: number;
  booked: number;
  booking_rate: number;
  avg_margin: number;
  total_margin: number;
};

export type MissedOpportunity = {
  origin: string;
  destination: string;
  equipment: string;
  requests: number;
  last_requested: string;
  sample_carrier?: string;
};

export type KpiTrend = {
  delta_pct: number;
  direction: "up" | "down" | "flat";
  label: string;
};

export type DashboardAnalytics = {
  yield_per_mile: number;
  total_booked_miles: number;
  ai_roi: number;
  human_cost_savings: number;
  extra_margin_captured: number;
  funnel: FunnelStep[];
  equipment: EquipmentStat[];
  missed_opportunities: MissedOpportunity[];
  trends: Record<string, KpiTrend>;
};
