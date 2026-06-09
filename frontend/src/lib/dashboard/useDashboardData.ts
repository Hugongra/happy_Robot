import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { CallRecord, MarginPoint, Summary } from "./types";

const REFRESH_MS = 30_000;

export function useDashboardData(days: number) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [apiCalls, setApiCalls] = useState<CallRecord[]>([]);
  const [marginApi, setMarginApi] = useState<MarginPoint[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [s, rc] = await Promise.all([
        api<Summary>(`/api/metrics/summary?days=${days}`),
        api<CallRecord[]>(`/api/metrics/recent-calls?days=${days}&limit=25`),
      ]);
      setSummary(s);
      setApiCalls(rc);
      setErr("");
      setLastUpdated(new Date());

      try {
        const mg = await api<MarginPoint[]>(`/api/metrics/margin-evolution?days=${days}&limit=50`);
        setMarginApi(mg);
      } catch {
        setMarginApi([]);
      }
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
    const id = setInterval(() => fetchData(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  return { summary, apiCalls, marginApi, err, loading, lastUpdated, refresh: () => fetchData() };
}
