const mongoose = require("mongoose");

const attackLogSchema = new mongoose.Schema(
  {
    attackType: {
      type: String,
      enum: ["signature_replay", "nonce_replay", "cross_chain_replay", "expired_tx"],
      required: true,
    },
    attackerAddress: { type: String, lowercase: true },
    victimAddress: { type: String, lowercase: true },
    replayedSignature: { type: String },
    originalTxHash: { type: String },
    attemptedTxHash: { type: String },
    detectedAt: {
      type: String,
      // ✅ "none" added for when attack succeeds without being detected
      enum: ["smart_contract", "middleware", "frontend", "none"],
      required: true,
    },
    blocked: { type: Boolean, default: true },
    reason: { type: String },
    contractType: { type: String, enum: ["vulnerable", "secure"] },
    preventionEnabled: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttackLog", attackLogSchema);