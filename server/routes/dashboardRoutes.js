const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");

router.get("/stats", dashboardController.getStats);
router.post("/toggle-prevention", dashboardController.togglePrevention);

router.get("/clear-all", async (req, res) => {
  try {
    const Transaction = require("../models/Transaction");
    const AttackLog = require("../models/AttackLog");
    await Transaction.deleteMany({});
    await AttackLog.deleteMany({});
    res.json({ success: true, message: "All data cleared successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;