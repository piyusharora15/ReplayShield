require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const { initSocketManager } = require("./utils/socketManager");

// Routes
const transactionRoutes = require("./routes/transactionRoutes");
const attackRoutes = require("./routes/attackRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const autoScanRoutes = require("./routes/autoScanRoutes");

const app = express();
const httpServer = http.createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
     origin: "*",  // ✅ Allow all origins for development
     methods: ["GET", "POST", "DELETE"]
  },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
});

// Initialize socket manager (so routes can emit events)
initSocketManager(io);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/transactions", transactionRoutes);
app.use("/api/attacks", attackRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/autoscan", autoScanRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});