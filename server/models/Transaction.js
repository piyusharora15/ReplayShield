const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    txHash: { type: String, unique: true, sparse: true },
    from: { type: String, required: true, lowercase: true },
    to: { type: String, required: true, lowercase: true },
    amount: { type: String, required: true },
    nonce: { type: Number },
    deadline: { type: Number },
    signature: { type: String },
    chainId: { type: Number },
    contractType: {
      type: String,
      enum: ["vulnerable", "secure", "unknown", "none"],
      default: "vulnerable",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "blocked"],
      default: "pending",
    },
    blockNumber: { type: Number },
    gasUsed: { type: String },
    timestamp: { type: Date, default: Date.now },
    isReplay: { type: Boolean, default: false },
    isAutoScan: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);