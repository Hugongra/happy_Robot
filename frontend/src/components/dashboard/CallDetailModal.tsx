import { useEffect } from "react";
import type { CallRecord } from "../../lib/dashboard/types";
import { fmt, fmtMoney, fmtWhen, brokerMargin } from "../../lib/dashboard/format";
import { NegotiationLadderInline } from "./NegotiationLadderChart";
import { OutcomeTag, SentimentTag } from "./ui";

type Props = {
  call: CallRecord | null;
  onClose: () => void;
};

export function CallDetailModal({ call, onClose }: Props) {
  useEffect(() => {
    if (!call) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [call, onClose]);

  if (!call) return null;

  const margin = brokerMargin(call.loadboard_rate, call.agreed_rate);
  const transcriptLines = (call.transcript || "No transcript available for this call.")
    .split(/\n+/)
    .filter(Boolean);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(5, 10, 20, 0.72)",
          backdropFilter: "blur(4px)", zIndex: 1000,
        }}
      />
      <aside
        role="dialog"
        aria-modal
        aria-label="Call details"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 100vw)",
          background: "#0d1528", borderLeft: "1px solid #1f2c4a",
          zIndex: 1001, display: "flex", flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.45)",
          animation: "slideIn 0.22s ease-out",
        }}
      >
        <header style={{
          padding: "20px 24px", borderBottom: "1px solid #1f2c4a",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#8a9ab2", marginBottom: 4 }}>
              {fmtWhen(call.created_at)}
              {call.isDemo && <span style={{ marginLeft: 8, color: "#4ea1ff" }}>· Demo</span>}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              {call.carrier_name || "Unknown carrier"}
            </h2>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <OutcomeTag outcome={call.outcome} />
              <SentimentTag sentiment={call.sentiment} />
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "#18233d", border: "1px solid #1f2c4a", color: "#e6ecf5",
              borderRadius: 8, width: 36, height: 36, cursor: "pointer", fontSize: 18,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Load summary */}
          <section style={{ marginBottom: 24 }}>
            <SectionTitle>Load summary</SectionTitle>
            <div style={grid2}>
              <Field label="MC" value={call.mc_number || "—"} />
              <Field label="Load ID" value={call.load_id || "—"} />
              <Field label="Lane" value={`${call.origin || "—"} → ${call.destination || "—"}`} wide />
              <Field label="Equipment" value={call.equipment_type || "—"} />
              <Field label="Posted rate" value={call.loadboard_rate ? fmtMoney(call.loadboard_rate) : "—"} />
              <Field label="Agreed rate" value={call.agreed_rate ? fmtMoney(call.agreed_rate) : "—"} tint="#19c37d" />
              <Field label="Broker margin" value={margin ? fmtMoney(margin) : "—"} tint="#4ea1ff" />
              <Field label="Rounds" value={String(call.num_counter_offers)} />
              <Field label="Duration" value={call.duration_seconds ? `${Math.round(call.duration_seconds)}s` : "—"} />
            </div>
          </section>

          <NegotiationLadderInline call={call} />

          {/* AI reasoning */}
          <section style={{ marginBottom: 24 }}>
            <SectionTitle>AI classification reasoning</SectionTitle>
            <div style={{
              background: "#111a2e", border: "1px solid #1f2c4a", borderRadius: 10,
              padding: 14, fontSize: 13, lineHeight: 1.6, color: "#c8d4e8",
            }}>
              {call.classification_reasoning?.trim()
                || "No classification reasoning was captured for this call. Add `classification_reasoning` to the HappyRobot post-call webhook."}
            </div>
          </section>

          {/* Transcript */}
          <section>
            <SectionTitle>Call transcript</SectionTitle>
            <div style={{
              background: "#0a1020", border: "1px solid #1f2c4a", borderRadius: 10,
              maxHeight: 340, overflowY: "auto", padding: 12,
            }}>
              {transcriptLines.map((line, i) => {
                const isAgent = /^agent:/i.test(line.trim());
                const isCarrier = /^carrier:/i.test(line.trim());
                const text = line.replace(/^(agent|carrier):\s*/i, "");
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: isAgent ? "flex-start" : isCarrier ? "flex-end" : "center",
                      marginBottom: 10,
                    }}
                  >
                    <div style={{
                      maxWidth: "88%",
                      padding: "8px 12px",
                      borderRadius: isAgent ? "12px 12px 12px 4px" : "12px 12px 4px 12px",
                      background: isAgent ? "#18233d" : isCarrier ? "#14352a" : "#111a2e",
                      border: `1px solid ${isAgent ? "#1f2c4a" : isCarrier ? "#19c37d44" : "#1f2c4a"}`,
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "#e6ecf5",
                    }}>
                      {(isAgent || isCarrier) && (
                        <div style={{
                          fontSize: 10, fontWeight: 700, marginBottom: 4,
                          color: isAgent ? "#4ea1ff" : "#19c37d",
                          textTransform: "uppercase", letterSpacing: 0.5,
                        }}>
                          {isAgent ? "Alex" : "Carrier"}
                        </div>
                      )}
                      {text || line}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </aside>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#8a9ab2", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Field({ label, value, wide, tint }: { label: string; value: string; wide?: boolean; tint?: string }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, color: "#8a9ab2", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: tint ?? "#e6ecf5" }}>{value}</div>
    </div>
  );
}

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  background: "#111a2e",
  border: "1px solid #1f2c4a",
  borderRadius: 10,
  padding: 14,
};
