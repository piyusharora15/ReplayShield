import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export const useSocket = () => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastAttack, setLastAttack] = useState(null);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [preventionStatus, setPreventionStatus] = useState(true);

  useEffect(() => {
    try {
      socketRef.current = io("http://localhost:5000", {
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        timeout: 5000,
        forceNew: true,
      });

      socketRef.current.on("connect", () => {
        console.log("✅ Main socket connected");
        setIsConnected(true);
      });

      socketRef.current.on("disconnect", () => {
        setIsConnected(false);
      });

      socketRef.current.on("connect_error", (err) => {
        console.warn("Main socket error:", err.message);
        setIsConnected(false);
      });

      socketRef.current.on("attack_detected", (data) => {
        setLastAttack(data);
      });

      socketRef.current.on("transaction_update", (data) => {
        setLastTransaction(data);
      });

      socketRef.current.on("prevention_toggled", (data) => {
        setPreventionStatus(data.enabled);
      });
    } catch (err) {
      console.warn("Socket init error:", err.message);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return { isConnected, lastAttack, lastTransaction, preventionStatus };
};