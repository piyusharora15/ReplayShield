import axios from "axios";

const API = axios.create({ baseURL: "/api" });

export const dashboardAPI = {
  getStats: () => API.get("/dashboard/stats"),
  togglePrevention: (enabled) =>
    API.post("/dashboard/toggle-prevention", { enabled }),
};

export const transactionAPI = {
  getAll: (params) => API.get("/transactions", { params }),
  send: (data) => API.post("/transactions/send", data),
  deposit: (data) => API.post("/transactions/deposit", data),
  getBalance: (contractType, address) =>
    API.get(`/transactions/balance/${contractType}/${address}`),
};

export const attackAPI = {
  getLogs: (params) => API.get("/attacks/logs", { params }),
  simulate: (data) => API.post("/attacks/simulate", data),
  clearLogs: () => API.delete("/attacks/logs"),
};

export const sophisticatedAPI = {
  getVault: () => API.get("/sophisticated/vault"),
  clearVault: () => API.delete("/sophisticated/vault"),
  startSurveillance: (data) => API.post("/sophisticated/surveillance", data),
  launchAttack: (data) => API.post("/sophisticated/attack", data),
};