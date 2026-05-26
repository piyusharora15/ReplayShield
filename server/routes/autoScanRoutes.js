const express = require("express");
const router = express.Router();
const { runAutoScan, getScanState } = require("../services/autoScanService");
const { getIO } = require("../utils/socketManager");

// Start AutoScan
router.post("/start", async (req, res) => {
  try {
    const { preventionEnabled = true, delayMs = 50 } = req.body;
    const io = getIO();

    // Run in background — don't await
    runAutoScan(io, preventionEnabled, delayMs).catch(console.error);

    res.json({
      success: true,
      message: "AutoScan started",
      preventionEnabled,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get current scan progress
router.get("/status", (req, res) => {
  res.json({ success: true, data: getScanState() });
});

// Reset — clear all autoscan data
router.delete("/reset", async (req, res) => {
  try {
    const Transaction = require("../models/Transaction");
    const AttackLog = require("../models/AttackLog");
    await Transaction.deleteMany({ isAutoScan: true });
    await AttackLog.deleteMany({ isAutoScan: true });
    res.json({ success: true, message: "AutoScan data cleared" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;