import { Outlet, NavLink } from "react-router-dom";
import { BRAND } from "./lib/brand";

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 8,
  color: isActive ? BRAND.greenDarker : BRAND.white,
  background: isActive ? BRAND.white : "rgba(255,255,255,0.12)",
  fontWeight: 600,
  fontSize: 14,
  transition: "background 0.15s, color 0.15s",
});

export function App() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "12px 28px",
        borderBottom: `3px solid ${BRAND.greenBright}`,
        background: `linear-gradient(180deg, ${BRAND.greenDark} 0%, ${BRAND.greenDarker} 100%)`,
        boxShadow: "var(--shadow-md)",
      }}>
        <NavLink to="/dashboard" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <img
            src="/acme-logo.png"
            alt="Acme Logistics"
            style={{ height: 48, width: "auto", display: "block", background: BRAND.white, borderRadius: 4, padding: 4 }}
          />
          <div>
            <div style={{ color: BRAND.white, fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>
              Acme Logistics
            </div>
            <div style={{ color: BRAND.greenLight, fontSize: 11 }}>
              Carrier Operations · Powered by HappyRobot
            </div>
          </div>
        </NavLink>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <NavLink to="/call" style={linkStyle}>Web Call</NavLink>
          <NavLink to="/dashboard" style={linkStyle}>Dashboard</NavLink>
        </nav>
      </header>
      <main style={{ flex: 1, padding: 28, background: "var(--bg)" }}>
        <Outlet />
      </main>
      <footer style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "14px 28px",
        borderTop: `2px solid ${BRAND.greenBright}`,
        background: `linear-gradient(180deg, ${BRAND.greenDarker} 0%, ${BRAND.greenDark} 100%)`,
        color: BRAND.greenLight,
        fontSize: 13,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/acme-logo.png" alt="" style={{ height: 24, background: BRAND.white, borderRadius: 3, padding: 2 }} />
          <span style={{ color: BRAND.white }}>© {new Date().getFullYear()} Acme Logistics · Internal use only</span>
        </div>
        <span style={{ color: BRAND.white, fontWeight: 600 }}>HappyRobot AI Voice Agent</span>
        <nav style={{ display: "flex", gap: 16 }}>
          <NavLink
            to="/call"
            style={({ isActive }) => ({
              color: isActive ? BRAND.white : BRAND.greenLight,
              fontWeight: isActive ? 700 : 400,
              textDecoration: isActive ? "underline" : "none",
            })}
          >
            Web Call
          </NavLink>
          <NavLink
            to="/dashboard"
            style={({ isActive }) => ({
              color: isActive ? BRAND.white : BRAND.greenLight,
              fontWeight: isActive ? 700 : 400,
              textDecoration: isActive ? "underline" : "none",
            })}
          >
            Dashboard
          </NavLink>
        </nav>
      </footer>
    </div>
  );
}
