const nonceService = require("../services/nonceService");
const AttackLog = require("../models/AttackLog");
const { emitAttackDetected } = require("../utils/socketManager");

// Global prevention state (can be toggled via API)
let preventionEnabled = true;

const setPreventionEnabled = (val) => { preventionEnabled = val; };
const isPreventionEnabled = () => preventionEnabled;

const replayDetector = async (req, res, next) => {
  const { from, to, amount, nonce, deadline, signature, chainId } = req.body;

  const attacksDetected = [];

  // DETECTION 1: Signature Replay
  if (signature && nonceService.isSignatureUsed(signature)) {
    attacksDetected.push({
      type: "signature_replay",
      reason: "Middleware blocked: Signature already used",
      layer: "middleware",
    });
  }

  // DETECTION 2: Nonce Replay
  if (from && nonce !== undefined && chainId) {
    if (nonceService.isNonceUsed(chainId, from, nonce)) {
      attacksDetected.push({
        type: "nonce_replay",
        reason: `Middleware blocked: Nonce ${nonce} already used for address ${from}`,
        layer: "middleware",
      });
    }
  }

  // DETECTION 3: Expired Transaction
  if (deadline && nonceService.isExpired(deadline)) {
    attacksDetected.push({
      type: "expired_tx",
      reason: `Middleware blocked: Transaction deadline has passed`,
      layer: "middleware",
    });
  }

  // DETECTION 4: Timing-Based Rapid Replay
  if (from && to && amount) {
    if (nonceService.isTimingReplay(from, to, amount)) {
      attacksDetected.push({
        type: "signature_replay",
        reason: "Middleware blocked: Identical transaction within 5 second window",
        layer: "middleware",
      });
    }
  }

  // Log and emit all detected attacks
  for (const attack of attacksDetected) {
    const log = await AttackLog.create({
      attackType: attack.type,
      attackerAddress: from,
      victimAddress: from,
      replayedSignature: signature,
      detectedAt: attack.layer,
      blocked: preventionEnabled,
      reason: attack.reason,
      contractType: req.body.contractType || "vulnerable",
      preventionEnabled,
    });

    emitAttackDetected({
      id: log._id,
      attackType: attack.type,
      reason: attack.reason,
      from,
      blocked: preventionEnabled,
    });
  }

  // Block if prevention is enabled and attacks detected
  if (preventionEnabled && attacksDetected.length > 0) {
    return res.status(403).json({
      success: false,
      message: "Replay attack detected and blocked",
      attacks: attacksDetected,
      preventionEnabled: true,
    });
  }

  // ✅ Key fix: accept signature as parameter instead of using closure variable
  // because signature is created in transactionController AFTER this middleware runs
  req.replayAttacksDetected = attacksDetected;
  req.markTransactionUsed = (actualSignature, actualFrom, actualNonce, actualChainId) => {
    if (actualSignature) {
      nonceService.markSignatureUsed(actualSignature);
      console.log("✅ Signature marked as used:", actualSignature.substring(0, 20) + "...");
    }
    if (actualFrom && actualNonce !== undefined && actualChainId) {
      nonceService.markNonceUsed(actualChainId, actualFrom, actualNonce);
      console.log("✅ Nonce marked as used:", actualNonce);
    }
  };

  next();
};

module.exports = { replayDetector, setPreventionEnabled, isPreventionEnabled };