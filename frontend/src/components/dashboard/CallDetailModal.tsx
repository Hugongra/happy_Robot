import { useEffect, useState } from "react";
import type { CallRecord, TransferStatus } from "../../lib/dashboard/types";
import {
  fmtMoney, fmtScheduled, fmtWhen, brokerMargin, getLastCarrierOffer,
} from "../../lib/dashboard/format";
import {
  hasLoadMatched, resolveFmcsaStatus, resolveLoadDetails, type FmcsaStatus,
} from "../../lib/dashboard/loadDetails";
import { BRAND } from "../../lib/brand";
import { NegotiationLadderSteps } from "./NegotiationLadderSteps";
import { OutcomeTag, SentimentTag } from "./ui";

type Props = {
  call: CallRecord | null;
  onClose: () => void;
};

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}

const FMCSA_STYLES: Record<FmcsaStatus, { label: string; color: string; bg: string }> = {
  verified: { label: "Verified", color: BRAND.greenDark, bg: BRAND.greenLight },
  rejected: { label: "Rejected", color: BRAND.danger, bg: "#fef2f2" },
  not_provided: { label: "Not provided", color: BRAND.muted, bg: BRAND.bgAlt },
};

function TransferStatusRow({ status }: { status: TransferStatus }) {
  if (status === "n/a") {
    return <span style={{ color: BRAND.muted }}>Not applicable</span>;
  }
  if (status === "successful") {
    return <span style={{ color: BRAND.greenDark, fontWeight: 600 }}>Successful</span>;
  }
  if (status === "failed") {
    return <span style={{ color: BRAND.danger, fontWeight: 600 }}>Failed</span>;
  }
  return <span style={{ color: BRAND.warn, fontWeight: 600 }}>Pending</span>;
}

export function CallDetailModal({ call, onClose }: Props) {
  const isMobile = useIsMobile();

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

  const margin = call.broker_margin ?? brokerMargin(call.loadboard_rate, call.agreed_rate);
  const load = resolveLoadDetails(call);
  const fmcsa = resolveFmcsaStatus(call);
  const fmcsaStyle = FMCSA_STYLES[fmcsa];
  const transferStatus = call.transfer_status ?? "n/a";
  const rawPayload = call.raw_payload && Object.keys(call.raw_payload).length > 0
    ? call.raw_payload
    : buildFallbackPayload(call);

  const panelStyle: React.CSSProperties = isMobile
    ? {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(520px, calc(100vw - 24px))",
      maxHeight: "calc(100vh - 32px)",
      background: BRAND.white,
      borderRadius: 12,
      zIndex: 1001,
      display: "flex",
      flexDirection: "column",
      boxShadow: "var(--shadow-md)",
      border: `1px solid ${BRAND.border}`,
      animation: "fadeIn 0.2s ease-out",
    }
    : {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: "min(560px, 100vw)",
      background: BRAND.white,
      borderLeft: `2px solid ${BRAND.green}`,
      zIndex: 1001,
      display: "flex",
      flexDirection: "column",
      boxShadow: "var(--shadow-md)",
      animation: "slideIn 0.22s ease-out",
    };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(17, 24, 39, 0.35)",
          backdropFilter: "blur(4px)", zIndex: 1000,
        }}
      />
      <aside
        role="dialog"
        aria-modal
        aria-label="Call details"
        style={panelStyle}
      >
        <header style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${BRAND.border}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          background: BRAND.bgAlt,
          borderRadius: isMobile ? "12px 12px 0 0" : undefined,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: BRAND.text }}>
              {call.carrier_name || "Unknown carrier"}
            </h2>
            <div style={{ fontSize: 13, color: BRAND.textSecondary, marginTop: 4 }}>
              MC {call.mc_number?.trim() || "—"}
            </div>
            <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 4 }}>
              {fmtWhen(call.created_at)}
              {call.isDemo && <span style={{ marginLeft: 8, color: BRAND.greenDark }}>· Demo</span>}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <OutcomeTag outcome={call.outcome || "pending"} />
              <SentimentTag sentiment={call.sentiment || "neutral"} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: BRAND.white, border: `1px solid ${BRAND.border}`, color: BRAND.text,
              borderRadius: 8, width: 36, height: 36, cursor: "pointer", fontSize: 18,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <section style={{ marginBottom: 22 }}>
            <SectionTitle>FMCSA verification</SectionTitle>
            <span style={{
              display: "inline-block",
              fontSize: 12,
              fontWeight: 700,
              color: fmcsaStyle.color,
              background: fmcsaStyle.bg,
              padding: "4px 10px",
              borderRadius: 999,
            }}>
              {fmcsaStyle.label}
            </span>
          </section>

          <section style={{ marginBottom: 22 }}>
            <SectionTitle>Load details</SectionTitle>
            {!hasLoadMatched(call) ? (
              <EmptyNote>No load matched on this call</EmptyNote>
            ) : load ? (
              <div style={grid2}>
                <Field label="Load ID" value={load.load_id} />
                <Field label="Equipment" value={load.equipment} />
                <Field label="Lane" value={load.lane} wide />
                <Field label="Pickup" value={fmtScheduled(load.pickup_datetime)} />
                <Field label="Delivery" value={fmtScheduled(load.delivery_datetime)} />
                <Field label="Miles" value={load.miles > 0 ? `${load.miles.toLocaleString()} mi` : "—"} />
                <Field label="Weight" value={load.weight > 0 ? `${load.weight.toLocaleString()} lbs` : "—"} />
                <Field label="Commodity" value={load.commodity || "—"} wide />
                <Field
                  label="Posted rate"
                  value={load.posted_rate > 0 ? fmtMoney(load.posted_rate) : "—"}
                />
              </div>
            ) : null}
          </section>

          <section style={{ marginBottom: 22 }}>
            <SectionTitle>Negotiation ladder</SectionTitle>
            <div style={panelBox}>
              <NegotiationLadderSteps call={call} />
            </div>
          </section>

          <section style={{ marginBottom: 22 }}>
            <SectionTitle>Margin captured</SectionTitle>
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              color: margin > 0 ? BRAND.greenDark : BRAND.muted,
            }}>
              {margin > 0 ? fmtMoney(margin) : "—"}
            </div>
            {margin <= 0 && call.outcome !== "load_booked" && getLastCarrierOffer(call) && (
              <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 4 }}>
                No booking — last carrier ask {fmtMoney(getLastCarrierOffer(call)!)}
              </div>
            )}
          </section>

          <section style={{ marginBottom: 22 }}>
            <SectionTitle>Transfer status</SectionTitle>
            <div style={{ fontSize: 14 }}>
              <TransferStatusRow status={transferStatus} />
            </div>
          </section>

          <section>
            <details style={{
              background: BRAND.bgAlt,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 10,
              padding: "10px 14px",
            }}>
              <summary style={{
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                color: BRAND.greenDark,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                userSelect: "none",
              }}>
                Raw extracted data
              </summary>
              <pre style={{
                margin: "12px 0 0",
                fontSize: 11,
                lineHeight: 1.5,
                overflowX: "auto",
                color: BRAND.textSecondary,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {JSON.stringify(rawPayload, null, 2)}
              </pre>
            </details>
          </section>
        </div>
      </aside>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, -48%); } to { opacity: 1; transform: translate(-50%, -50%); } }
      `}</style>
    </>
  );
}

function buildFallbackPayload(call: CallRecord): Record<string, unknown> {
  return {
    id: call.id,
    run_id: call.run_id,
    mc_number: call.mc_number,
    carrier_name: call.carrier_name,
    carrier_eligible: call.carrier_eligible,
    load_id: call.load_id,
    origin: call.origin,
    destination: call.destination,
    equipment_type: call.equipment_type,
    loadboard_rate: call.loadboard_rate,
    agreed_rate: call.agreed_rate,
    counter_offers: call.counter_offers,
    outcome: call.outcome,
    sentiment: call.sentiment,
    duration_seconds: call.duration_seconds,
    transcript: call.transcript,
    classification_reasoning: call.classification_reasoning,
    sync_source: call.sync_source,
    platform_status: call.platform_status,
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: BRAND.greenDark,
      textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Field({ label, value, wide, tint }: { label: string; value: string; wide?: boolean; tint?: string }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: tint ?? BRAND.text }}>{value}</div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13,
      color: BRAND.muted,
      fontStyle: "italic",
      background: BRAND.bgAlt,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      padding: 14,
    }}>
      {children}
    </div>
  );
}

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  background: BRAND.bgAlt,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 10,
  padding: 14,
};

const panelBox: React.CSSProperties = {
  background: BRAND.bgAlt,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 10,
  padding: 14,
};
