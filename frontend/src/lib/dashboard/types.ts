export type CallRecord = {
  id: number;
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

export type RouteLane = {
  id: number;
  origin: string;
  destination: string;
  outcome: string;
  load_id: string;
};
