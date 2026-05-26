import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { dashboardAPI } from "../services/api";
import { useSocket } from "../hooks/useSocket";

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // ✅ Wrap useSocket in try-catch via the hook itself
  const { isConnected, lastAttack, lastTransaction, preventionStatus } =
    useSocket();

  const fetchStats = useCallback(async () => {
    try {
      const res = await dashboardAPI.getStats();
      setStats(res.data.data);
    } catch (err) {
      console.error("Stats fetch error:", err.message);
      // ✅ Don't crash — just set empty stats
      setStats({
        transactions: { total: 0, successful: 0, failed: 0 },
        attacks: {
          total: 0,
          blocked: 0,
          successful: 0,
          blockRate: 0,
          byType: [],
        },
        preventionEnabled: true,
        recentAttacks: [],
        recentTransactions: [],
      });
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ✅ Only refetch when lastAttack or lastTransaction changes
  useEffect(() => {
    if (lastAttack || lastTransaction) {
      fetchStats();
    }
  }, [lastAttack, lastTransaction]);

  useEffect(() => {
    if (lastAttack) {
      const notification = {
        id: Date.now(),
        type: lastAttack.blocked ? "warning" : "danger",
        message: lastAttack.blocked
          ? `🛡️ Replay attack BLOCKED: ${lastAttack.attackType}`
          : `❌ Replay attack SUCCEEDED: ${lastAttack.attackType}`,
        timestamp: new Date().toISOString(),
      };
      setNotifications((prev) => [notification, ...prev].slice(0, 10));
    }
  }, [lastAttack]);

  const togglePrevention = async (enabled) => {
    try {
      await dashboardAPI.togglePrevention(enabled);
      await fetchStats();
    } catch (err) {
      console.error("Toggle prevention error:", err.message);
    }
  };

  const dismissNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <AppContext.Provider
      value={{
        stats,
        loading,
        notifications,
        isConnected,
        preventionStatus,
        fetchStats,
        togglePrevention,
        dismissNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);