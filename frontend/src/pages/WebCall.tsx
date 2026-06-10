import { useCallback, useRef, useState } from "react";
import { HappyRobotVoiceClient } from "@happyrobot-ai/sdk/voice";
import type { VoiceConnection } from "@happyrobot-ai/sdk/voice";
import { fetchVoiceToken } from "../lib/api";
import { BRAND } from "../lib/brand";

type CallState = "idle" | "connecting" | "in-call" | "ending";

export function WebCallPage() {
  const [state, setState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string>("");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const connectionRef = useRef<VoiceConnection | null>(null);

  const start = useCallback(async () => {
    try {
      setError("");
      setState("connecting");
      const { url, token } = await fetchVoiceToken();
      const client = new HappyRobotVoiceClient({ url, token });
      const conn = await client.connect({
        onConnected: () => setState("in-call"),
        onDisconnected: () => { setState("idle"); setMuted(false); connectionRef.current = null; },
        onAgentConnected: () => {},
        onError: (e) => setError(String(e)),
      });
      connectionRef.current = conn;
    } catch (e: any) {
      setError(e?.message ?? "Failed to start call");
      setState("idle");
    }
  }, []);

  const end = useCallback(async () => {
    setState("ending");
    await connectionRef.current?.disconnect();
    connectionRef.current = null;
    setState("idle"); setMuted(false);
  }, []);

  const toggleMute = useCallback(async () => {
    const c = connectionRef.current;
    if (!c) return;
    if (muted) { await c.unmute(); setMuted(false); } else { await c.mute(); setMuted(true); }
  }, [muted]);

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
      <img
        src="/acme-logo.png"
        alt="Acme Logistics"
        style={{ height: 72, marginBottom: 24 }}
      />
      <h1 style={{ fontSize: 28, margin: "0 0 8px", color: BRAND.text }}>Call our Carrier Desk</h1>
      <p style={{ color: BRAND.muted, margin: "0 0 36px" }}>
        Connect by voice to Acme Logistics' AI carrier rep. Have your MC number ready.
      </p>

      <div style={{
        margin: "0 auto 24px",
        width: 220, height: 220, borderRadius: "50%",
        background: state === "in-call" ? `radial-gradient(circle at 35% 30%, ${BRAND.green} 0%, ${BRAND.greenDark} 70%)` :
                    state === "connecting" ? `radial-gradient(circle at 35% 30%, ${BRAND.warn} 0%, #92400e 70%)` :
                    `radial-gradient(circle at 35% 30%, ${BRAND.greenLight} 0%, ${BRAND.bgAlt} 70%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `3px solid ${state === "in-call" ? BRAND.green : BRAND.border}`,
        boxShadow: state === "in-call" ? `0 0 40px ${BRAND.green}55` : "var(--shadow)",
        transition: "all 200ms ease",
      }}>
        <div style={{ fontSize: 48 }}>
          {state === "in-call" ? "🎙️" : state === "connecting" ? "⏳" : "📞"}
        </div>
      </div>

      <div style={{ color: BRAND.muted, marginBottom: 24, height: 20 }}>
        {state === "idle" && "Ready"}
        {state === "connecting" && "Connecting to the agent…"}
        {state === "in-call" && (muted ? "You are muted" : "Live")}
        {state === "ending" && "Ending…"}
      </div>

      {state === "idle" && (
        <button onClick={start} style={btnPrimary}>Start Call</button>
      )}

      {state === "in-call" && (
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={toggleMute} style={muted ? btnWarn : btnSecondary}>
            {muted ? "Unmute" : "Mute"}
          </button>
          <button onClick={end} style={btnDanger}>End Call</button>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 24, padding: 12, borderRadius: 8,
          background: "#fef2f2", border: `1px solid ${BRAND.danger}`, color: "#991b1b",
          fontSize: 13, textAlign: "left",
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <p style={{ marginTop: 48, color: BRAND.muted, fontSize: 13 }}>
        Tip: allow microphone access when your browser asks.
      </p>
    </div>
  );
}

const baseBtn: React.CSSProperties = {
  padding: "12px 28px", fontSize: 15, fontWeight: 700, borderRadius: 10,
  border: "1px solid transparent",
};
const btnPrimary: React.CSSProperties = { ...baseBtn, background: BRAND.green, color: BRAND.white };
const btnSecondary: React.CSSProperties = { ...baseBtn, background: BRAND.white, color: BRAND.text, border: `1px solid ${BRAND.border}` };
const btnWarn: React.CSSProperties = { ...baseBtn, background: BRAND.warn, color: BRAND.white };
const btnDanger: React.CSSProperties = { ...baseBtn, background: BRAND.danger, color: BRAND.white };
