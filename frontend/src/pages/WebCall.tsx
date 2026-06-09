import { useCallback, useRef, useState } from "react";
import { HappyRobotVoiceClient } from "@happyrobot-ai/sdk/voice";
import type { VoiceConnection } from "@happyrobot-ai/sdk/voice";
import { fetchVoiceToken } from "../lib/api";

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
      <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Call our Carrier Desk</h1>
      <p style={{ color: "#8a9ab2", margin: "0 0 36px" }}>
        Connect by voice to Acme Logistics' AI carrier rep. Have your MC number ready.
      </p>

      <div style={{
        margin: "0 auto 24px",
        width: 220, height: 220, borderRadius: "50%",
        background: state === "in-call" ? "radial-gradient(circle at 35% 30%, #19c37d 0%, #0b3a26 70%)" :
                    state === "connecting" ? "radial-gradient(circle at 35% 30%, #ffae42 0%, #4a3208 70%)" :
                    "radial-gradient(circle at 35% 30%, #1f2c4a 0%, #0b1220 70%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: state === "in-call" ? "0 0 60px rgba(25,195,125,0.35)" : "none",
        transition: "all 200ms ease",
      }}>
        <div style={{ fontSize: 48 }}>
          {state === "in-call" ? "🎙️" : state === "connecting" ? "⏳" : "📞"}
        </div>
      </div>

      <div style={{ color: "#8a9ab2", marginBottom: 24, height: 20 }}>
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
          background: "#3a1a1a", border: "1px solid #ff6b6b", color: "#ffb4b4",
          fontSize: 13, textAlign: "left",
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <p style={{ marginTop: 48, color: "#8a9ab2", fontSize: 13 }}>
        Tip: allow microphone access when your browser asks.
      </p>
    </div>
  );
}

const baseBtn: React.CSSProperties = {
  padding: "12px 28px", fontSize: 15, fontWeight: 700, borderRadius: 10,
  border: "1px solid transparent", color: "#0b1220",
};
const btnPrimary: React.CSSProperties = { ...baseBtn, background: "#4ea1ff" };
const btnSecondary: React.CSSProperties = { ...baseBtn, background: "#18233d", color: "#e6ecf5", border: "1px solid #1f2c4a" };
const btnWarn: React.CSSProperties = { ...baseBtn, background: "#ffae42" };
const btnDanger: React.CSSProperties = { ...baseBtn, background: "#ff6b6b", color: "#0b1220" };
