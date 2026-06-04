import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./LiveSimulation.css";

const ACCOUNTS_INFO = [
  {
    name: "Alice",
    role: "Victim",
    emoji: "👩",
    color: "#3b82f6",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  },
  {
    name: "Bob",
    role: "Receiver",
    emoji: "👨",
    color: "#10b981",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  },
  {
    name: "Eve",
    role: "Attacker",
    emoji: "👾",
    color: "#ef4444",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  },
];

export default function LiveSimulation() {
  const [contractType, setContractType] = useState("vulnerable");
  const [preventionEnabled, setPreventionEnabled] = useState(false);
  const [replayCount, setReplayCount] = useState(3);
  const [amount, setAmount] = useState("0.1");
  const [events, setEvents] = useState([]);
  const [balances, setBalances] = useState({});
  const [running, setRunning] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [highlightedActor, setHighlightedActor] = useState(null);
  const socketRef = useRef(null);
  const feedRef = useRef(null);

  useEffect(() => {
    socketRef.current = io("http://localhost:5000", { forceNew: true });

    socketRef.current.on("simulation_event", (data) => {
      setEvents((prev) => [data, ...prev]);
      if (data.actor) {
        setHighlightedActor(data.actor);
        setTimeout(() => setHighlightedActor(null), 2000);
      }
      if (data.type === "simulation_complete") {
        setRunning(false);
      }
    });

    socketRef.current.on("balance_update", () => {
      loadBalances();
    });

    return () => socketRef.current?.disconnect();
  }, [contractType]);

  const loadBalances = async () => {
    try {
      const res = await fetch(
        `/api/simulation/balances?contractType=${contractType}`
      );
      const data = await res.json();
      if (data.success) {
        const balMap = {};
        data.data.forEach((acc) => {
          balMap[acc.address] = acc.balance;
        });
        setBalances(balMap);
      }
    } catch (err) {
      console.error("Balance load error:", err);
    }
  };

  useEffect(() => {
    loadBalances();
  }, [contractType]);

  const handleSetup = async () => {
    setEvents([]);
    try {
      await fetch("/api/simulation/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractType, amount: "1.0" }),
      });
      setSetupDone(true);
      setTimeout(loadBalances, 2000);
    } catch (err) {
      alert("Setup failed: " + err.message);
    }
  };

  const handleRun = async () => {
    if (!setupDone) {
      alert("Please click Setup first to fund Alice's account");
      return;
    }
    setRunning(true);
    setEvents([]);

    try {
      await fetch("/api/simulation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType,
          amount,
          replayCount: parseInt(replayCount),
          preventionEnabled,
        }),
      });
    } catch (err) {
      alert("Run failed: " + err.message);
      setRunning(false);
    }
  };

  const getEventStyle = (type) => {
    const styles = {
      setup:                    { bg: "#1f293780", border: "#374151", icon: "⚙️" },
      deposit:                  { bg: "#065f4620", border: "#10b981", icon: "💰" },
      tx_building:              { bg: "#1e3a5f20", border: "#3b82f6", icon: "📝" },
      tx_signed:                { bg: "#1e3a5f30", border: "#3b82f6", icon: "✍️" },
      tx_broadcast:             { bg: "#78350f20", border: "#f59e0b", icon: "📡" },
      capture:                  { bg: "#7f1d1d30", border: "#ef4444", icon: "👾" },
      tx_success:               { bg: "#065f4630", border: "#10b981", icon: "✅" },
      replay_attempt:           { bg: "#7f1d1d20", border: "#ef4444", icon: "⚔️" },
      replay_blocked_middleware:{ bg: "#065f4630", border: "#10b981", icon: "🛡️" },
      replay_blocked_contract:  { bg: "#065f4640", border: "#10b981", icon: "⛓️" },
      replay_success:           { bg: "#7f1d1d40", border: "#ef4444", icon: "💸" },
      simulation_complete:      { bg: "#1f293780", border: "#8b5cf6", icon: "🏆" },
      error:                    { bg: "#7f1d1d30", border: "#ef4444", icon: "❌" },
    };
    return styles[type] || { bg: "#1f2937", border: "#374151", icon: "•" };
  };

  return (
    <div className="live-sim">

      {/* Header */}
      <div className="card sim-header">
        <div>
          <h2>🎬 Live Replay Attack Simulation</h2>
          <p>
            Watch a replay attack happen in real time — see money being
            drained and blocked with full explanation of every step.
          </p>
        </div>
        <div className="sim-controls">
          <div className="control-group">
            <label>Contract</label>
            <select
              value={contractType}
              onChange={(e) => {
                setContractType(e.target.value);
                setSetupDone(false);
                setEvents([]);
              }}
              disabled={running}
            >
              <option value="vulnerable">⚠️ Vulnerable</option>
              <option value="secure">🔒 Secure</option>
            </select>
          </div>
          <div className="control-group">
            <label>Amount (ETH)</label>
            <select
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={running}
            >
              <option value="0.05">0.05 ETH</option>
              <option value="0.1">0.1 ETH</option>
              <option value="0.2">0.2 ETH</option>
            </select>
          </div>
          <div className="control-group">
            <label>Replay Attempts</label>
            <select
              value={replayCount}
              onChange={(e) => setReplayCount(e.target.value)}
              disabled={running}
            >
              <option value="2">2 attempts</option>
              <option value="3">3 attempts</option>
              <option value="5">5 attempts</option>
            </select>
          </div>
          <div className="control-group">
            <label>Prevention</label>
            <button
              className={`toggle-btn ${preventionEnabled ? "on" : "off"}`}
              onClick={() => setPreventionEnabled(!preventionEnabled)}
              disabled={running}
            >
              {preventionEnabled ? "🛡️ ON" : "⚠️ OFF"}
            </button>
          </div>
          <button
            className="btn btn-warning"
            onClick={handleSetup}
            disabled={running}
          >
            ⚙️ Setup
          </button>
          <button
            className="btn btn-danger"
            onClick={handleRun}
            disabled={running || !setupDone}
          >
            {running ? "⏳ Running..." : "▶ Start Simulation"}
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="sim-main">

        {/* LEFT — Account Cards */}
        <div className="accounts-panel">
          <h3>👥 Participants</h3>
          {ACCOUNTS_INFO.map((acc) => (
            <div
              key={acc.address}
              className={`account-card ${
                highlightedActor === acc.name ? "highlighted" : ""
              } ${acc.role.toLowerCase()}`}
              style={{
                borderColor:
                  highlightedActor === acc.name
                    ? acc.color
                    : "#1f2937",
              }}
            >
              <div className="account-top">
                <span className="account-emoji">{acc.emoji}</span>
                <div className="account-info">
                  <div className="account-name">{acc.name}</div>
                  <div
                    className="account-role"
                    style={{ color: acc.color }}
                  >
                    {acc.role}
                  </div>
                </div>
                {highlightedActor === acc.name && (
                  <div
                    className="active-badge"
                    style={{ background: acc.color }}
                  >
                    ACTIVE
                  </div>
                )}
              </div>
              <div className="account-address">
                {acc.address.substring(0, 16)}...
              </div>
              <div className="account-balance">
                <span className="balance-label">
                  {contractType} contract:
                </span>
                <span
                  className="balance-value"
                  style={{ color: acc.color }}
                >
                  {parseFloat(
                    balances[acc.address] || "0"
                  ).toFixed(4)}{" "}
                  ETH
                </span>
              </div>
              {acc.role === "Attacker" && (
                <div className="attacker-note">
                  👁️ Watching the network for signed transactions
                </div>
              )}
            </div>
          ))}

          {/* Legend */}
          <div className="legend-card">
            <h4>Current Setup</h4>
            <div className="legend-item">
              <span className="legend-dot blue" />
              <span>
                Contract:{" "}
                <strong>
                  {contractType === "vulnerable"
                    ? "⚠️ No Protection"
                    : "🔒 Protected"}
                </strong>
              </span>
            </div>
            <div className="legend-item">
              <span className="legend-dot green" />
              <span>
                Prevention:{" "}
                <strong>
                  {preventionEnabled ? "🛡️ ON" : "⚠️ OFF"}
                </strong>
              </span>
            </div>
            <div className="legend-item">
              <span className="legend-dot orange" />
              <span>
                Replay Attempts: <strong>{replayCount}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT — Event Feed */}
        <div className="events-panel">
          <h3>
            ⚡ Live Event Feed
            {running && (
              <span className="live-badge">● LIVE</span>
            )}
          </h3>

          {events.length === 0 && (
            <div className="empty-feed">
              <div style={{ fontSize: "48px" }}>🎬</div>
              <p>
                Click <strong>Setup</strong> then{" "}
                <strong>Start Simulation</strong> to begin
              </p>
              <p style={{ fontSize: "12px", color: "#4b5563" }}>
                You will see every step of the attack explained here
              </p>
            </div>
          )}

          <div className="events-list" ref={feedRef}>
            {events.map((event, i) => {
              const style = getEventStyle(event.type);
              return (
                <div
                  key={i}
                  className="event-item"
                  style={{
                    background: style.bg,
                    borderLeft: `4px solid ${style.border}`,
                  }}
                >
                  <div className="event-top">
                    <span className="event-icon">{event.icon}</span>
                    <div className="event-content">
                      <div className="event-message">
                        {event.message}
                      </div>
                      {event.subMessage && (
                        <div className="event-sub">
                          {event.subMessage}
                        </div>
                      )}
                      {event.balanceChange && (
                        <div className="balance-change">
                          {event.balanceChange.alice && (
                            <span className="bal-alice">
                              Alice: {event.balanceChange.alice}
                            </span>
                          )}
                          {event.balanceChange.bob && (
                            <span className="bal-bob">
                              Bob: {event.balanceChange.bob}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="event-time">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom — How it Works */}
      <div className="card how-it-works">
        <h3>🔍 How This Simulation Works</h3>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-num">1</div>
            <div className="step-title">Setup</div>
            <div className="step-desc">
              Alice deposits ETH into the smart contract. This is her
              wallet balance that will be targeted.
            </div>
          </div>
          <div className="step-card">
            <div className="step-num">2</div>
            <div className="step-title">Transaction</div>
            <div className="step-desc">
              Alice signs and sends a legitimate transaction to Bob.
              The signed transaction travels publicly on the network.
            </div>
          </div>
          <div className="step-card">
            <div className="step-num">3</div>
            <div className="step-title">Capture</div>
            <div className="step-desc">
              Eve intercepts and saves Alice's signed transaction from
              the network. No private key needed — just the signature.
            </div>
          </div>
          <div className="step-card">
            <div className="step-num">4</div>
            <div className="step-title">Replay Attack</div>
            <div className="step-desc">
              Eve rebroadcasts the same signed transaction multiple
              times. Each replay drains Alice's funds on a vulnerable
              contract.
            </div>
          </div>
          <div className="step-card">
            <div className="step-num">5</div>
            <div className="step-title">Detection</div>
            <div className="step-desc">
              Our middleware detects the signature was already used and
              blocks the replay before it reaches the blockchain.
            </div>
          </div>
          <div className="step-card">
            <div className="step-num">6</div>
            <div className="step-title">Prevention</div>
            <div className="step-desc">
              Even if middleware is bypassed, the secure smart contract
              rejects the replay via nonce tracking and signature
              mapping.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}