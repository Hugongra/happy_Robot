import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CallRecord, Summary } from "../lib/dashboard/types";

const REFRESH_MS = 30_000;
const LIVE_REFRESH_MS = 5_000;

function errorMessage(reason: unknown, label: string): string {
  if (reason instanceof Error) return reason.message;
  return `${label} failed`;
}

const ALL_TIME_DAYS = 365;
const ALL_TIME_LIMIT = 500;

export function useDashboardData(days: number, liveMode = false) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [apiCalls, setApiCalls] = useState<CallRecord[]>([]);
  const [allTimeCalls, setAllTimeCalls] = useState<CallRecord[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async (silent = false, runSync = false) => {
    if (!silent) setLoading(true);
    try {
      const [summaryResult, callsResult, allTimeResult] = await Promise.allSettled([
        api<Summary>(`/api/metrics/summary?days=${days}`),
        api<CallRecord[]>(`/api/metrics/recent-calls?days=${days}&limit=25`),
        api<CallRecord[]>(`/api/metrics/recent-calls?days=${ALL_TIME_DAYS}&limit=${ALL_TIME_LIMIT}`),
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
      if (allTimeResult.status === "fulfilled") {
        setAllTimeCalls(allTimeResult.value);
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
            const [s, c, allTime] = await Promise.allSettled([
              api<Summary>(`/api/metrics/summary?days=${days}`),
              api<CallRecord[]>(`/api/metrics/recent-calls?days=${days}&limit=25`),
              api<CallRecord[]>(`/api/metrics/recent-calls?days=${ALL_TIME_DAYS}&limit=${ALL_TIME_LIMIT}`),
            ]);
            if (s.status === "fulfilled") setSummary(s.value);
            if (c.status === "fulfilled") setApiCalls(c.value);
            if (allTime.status === "fulfilled") setAllTimeCalls(allTime.value);
            if (s.status === "fulfilled" || c.status === "fulfilled") {
              setLastUpdated(new Date());
            }
          })
          .catch(() => {});
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [days]);

  const refreshMs = liveMode ? LIVE_REFRESH_MS : REFRESH_MS;

  useEffect(() => {
    fetchData(false, true);
    const id = setInterval(() => fetchData(true, true), refreshMs);
    return () => clearInterval(id);
  }, [fetchData, refreshMs]);

  return {
    summary,
    apiCalls,
    allTimeCalls,
    err,
    loading,
    lastUpdated,
    refresh: () => fetchData(false, true),
  };
}
