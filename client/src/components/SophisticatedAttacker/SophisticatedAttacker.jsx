import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { sophisticatedAPI } from "../../services/api";
import "./SophisticatedAttacker.css";

export default function SophisticatedAttacker() {
  const [phase, setPhase] = useState("idle"); // idle | surveillance | waiting | attacking | complete
  const [events, setEvents] = useState([]);
  const [vault, setVault] = useState([]);
  const [countdown, setCountdown] = useState(0);
  const [stats, setStats] = useState(null);
  const [contractType, setContractType] = useState("vulnerable");
  const [preventionEnabled, setPreventionEnabled] = useState(false);
  const [txCount, setTxCount] = useState(3);
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [amount, setAmount] = useState("0.1");
  const socketRef = useRef(null);
  const feedRef = useRef(null);

  useEffect(() => {
    socketRef.current = io("http://localhost:5000", { forceNew: true });

    socketRef.current.on("sophisticated_event", (data) => {
      setEvents((prev) => [data, ...prev.slice(0, 99)]);
      if (feedRef.current) {
        feedRef.current.scrollTop = 0;
      }
    });

    socketRef.current.on("vault_update", (data) => {
      loadVault();
    });

    socketRef.current.on("surveillance_complete", (data) => {
      setPhase("waiting");
      loadVault();
    });

    socketRef.current.on("attack_countdown", (data) => {
      setCountdown(data.remaining);
    });

    socketRef.current.on("attack_phase_complete", (data) => {
      setPhase("complete");
      setStats(data);
      setCountdown(0);
    });

    loadVault();

    return () => socketRef.current?.disconnect();
  }, []);

  const loadVault = async () => {
    try {
      const res = await sophisticatedAPI.getVault();
      if (res.data.success) {
        setVault(res.data.data.vault || []);
      }
    } catch (err) {
      console.error("Vault load error:", err);
    }
  };

  const handleSurveillance = async () => {
    setEvents([]);
    setVault([]);
    setStats(null);
    setPhase("surveillance");
    setCountdown(0);

    try {
      await sophisticatedAPI.clearVault();
      await sophisticatedAPI.startSurveillance({
        contractType,
        transactionCount: parseInt(txCount),
        amountPerTx: amount,
        delayBetweenTx: 2000,
      });
    } catch (err) {
      alert("Error: " + err.message);
      setPhase("idle");
    }
  };

  const handleAttack = async () => {
    setPhase("attacking");
    setCountdown(delaySeconds);

    try {
      await sophisticatedAPI.launchAttack({
        delaySeconds: parseInt(delaySeconds),
        preventionEnabled,
      });
    } catch (err) {
      alert("Error: " + err.message);
      setPhase("waiting");
    }
  };

  const handleReset = async () => {
    await sophisticatedAPI.clearVault();
    setPhase("idle");
    setEvents([]);
    setVault([]);
    setStats(null);
    setCountdown(0);
  };

  const getEventStyle = (type) => {
    const map = {
      eve_watching:         { bg: "#4c1d9520", border: "#8b5cf6" },
      alice_sending:        { bg: "#1e3a5f20", border: "#3b82f6" },
      tx_broadcast:         { bg: "#78350f20", border: "#f59e0b" },
      tx_confirmed:         { bg: "#065f4620", border: "#10b981" },
      signature_captured:   { bg: "#7f1d1d20", border: "#ef4444" },
      surveillance_complete:{ bg: "#4c1d9530", border: "#8b5cf6" },
      attack_announced:     { bg: "#7f1d1d30", border: "#ef4444" },
      countdown:            { bg: "#78350f30", border: "#f59e0b" },
      attack_launched:      { bg: "#7f1d1d40", border: "#ef4444" },
      replay_attempt:       { bg: "#7f1d1d20", border: "#ef4444" },
      blocked_middleware:   { bg: "#065f4630", border: "#10b981" },
      blocked_contract:     { bg: "#065f4640", border: "#10b981" },
      replay_succeeded:     { bg: "#7f1d1d40", border: "#ef4444" },
      attack_complete:      { bg: "#1f293780", border: "#8b5cf6" },
    };
    return map[type] || { bg: "#1f293780", border: "#374151" };
  };

  return (
    <div className="sophisticated">

      {/* Header */}
      <div className="card soph-header">
        <div className="header-left">
          <h2>🕵️ Sophisticated Delayed Replay Attacker</h2>
          <p>
            Eve operates in two phases — silently captures multiple signed
            transactions during surveillance, then launches a coordinated
            delayed replay attack after a timer.
          </p>
          <div className="phase-indicator">
            <span className={`phase-badge ${phase}`}>
              {phase === "idle" && "⚪ Idle"}
              {phase === "surveillance" && "👁️ Surveillance Active"}
              {phase === "waiting" && "⏳ Waiting to Attack"}
              {phase === "attacking" && "🚨 Attack in Progress"}
              {phase === "complete" && "✅ Complete"}
            </span>
          </div>
        </div>

        <div className="header-controls">
          <div className="control-group">
            <label>Contract</label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              disabled={phase !== "idle"}
            >
              <option value="vulnerable">⚠️ Vulnerable</option>
              <option value="secure">🔒 Secure</option>
            </select>
          </div>
          <div className="control-group">
            <label>Transactions to Capture</label>
            <select
              value={txCount}
              onChange={(e) => setTxCount(e.target.value)}
              disabled={phase !== "idle"}
            >
              <option value="2">2 transactions</option>
              <option value="3">3 transactions</option>
              <option value="5">5 transactions</option>
            </select>
          </div>
          <div className="control-group">
            <label>Amount (ETH)</label>
            <select
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={phase !== "idle"}
            >
              <option value="0.05">0.05 ETH</option>
              <option value="0.1">0.1 ETH</option>
              <option value="0.2">0.2 ETH</option>
            </select>
          </div>
          <div className="control-group">
            <label>Attack Delay</label>
            <select
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(e.target.value)}
              disabled={phase === "attacking"}
            >
              <option value="3">3 seconds</option>
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
            </select>
          </div>
          <div className="control-group">
            <label>Prevention</label>
            <button
              className={`toggle-btn ${preventionEnabled ? "on" : "off"}`}
              onClick={() => setPreventionEnabled(!preventionEnabled)}
              disabled={phase === "attacking" || phase === "surveillance"}
            >
              {preventionEnabled ? "🛡️ ON" : "⚠️ OFF"}
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="card action-bar">
        <button
          className="btn btn-purple"
          onClick={handleSurveillance}
          disabled={phase !== "idle"}
        >
          👁️ Start Surveillance
        </button>

        <div className="arrow-divider">→</div>

        <button
          className="btn btn-danger attack-btn"
          onClick={handleAttack}
          disabled={phase !== "waiting"}
        >
          {phase === "attacking"
            ? `⏳ Attacking... (${countdown}s)`
            : "🚨 Launch Delayed Attack"}
        </button>

        <div className="arrow-divider">→</div>

        <button
          className="btn btn-secondary"
          onClick={handleReset}
          disabled={phase === "surveillance" || phase === "attacking"}
        >
          🔄 Reset
        </button>
      </div>

      {/* Countdown Banner */}
      {phase === "attacking" && countdown > 0 && (
        <div className="countdown-banner">
          <div className="countdown-number">{countdown}</div>
          <div className="countdown-text">
            Eve launching attack in {countdown} second{countdown !== 1 ? "s" : ""}...
          </div>
          <div className="countdown-bar">
            <div
              className="countdown-fill"
              style={{
                width: `${((delaySeconds - countdown) / delaySeconds) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Final Stats */}
      {phase === "complete" && stats && (
        <div
          className={`card stats-banner ${
            stats.succeeded > 0 ? "danger" : "success"
          }`}
        >
          <div className="stats-icon">
            {stats.succeeded > 0 ? "💀" : "🏆"}
          </div>
          <div className="stats-content">
            <div className="stats-title">
              {stats.succeeded > 0
                ? `Attack Succeeded — Alice lost ${
                    stats.succeeded *
                    parseFloat(amount)
                  } ETH to Eve's delayed replay attack!`
                : "All Attacks Blocked — Prevention system stopped Eve's coordinated attack!"}
            </div>
            <div className="stats-row">
              <span className="stat-item red">
                ❌ Succeeded: {stats.succeeded}
              </span>
              <span className="stat-item green">
                🛡️ Blocked: {stats.blocked}
              </span>
              <span className="stat-item blue">
                📊 Total: {stats.succeeded + stats.blocked}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className="soph-main">

        {/* LEFT — Vault */}
        <div className="vault-panel">
          <h3>
            🗃️ Eve's Attack Vault
            {vault.length > 0 && (
              <span className="vault-count">{vault.length}</span>
            )}
          </h3>

          {vault.length === 0 ? (
            <div className="vault-empty">
              <div style={{ fontSize: "40px" }}>🔒</div>
              <p>Vault is empty</p>
              <p style={{ fontSize: "12px", color: "#4b5563" }}>
                Start surveillance to capture signatures
              </p>
            </div>
          ) : (
            <div className="vault-list">
              {vault.map((item, i) => (
                <div key={item.id} className="vault-item">
                  <div className="vault-item-header">
                    <span className="vault-num">#{i + 1}</span>
                    <span className="vault-time">
                      {new Date(item.capturedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="vault-sig">
                    🔑 {item.signaturePreview}
                  </div>
                  <div className="vault-details">
                    <span>{item.from?.substring(0, 10)}...</span>
                    <span className="arrow">→</span>
                    <span>{item.to?.substring(0, 10)}...</span>
                    <span className="amount">{item.amount} ETH</span>
                  </div>
                  <div
                    className={`vault-status ${
                      phase === "complete" ? "used" : "ready"
                    }`}
                  >
                    {phase === "complete" ? "⚔️ Used in attack" : "⏳ Ready to replay"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* How it works */}
          <div className="how-works">
            <h4>🔍 How Eve Operates</h4>
            <div className="step-list">
              <div className="step">
                <span className="step-num">1</span>
                <span>Eve watches the network silently during normal operations</span>
              </div>
              <div className="step">
                <span className="step-num">2</span>
                <span>Every transaction Alice sends — Eve captures the signature</span>
              </div>
              <div className="step">
                <span className="step-num">3</span>
                <span>Eve stores all signatures in her vault and waits</span>
              </div>
              <div className="step">
                <span className="step-num">4</span>
                <span>After the delay timer, Eve broadcasts ALL attacks at once</span>
              </div>
              <div className="step">
                <span className="step-num">5</span>
                <span>Each signature is replayed — drained or blocked depending on protection</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Event Feed */}
        <div className="events-panel">
          <h3>
            ⚡ Live Event Feed
            {(phase === "surveillance" || phase === "attacking") && (
              <span className="live-badge">● LIVE</span>
            )}
          </h3>

          {events.length === 0 ? (
            <div className="empty-feed">
              <div style={{ fontSize: "48px" }}>🕵️</div>
              <p>Click <strong>Start Surveillance</strong> to begin</p>
              <p style={{ fontSize: "12px", color: "#4b5563" }}>
                Watch Eve silently capture transactions then launch a coordinated attack
              </p>
            </div>
          ) : (
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
                        <div className="event-message">{event.message}</div>
                        {event.subMessage && (
                          <div className="event-sub">{event.subMessage}</div>
                        )}
                        {event.stats && (
                          <div className="event-stats">
                            <span className="stat red">
                              ❌ {event.stats.succeeded} succeeded
                            </span>
                            <span className="stat green">
                              🛡️ {event.stats.blocked} blocked
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="event-meta">
                        {event.actor && (
                          <span
                            className={`actor-badge ${event.actor.toLowerCase()}`}
                          >
                            {event.actor}
                          </span>
                        )}
                        <span className="event-time">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}