// Tiny API client. Reads base URL & API key from Vite env vars at build time.

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

// Token endpoint doesn't require X-API-Key (it's called from browser pre-auth)
export async function fetchVoiceToken(): Promise<{ url: string; token: string }> {
  const res = await fetch(`${BASE}/api/voice/token`, { method: "POST" });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  return res.json();
}
