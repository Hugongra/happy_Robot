import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CallRecord, MarginPoint, Summary } from "../lib/dashboard/types";

const REFRESH_MS = 30_000;

function errorMessage(reason: unknown, label: string): string {
  if (reason instanceof Error) return reason.message;
  return `${label} failed`;
}

export function useDashboardData(days: number) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [apiCalls, setApiCalls] = useState<CallRecord[]>([]);
  const [marginApi, setMarginApi] = useState<MarginPoint[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async (silent = false, runSync = false) => {
    if (!silent) setLoading(true);
    try {
      const [summaryResult, callsResult, marginResult] = await Promise.allSettled([
        api<Summary>(`/api/metrics/summary?days=${days}`),
        api<CallRecord[]>(`/api/metrics/recent-calls?days=${days}&limit=25`),
        api<MarginPoint[]>(`/api/metrics/margin-evolution?days=${days}&limit=50`),
      ]);

      const errors: string[] = [];
      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      } else {
        errors.push(errorMessage(summaryResult.reason, "summary"));
      }
      if (callsResult.status === "fulfilled") {
        setApiCalls(callsResult.value);
      } else {
        errors.push(errorMessage(callsResult.reason, "recent calls"));
      }
      if (marginResult.status === "fulfilled") {
        setMarginApi(marginResult.value);
      }

      const coreOk = summaryResult.status === "fulfilled" || callsResult.status === "fulfilled";
      if (coreOk) {
        setLastUpdated(new Date());
        setErr(errors.length ? `Partial refresh: ${errors.join("; ")}` : "");
      } else if (errors.length) {
        setErr(errors.join("; "));
      }

      if (runSync && coreOk) {
        api("/api/metrics/sync-happyrobot", { method: "POST" })
          .then(async () => {
            const [s, c, m] = await Promise.allSettled([
              api<Summary>(`/api/metrics/summary?days=${days}`),
              api<CallRecord[]>(`/api/metrics/recent-calls?days=${days}&limit=25`),
              api<MarginPoint[]>(`/api/metrics/margin-evolution?days=${days}&limit=50`),
            ]);
            if (s.status === "fulfilled") setSummary(s.value);
            if (c.status === "fulfilled") setApiCalls(c.value);
            if (m.status === "fulfilled") setMarginApi(m.value);
            if (s.status === "fulfilled" || c.status === "fulfilled" || m.status === "fulfilled") {
              setLastUpdated(new Date());
            }
          })
          .catch(() => {});
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData(false, true);
    const id = setInterval(() => fetchData(true, true), REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  return {
    summary,
    apiCalls,
    marginApi,
    err,
    loading,
    lastUpdated,
    refresh: () => fetchData(false, true),
  };
}
