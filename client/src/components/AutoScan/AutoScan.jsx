import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { autoScanAPI } from "../../services/api";
import "./AutoScan.css";

const COLORS = ["#10b981", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6"];

export default function AutoScan() {
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanStats, setScanStats] = useState(null);
  const [liveLog, setLiveLog] = useState([]);
  const [preventionEnabled, setPreventionEnabled] = useState(true);
  const [speed, setSpeed] = useState("normal");
  const [attackTypeData, setAttackTypeData] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  const speedMap = { slow: 150, normal: 50, fast: 10 };

  useEffect(() => {
    socketRef.current = io("http://localhost:5000", {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      forceNew: true,
    });

    socketRef.current.on("connect", () => {
      console.log("✅ AutoScan socket connected:", socketRef.current.id);
      setConnected(true);
    });

    socketRef.current.on("disconnect", () => {
      console.log("❌ AutoScan socket disconnected");
      setConnected(false);
    });

    socketRef.current.on("connect_error", (err) => {
      console.log("Socket connection error:", err.message);
      setConnected(false);
    });

    socketRef.current.on("autoscan_started", (data) => {
      console.log("AutoScan started:", data);
      setScanning(true);
      setScanComplete(false);
      setLiveLog([]);
      setProgress(0);
      setAttackTypeData([]);
    });

    socketRef.current.on("autoscan_progress", (data) => {
      setProgress(data.progress || 0);
      setScanStats({ ...data });
    });

    socketRef.current.on("attack_detected", (data) => {
      if (data.scanProgress !== undefined) {
        setLiveLog((prev) => [
          {
            id: Date.now(),
            type: data.attackType || "unknown",
            blocked: data.blocked,
            from: data.from,
            reason: data.reason,
            contract: data.contractType,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 49),
        ]);

        setAttackTypeData((prev) => {
          const name = data.attackType || "unknown";
          const existing = prev.find((d) => d.name === name);
          if (existing) {
            return prev.map((d) =>
              d.name === name ? { ...d, count: d.count + 1 } : d
            );
          }
          return [...prev, { name, count: 1 }];
        });
      }
    });

    socketRef.current.on("autoscan_complete", (data) => {
      console.log("AutoScan complete:", data);
      setScanning(false);
      setScanComplete(true);
      setScanStats(data);
      setProgress(100);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const startScan = async () => {
    try {
      setLiveLog([]);
      setAttackTypeData([]);
      setScanComplete(false);
      setScanStats(null);
      setProgress(0);

      await autoScanAPI.reset();

      const res = await autoScanAPI.start({
        preventionEnabled,
        delayMs: speedMap[speed],
      });

      console.log("Scan started:", res.data);

      if (!res.data.success) {
        alert("Failed to start scan: " + res.data.message);
      }
    } catch (err) {
      console.error("Failed to start scan:", err);
      alert(
        "Failed to start AutoScan. Make sure backend is running.\n" +
          err.message
      );
    }
  };

  const resetScan = async () => {
    try {
      await autoScanAPI.reset();
      setScanComplete(false);
      setScanStats(null);
      setProgress(0);
      setLiveLog([]);
      setAttackTypeData([]);
    } catch (err) {
      console.error("Reset error:", err);
    }
  };

  const overviewData = scanStats
    ? [
        { name: "Legitimate", value: scanStats.legitimate || 0, fill: "#10b981" },
        { name: "Attacks",    value: scanStats.attacks || 0,    fill: "#ef4444" },
        { name: "Blocked",    value: scanStats.blocked || 0,    fill: "#3b82f6" },
        { name: "Succeeded",  value: scanStats.succeeded || 0,  fill: "#f59e0b" },
      ]
    : [];

  return (
    <div className="autoscan">

      {/* Header */}
      <div className="card autoscan-header">
        <div className="header-left">
          <h2>🤖 AutoScan — Automated Dataset Analysis</h2>
          <p>
            Automatically processes all 850 transactions from the dataset,
            detects replay attacks in real-time, and generates a complete
            security report.
          </p>
          <div style={{ fontSize: "12px", marginTop: "6px" }}>
            Socket:{" "}
            <span style={{ color: connected ? "#10b981" : "#ef4444" }}>
              {connected ? "● Connected" : "○ Disconnected"}
            </span>
          </div>
        </div>
        <div className="header-controls">
          <div className="control-group">
            <label>Prevention</label>
            <button
              className={`toggle-btn ${preventionEnabled ? "on" : "off"}`}
              onClick={() => setPreventionEnabled(!preventionEnabled)}
              disabled={scanning}
            >
              {preventionEnabled ? "🛡️ ON" : "⚠️ OFF"}
            </button>
          </div>
          <div className="control-group">
            <label>Speed</label>
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              disabled={scanning}
            >
              <option value="slow">🐢 Slow</option>
              <option value="normal">🚶 Normal</option>
              <option value="fast">🚀 Fast</option>
            </select>
          </div>
          <button
            className="btn btn-primary scan-btn"
            onClick={startScan}
            disabled={scanning}
          >
            {scanning ? "⏳ Scanning..." : "▶ Run AutoScan"}
          </button>
          {scanComplete && (
            <button className="btn btn-danger" onClick={resetScan}>
              🔄 Reset
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {(scanning || scanComplete) && (
        <div className="card progress-card">
          <div className="progress-header">
            <span>
              {scanning
                ? `Processing transaction ${scanStats?.processed || 0} of ${scanStats?.total || 850}...`
                : `✅ Scan complete — ${scanStats?.total} transactions processed in ${scanStats?.duration}`}
            </span>
            <span className="progress-pct">{progress}%</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          {scanning && scanStats && (
            <div className="live-counters">
              <div className="counter green">✅ Legitimate: {scanStats.legitimate || 0}</div>
              <div className="counter red">🚨 Attacks: {scanStats.attacks || 0}</div>
              <div className="counter blue">🛡️ Blocked: {scanStats.blocked || 0}</div>
              <div className="counter orange">❌ Succeeded: {scanStats.succeeded || 0}</div>
            </div>
          )}
        </div>
      )}

      {/* Stat Cards */}
      {scanStats && (
        <>
          <div className="result-grid">
            <ResultCard title="Total Processed"  value={scanStats.total || 0}              icon="📊" color="blue"   />
            <ResultCard title="Legitimate"        value={scanStats.legitimate || 0}          icon="✅" color="green"  />
            <ResultCard title="Attacks Detected"  value={scanStats.attacks || 0}             icon="🚨" color="red"    />
            <ResultCard title="Attacks Blocked"   value={scanStats.blocked || 0}             icon="🛡️" color="blue"   />
            <ResultCard title="Attacks Succeeded" value={scanStats.succeeded || 0}           icon="❌" color="orange" />
            <ResultCard title="Block Rate"        value={`${scanStats.blockRate || 0}%`}     icon="📈" color="green"  />
            <ResultCard title="Detection Rate"    value={`${scanStats.detectionRate || 0}%`} icon="🔍" color="blue"   />
            <ResultCard title="Scan Duration"     value={scanStats.duration || "—"}          icon="⏱️" color="purple" />
          </div>

          {/* Charts */}
          <div className="charts-row">
            <div className="card chart-card">
              <h3>Transaction Overview</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={overviewData}>
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#1f2937",
                      border: "none",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {overviewData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card chart-card">
              <h3>Attack Types Distribution</h3>
              {attackTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={attackTypeData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) =>
                        `${name.replace(/_/g, " ")} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {attackTypeData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#1f2937",
                        border: "none",
                        borderRadius: 8,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="no-data">
                  {scanning ? "Waiting for attacks..." : "No attack data yet"}
                </div>
              )}
            </div>

            <div className="card chart-card">
              <h3>Legitimate vs Attacks</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Legitimate",     value: scanStats.legitimate || 0 },
                      { name: "Replay Attacks", value: scanStats.attacks || 0 },
                    ]}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    label
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#1f2937",
                      border: "none",
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Final Report */}
          {scanComplete && (
            <div className="card report-card">
              <h3>📋 AutoScan Security Report</h3>
              <div className="report-grid">
                <ReportItem
                  label="Scan Started"
                  value={new Date(scanStats.startTime).toLocaleTimeString()}
                />
                <ReportItem
                  label="Scan Ended"
                  value={new Date(scanStats.endTime).toLocaleTimeString()}
                />
                <ReportItem label="Duration"           value={scanStats.duration} />
                <ReportItem label="Total Transactions" value={scanStats.total} />
                <ReportItem label="Legitimate"         value={scanStats.legitimate} color="green"  />
                <ReportItem label="Attacks Detected"   value={scanStats.attacks}    color="red"    />
                <ReportItem label="Attacks Blocked"    value={scanStats.blocked}    color="blue"   />
                <ReportItem label="Attacks Succeeded"  value={scanStats.succeeded}  color="orange" />
                <ReportItem label="Block Rate"         value={`${scanStats.blockRate}%`}     color="green" />
                <ReportItem label="Detection Rate"     value={`${scanStats.detectionRate}%`} color="blue"  />
                <ReportItem
                  label="Prevention"
                  value={preventionEnabled ? "Enabled" : "Disabled"}
                  color={preventionEnabled ? "green" : "red"}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Live Attack Feed */}
      {liveLog.length > 0 && (
        <div className="card live-feed">
          <h3>⚡ Live Attack Feed ({liveLog.length} detected)</h3>
          <div className="feed-list">
            {liveLog.map((entry) => (
              <div
                key={entry.id}
                className={`feed-item ${entry.blocked ? "blocked" : "succeeded"}`}
              >
                <div className="feed-left">
                  <span className="feed-icon">
                    {entry.blocked ? "🛡️" : "❌"}
                  </span>
                  <div>
                    <div className="feed-type">
                      {entry.type?.replace(/_/g, " ")}
                    </div>
                    <div className="feed-reason">{entry.reason}</div>
                  </div>
                </div>
                <div className="feed-right">
                  <span
                    className={`badge badge-${entry.blocked ? "success" : "danger"}`}
                  >
                    {entry.blocked ? "Blocked" : "Succeeded"}
                  </span>
                  <span className="feed-time">{entry.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!scanning && !scanComplete && !scanStats && (
        <div className="card empty-state">
          <div className="empty-icon">🤖</div>
          <h3>Ready to Scan</h3>
          <p>
            Click "▶ Run AutoScan" to automatically process all 850
            transactions from the dataset and generate a complete security
            report.
          </p>
        </div>
      )}

    </div>
  );
}

function ResultCard({ title, value, icon, color }) {
  return (
    <div className={`result-card result-${color}`}>
      <div className="result-icon">{icon}</div>
      <div className="result-value">{value}</div>
      <div className="result-title">{title}</div>
    </div>
  );
}

function ReportItem({ label, value, color }) {
  return (
    <div className="report-item">
      <span className="report-label">{label}</span>
      <span className={`report-value ${color || ""}`}>{value}</span>
    </div>
  );
}