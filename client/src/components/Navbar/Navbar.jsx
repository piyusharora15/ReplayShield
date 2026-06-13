import { useApp } from "../../context/AppContext";
import "./Navbar.css";

const tabs = [
  { id: "dashboard", label: "📊 Dashboard" },
  { id: "simulation",   label: "🎬 Live Simulation" },
  { id: "sophisticated",  label: "🕵️ Sophisticated Attacker" },
  { id: "transactions", label: "💸 Transactions" },
  { id: "simulator", label: "⚔️ Attack Simulator" },
  { id: "logs", label: "📋 Attack Logs" },
];

export default function Navbar({ activeTab, setActiveTab }) {
  const { isConnected, stats, togglePrevention } = useApp();
  const preventionEnabled = stats?.preventionEnabled ?? true;

  return (
    <nav className="navbar">
      <div
        className="navbar-brand"
        onClick={() => setActiveTab("dashboard")}
        title="Go to Home"
      >
        <span className="brand-icon">🔐</span>
        <span className="brand-title">Replay Attack Detector</span>
      </div>

      <div className="navbar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="navbar-right">
        <div className="prevention-toggle">
          <span className="toggle-label">Prevention:</span>
          <button
            className={`toggle-btn ${preventionEnabled ? "on" : "off"}`}
            onClick={() => togglePrevention(!preventionEnabled)}
          >
            {preventionEnabled ? "🛡️ ON" : "⚠️ OFF"}
          </button>
        </div>
        <div className={`connection-dot ${isConnected ? "connected" : "disconnected"}`}>
          {isConnected ? "● Live" : "○ Offline"}
        </div>
      </div>
    </nav>
  );
}