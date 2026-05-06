const AttackLog = require("../models/AttackLog");
const Transaction = require("../models/Transaction");
const blockchainService = require("../services/blockchainService");
const { emitAttackDetected } = require("../utils/socketManager");
const { isPreventionEnabled } = require("../middleware/replayDetector");
const nonceService = require("../services/nonceService");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Hardhat test account private keys
const PRIVATE_KEYS = {
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266":
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8":
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc":
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
};

const attackController = {
  // Get all attack logs
  async getLogs(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const logs = await AttackLog.find()
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      const total = await AttackLog.countDocuments();
      res.json({ success: true, data: logs, total });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async simulateReplayAttack(req, res) {
    const { originalTxId, attackType } = req.body;

    try {
      const originalTx = await Transaction.findById(originalTxId);
      if (!originalTx) {
        return res
          .status(404)
          .json({ success: false, message: "Original transaction not found" });
      }

      const preventionOn = isPreventionEnabled();
      let attackResult = {
        attackType: attackType || "signature_replay",
        originalTx: originalTxId,
        preventionEnabled: preventionOn,
        blocked: false,
        reason: null,
      };

      // ✅ MIDDLEWARE-LEVEL CHECK INSIDE ATTACK CONTROLLER
      // When prevention is ON, check if signature was already used
      if (preventionOn && originalTx.signature) {
        if (nonceService.isSignatureUsed(originalTx.signature)) {
          attackResult.blocked = true;
          attackResult.reason = "Middleware blocked: Signature already used";

          // Log it
          const log = await AttackLog.create({
            attackType: attackResult.attackType,
            attackerAddress: originalTx.from,
            victimAddress: originalTx.from,
            replayedSignature: originalTx.signature,
            originalTxHash: originalTx.txHash,
            detectedAt: "middleware",
            blocked: true,
            reason: attackResult.reason,
            contractType: originalTx.contractType,
            preventionEnabled: preventionOn,
          });

          emitAttackDetected({
            id: log._id,
            attackType: attackResult.attackType,
            blocked: true,
            reason: attackResult.reason,
            contractType: originalTx.contractType,
          });

          return res.json({ success: true, data: attackResult, log });
        }
      }

      // ✅ Get private key of the ORIGINAL signer (not attacker account)
      const fromAddress = originalTx.from.toLowerCase();
      const privateKey = PRIVATE_KEYS[fromAddress];

      if (!privateKey) {
        return res.status(400).json({
          success: false,
          message: `No private key found for address ${originalTx.from}`,
        });
      }

      const provider = blockchainService.getProvider();
      const signer = new ethers.Wallet(privateKey, provider);
      const addresses = blockchainService.getAddresses();

      if (originalTx.contractType === "vulnerable") {
        const vulnerableABI = JSON.parse(
          fs.readFileSync(
            path.join(__dirname, "../config/abis/VulnerableTransfer.json")
          )
        );

        const contract = new ethers.Contract(
          addresses.vulnerableContract,
          vulnerableABI,
          signer
        );

        try {
          // Replay the EXACT same signature
          const tx = await contract.transfer(
            originalTx.to,
            ethers.parseEther(originalTx.amount),
            originalTx.signature
          );
          const receipt = await tx.wait();

          attackResult.blocked = false;
          attackResult.reason =
            "ATTACK SUCCEEDED — Vulnerable contract has no replay protection";
          attackResult.txHash = receipt.hash;

          // Save replayed transaction
          await Transaction.create({
            txHash: receipt.hash,
            from: originalTx.from,
            to: originalTx.to,
            amount: originalTx.amount,
            signature: originalTx.signature,
            contractType: "vulnerable",
            status: "success",
            isReplay: true,
          });
        } catch (e) {
          attackResult.blocked = true;
          attackResult.reason = e.reason || e.message;
        }

      } else {
        const secureABI = JSON.parse(
          fs.readFileSync(
            path.join(__dirname, "../config/abis/SecureTransfer.json")
          )
        );

        const contract = new ethers.Contract(
          addresses.secureContract,
          secureABI,
          signer
        );

        try {
          const tx = await contract.secureTransfer(
            originalTx.to,
            ethers.parseEther(originalTx.amount),
            originalTx.nonce,
            originalTx.deadline,
            originalTx.signature
          );
          await tx.wait();

          attackResult.blocked = false;
          attackResult.reason =
            "Unexpected: attack succeeded despite secure contract";
        } catch (e) {
          attackResult.blocked = true;
          attackResult.reason =
            "Secure contract blocked: " + (e.reason || e.message);
        }
      }

      // Log the attack
      const log = await AttackLog.create({
        attackType: attackResult.attackType,
        attackerAddress: originalTx.from,
        victimAddress: originalTx.from,
        replayedSignature: originalTx.signature,
        originalTxHash: originalTx.txHash,
        detectedAt: attackResult.blocked ? "smart_contract" : "none",
        blocked: attackResult.blocked,
        reason: attackResult.reason,
        contractType: originalTx.contractType,
        preventionEnabled: preventionOn,
      });

      emitAttackDetected({
        id: log._id,
        attackType: attackResult.attackType,
        blocked: attackResult.blocked,
        reason: attackResult.reason,
        contractType: originalTx.contractType,
      });

      res.json({ success: true, data: attackResult, log });
    } catch (err) {
      console.error("simulateReplayAttack error:", err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // Clear all attack logs
  async clearLogs(req, res) {
    try {
      await AttackLog.deleteMany({});
      res.json({ success: true, message: "Attack logs cleared" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

module.exports = attackController;