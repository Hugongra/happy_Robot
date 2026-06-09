import { Outlet, NavLink } from "react-router-dom";

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 8,
  color: isActive ? "#0b1220" : "#e6ecf5",
  background: isActive ? "#4ea1ff" : "transparent",
  fontWeight: 600,
  fontSize: 14,
});

export function App() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "16px 28px", borderBottom: "1px solid #1f2c4a",
        background: "#111a2e",
      }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>
          <span style={{ color: "#4ea1ff" }}>▲</span> Acme Logistics
        </div>
        <span style={{ color: "#8a9ab2", fontSize: 13, marginLeft: 4 }}>Carrier Sales AI</span>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <NavLink to="/call" style={linkStyle}>Web Call</NavLink>
          <NavLink to="/dashboard" style={linkStyle}>Dashboard</NavLink>
        </nav>
      </header>
      <main style={{ flex: 1, padding: 28 }}>
        <Outlet />
      </main>
      <footer style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "14px 28px",
        borderTop: "1px solid #1f2c4a",
        background: "#111a2e",
        color: "#8a9ab2",
        fontSize: 13,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#4ea1ff", fontWeight: 700 }}>▲</span>
          <span>© {new Date().getFullYear()} Acme Logistics</span>
        </div>
        <span>Carrier Sales AI · Powered by HappyRobot</span>
        <nav style={{ display: "flex", gap: 16 }}>
          <NavLink
            to="/call"
            style={({ isActive }) => ({
              color: isActive ? "#4ea1ff" : "#8a9ab2",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            Web Call
          </NavLink>
          <NavLink
            to="/dashboard"
            style={({ isActive }) => ({
              color: isActive ? "#4ea1ff" : "#8a9ab2",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            Dashboard
          </NavLink>
        </nav>
      </footer>
    </div>
  );
}
