import { useEffect, useMemo, useState } from "react";
import { BRAND } from "../../lib/brand";
import { fmtMoney } from "../../lib/dashboard/format";
import { computeRoiProjection, type RoiDefaults } from "../../lib/dashboard/analytics";
import { Card } from "./ui";

const tileStyle: React.CSSProperties = {
  padding: "16px 18px",
  borderRadius: 10,
  border: `1px solid ${BRAND.border}`,
  background: BRAND.white,
};

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 8,
        gap: 12,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.textSecondary }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.navy }}>{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: BRAND.blue }}
      />
    </div>
  );
}

export function PlatformSavingsSection({
  agentLaborSavings,
  marginCaptured,
  totalCalls,
  roiDefaults,
}: {
  agentLaborSavings: number;
  marginCaptured: number;
  totalCalls: number;
  roiDefaults: RoiDefaults;
}) {
  const total = agentLaborSavings + marginCaptured;

  const [callsPerDay, setCallsPerDay] = useState(roiDefaults.callsPerDay);
  const [bookingRatePct, setBookingRatePct] = useState(roiDefaults.bookingRatePct);
  const [costPerCall, setCostPerCall] = useState(roiDefaults.costPerCall);

  useEffect(() => {
    setCallsPerDay(roiDefaults.callsPerDay);
    setBookingRatePct(roiDefaults.bookingRatePct);
    setCostPerCall(roiDefaults.costPerCall);
  }, [roiDefaults]);

  const projection = useMemo(
    () => computeRoiProjection(
      callsPerDay,
      bookingRatePct,
      costPerCall,
      roiDefaults.avgMarginPerBooked,
    ),
    [callsPerDay, bookingRatePct, costPerCall, roiDefaults.avgMarginPerBooked],
  );

  const isCustom = callsPerDay !== roiDefaults.callsPerDay
    || bookingRatePct !== roiDefaults.bookingRatePct
    || costPerCall !== roiDefaults.costPerCall;

  return (
    <Card title="Platform savings">
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{
          ...tileStyle,
          borderTop: `3px solid ${BRAND.orange}`,
          background: `linear-gradient(135deg, ${BRAND.orangeLight} 0%, ${BRAND.white} 100%)`,
        }}>
          <div style={{ fontSize: 11, color: BRAND.muted, fontWeight: 600, marginBottom: 6 }}>
            Agent labor savings
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.orange }}>
            {fmtMoney(agentLaborSavings)}
          </div>
          <div style={{ fontSize: 11, color: BRAND.textSecondary, marginTop: 6 }}>
            {totalCalls} calls × {fmtMoney(roiDefaults.costPerCall)} — automation vs human rep time
          </div>
        </div>

        <div style={{
          ...tileStyle,
          borderTop: `3px solid ${BRAND.green}`,
          background: `linear-gradient(135deg, ${BRAND.greenLight} 0%, ${BRAND.white} 100%)`,
        }}>
          <div style={{ fontSize: 11, color: BRAND.greenDark, fontWeight: 600, marginBottom: 6 }}>
            Margin captured
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.greenDark }}>
            {fmtMoney(marginCaptured)}
          </div>
          <div style={{ fontSize: 11, color: BRAND.textSecondary, marginTop: 6 }}>
            Posted rate minus agreed rate on booked loads
          </div>
        </div>

        <div style={{
          ...tileStyle,
          borderTop: `3px solid ${BRAND.navy}`,
          background: `linear-gradient(135deg, ${BRAND.orangeLight} 0%, ${BRAND.white} 100%)`,
        }}>
          <div style={{ fontSize: 11, color: BRAND.navy, fontWeight: 700, marginBottom: 6 }}>
            Total platform savings
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.navy }}>
            {fmtMoney(total)}
          </div>
          <div style={{ fontSize: 11, color: BRAND.textSecondary, marginTop: 6 }}>
            Labor savings + negotiation margin
          </div>
        </div>
      </div>

      <div style={{
        borderTop: `1px solid ${BRAND.border}`,
        paddingTop: 18,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.textSecondary }}>
            ROI calculator
          </div>
          {isCustom && (
            <button
              type="button"
              onClick={() => {
                setCallsPerDay(roiDefaults.callsPerDay);
                setBookingRatePct(roiDefaults.bookingRatePct);
                setCostPerCall(roiDefaults.costPerCall);
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 12,
                color: BRAND.blue,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Reset to my data
            </button>
          )}
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 24,
        }}>
          <div style={{
            ...tileStyle,
            background: BRAND.bgAlt,
          }}>
            <SliderRow
              label="Calls per day"
              valueLabel={String(callsPerDay)}
              min={1}
              max={200}
              step={1}
              value={callsPerDay}
              onChange={setCallsPerDay}
            />
            <SliderRow
              label="Booking rate"
              valueLabel={`${bookingRatePct}%`}
              min={0}
              max={100}
              step={0.5}
              value={bookingRatePct}
              onChange={setBookingRatePct}
            />
            <SliderRow
              label="Cost per human-handled call ($)"
              valueLabel={fmtMoney(costPerCall)}
              min={5}
              max={50}
              step={1}
              value={costPerCall}
              onChange={setCostPerCall}
            />
            <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 4 }}>
              Avg margin per booked load: {fmtMoney(roiDefaults.avgMarginPerBooked)} (from your data)
            </div>
          </div>

          <div style={{
            ...tileStyle,
            borderTop: `3px solid ${BRAND.blue}`,
            background: `linear-gradient(135deg, ${BRAND.blue}12 0%, ${BRAND.white} 100%)`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}>
            <div style={{ fontSize: 11, color: BRAND.blue, fontWeight: 700, marginBottom: 8 }}>
              Total annual savings
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: BRAND.blue, lineHeight: 1.1 }}>
              {fmtMoney(projection.totalAnnualSavings)}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 18,
            }}>
              <div>
                <div style={{ fontSize: 10, color: BRAND.muted, fontWeight: 600, marginBottom: 4 }}>
                  Annual labor savings
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.orange }}>
                  {fmtMoney(projection.annualLaborSavings)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: BRAND.muted, fontWeight: 600, marginBottom: 4 }}>
                  Annual negotiation margin
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.greenDark }}>
                  {fmtMoney(projection.annualNegotiationMargin)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
