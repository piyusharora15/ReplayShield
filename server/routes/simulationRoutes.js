const express = require("express");
const router = express.Router();
const simulationController = require("../controllers/simulationController");

router.get("/balances", simulationController.getBalances);
router.post("/setup", simulationController.setupSimulation);
router.post("/run", simulationController.runSimulation);

module.exports = router;