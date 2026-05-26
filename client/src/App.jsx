import { useState } from "react";
import { AppProvider } from "./context/AppContext";
import Navbar from "./components/Navbar/Navbar";
import Dashboard from "./components/Dashboard/Dashboard";
import TransactionPanel from "./components/TransactionPanel/TransactionPanel";
import AttackSimulator from "./components/AttackSimulator/AttackSimulator";
import AttackLog from "./components/AttackLog/AttackLog";
import AutoScan from "./components/AutoScan/AutoScan";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <AppProvider>
      <div className="app">
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="main-content">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "autoscan" && <AutoScan />}
          {activeTab === "transactions" && <TransactionPanel />}
          {activeTab === "simulator" && <AttackSimulator />}
          {activeTab === "logs" && <AttackLog />}
        </main>
      </div>
    </AppProvider>
  );
}