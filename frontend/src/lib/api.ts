// Tiny API client. Reads base URL & API key from Vite env vars at build time.

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";
const DEFAULT_TIMEOUT_MS = 45_000;

export async function api<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        ...(init.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    return res.json();
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Token endpoint requires the same X-API-Key as all other /api/* routes.
export async function fetchVoiceToken(): Promise<{ url: string; token: string }> {
  const res = await fetch(`${BASE}/api/voice/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
  });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  return res.json();
}
