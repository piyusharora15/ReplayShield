const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/sophisticatedAttackerController");

router.get("/vault", ctrl.getVaultStatus);
router.delete("/vault", ctrl.clearVault);
router.post("/surveillance", ctrl.startSurveillance);
router.post("/attack", ctrl.launchAttack);

module.exports = router;