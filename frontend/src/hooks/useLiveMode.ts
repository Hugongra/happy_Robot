import { useCallback, useState } from "react";

const STORAGE_KEY = "dashboard-live-mode";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useLiveMode() {
  const [liveMode, setLiveModeState] = useState(readStored);

  const setLiveMode = useCallback((value: boolean) => {
    setLiveModeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
  }, []);

  return [liveMode, setLiveMode] as const;
}
