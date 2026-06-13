const { ethers } = require("ethers");
const blockchainService = require("../services/blockchainService");
const Transaction = require("../models/Transaction");
const AttackLog = require("../models/AttackLog");
const { getIO } = require("../utils/socketManager");

// Hardhat test accounts
const ACCOUNTS = [
  {
    name: "Alice",
    role: "victim",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  {
    name: "Bob",
    role: "receiver",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  {
    name: "Eve",
    role: "attacker",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey:
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
];

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ============================================================
// EVE'S ATTACK VAULT
// Stores captured transactions waiting to be replayed
// ============================================================
let attackVault = [];
let surveillanceActive = false;
let attackPhaseActive = false;

const sophisticatedAttackerController = {

  // Get current vault status
  getVaultStatus(req, res) {
    res.json({
      success: true,
      data: {
        surveillanceActive,
        attackPhaseActive,
        capturedCount: attackVault.length,
        vault: attackVault.map((v) => ({
          id: v.id,
          capturedAt: v.capturedAt,
          from: v.from,
          to: v.to,
          amount: v.amount,
          contractType: v.contractType,
          signaturePreview: v.signature
            ? v.signature.substring(0, 20) + "..."
            : "none",
          scheduledAt: v.scheduledAt,
        })),
      },
    });
  },

  // Clear the vault
  clearVault(req, res) {
    attackVault = [];
    surveillanceActive = false;
    attackPhaseActive = false;
    res.json({ success: true, message: "Vault cleared" });
  },

  // ============================================================
  // PHASE 1 — SURVEILLANCE
  // Eve watches and captures legitimate transactions
  // ============================================================
  async startSurveillance(req, res) {
    const {
      contractType = "vulnerable",
      transactionCount = 3,
      amountPerTx = "0.1",
      delayBetweenTx = 2000,
    } = req.body;

    if (surveillanceActive) {
      return res.json({
        success: false,
        message: "Surveillance already active",
      });
    }

    // Reset vault for fresh demo
    attackVault = [];
    surveillanceActive = true;
    attackPhaseActive = false;

    const io = getIO();

    // Respond immediately
    res.json({
      success: true,
      message: "Surveillance phase started",
    });

    try {
      const provider = blockchainService.getProvider();
      const addresses = blockchainService.getAddresses();

      // ── Eve announces herself ──
      await delay(500);
      io.emit("sophisticated_event", {
        phase: "surveillance",
        type: "eve_watching",
        message:
          "👾 Eve enters surveillance mode — watching the network silently...",
        subMessage:
          "Eve will capture every signed transaction without alerting anyone",
        icon: "👁️",
        color: "#8b5cf6",
        actor: "Eve",
        timestamp: new Date().toISOString(),
      });

      await delay(1500);

      // ── Alice sends multiple transactions ──
      for (let i = 1; i <= transactionCount; i++) {
        await delay(delayBetweenTx);

        io.emit("sophisticated_event", {
          phase: "surveillance",
          type: "alice_sending",
          message: `👩 Alice sends Transaction #${i} of ${transactionCount}`,
          subMessage: `Sending ${amountPerTx} ETH to Bob on ${contractType} contract`,
          icon: "📤",
          color: "#3b82f6",
          actor: "Alice",
          txNumber: i,
          timestamp: new Date().toISOString(),
        });

        await delay(1000);

        // Build and sign transaction
        const aliceWallet = new ethers.Wallet(
          ACCOUNTS[0].privateKey,
          provider
        );
        const amountWei = ethers.parseEther(amountPerTx);
        let signature, nonce, deadline;

        if (contractType === "vulnerable") {
          const messageHash = ethers.solidityPackedKeccak256(
            ["address", "address", "uint256"],
            [ACCOUNTS[0].address, ACCOUNTS[1].address, amountWei]
          );
          signature = await aliceWallet.signMessage(
            ethers.getBytes(messageHash)
          );
        } else {
          const chainId = parseInt(process.env.CHAIN_ID || "31337");
          nonce = await blockchainService.getNonce(ACCOUNTS[0].address);
          deadline = Math.floor(Date.now() / 1000) + 3600;
          const messageHash = blockchainService.buildMessageHash(
            ACCOUNTS[0].address,
            ACCOUNTS[1].address,
            amountPerTx,
            nonce,
            deadline,
            chainId,
            addresses.secureContract
          );
          signature = await aliceWallet.signMessage(
            ethers.getBytes(messageHash)
          );
        }

        io.emit("sophisticated_event", {
          phase: "surveillance",
          type: "tx_broadcast",
          message: `📡 Transaction #${i} broadcast publicly on the network`,
          subMessage: `Signature: ${signature.substring(0, 25)}... is now visible to everyone`,
          icon: "📡",
          color: "#f59e0b",
          actor: "Network",
          timestamp: new Date().toISOString(),
        });

        await delay(800);

        // Execute the legitimate transaction
        let receipt;
        try {
          if (contractType === "vulnerable") {
            receipt = await blockchainService.executeVulnerableTransfer(
              ACCOUNTS[0].privateKey,
              ACCOUNTS[1].address,
              amountPerTx,
              signature
            );
          } else {
            receipt = await blockchainService.executeSecureTransfer(
              ACCOUNTS[0].privateKey,
              ACCOUNTS[1].address,
              amountPerTx,
              nonce,
              deadline,
              signature
            );
          }

          // Save to DB as legitimate
          const txRecord = await Transaction.create({
            txHash: receipt.hash,
            from: ACCOUNTS[0].address,
            to: ACCOUNTS[1].address,
            amount: amountPerTx,
            signature,
            nonce: nonce || undefined,
            deadline: deadline || undefined,
            contractType,
            status: "success",
            isReplay: false,
          });

          io.emit("sophisticated_event", {
            phase: "surveillance",
            type: "tx_confirmed",
            message: `✅ Transaction #${i} confirmed on blockchain`,
            subMessage: `Alice: -${amountPerTx} ETH | Bob: +${amountPerTx} ETH`,
            icon: "✅",
            color: "#10b981",
            actor: "Alice",
            amount: amountPerTx,
            txHash: receipt.hash,
            timestamp: new Date().toISOString(),
          });

          await delay(600);

          // ── Eve silently captures the signature ──
          const captureId = `VAULT-${Date.now()}-${i}`;
          attackVault.push({
            id: captureId,
            capturedAt: new Date().toISOString(),
            from: ACCOUNTS[0].address,
            to: ACCOUNTS[1].address,
            amount: amountPerTx,
            signature,
            nonce: nonce || undefined,
            deadline: deadline || undefined,
            contractType,
            originalTxHash: receipt.hash,
            txNumber: i,
            scheduledAt: null,
          });

          io.emit("sophisticated_event", {
            phase: "surveillance",
            type: "signature_captured",
            message: `👾 Eve silently captures Signature #${i}`,
            subMessage: `Stored in attack vault: ${signature.substring(0, 25)}...`,
            icon: "🗃️",
            color: "#ef4444",
            actor: "Eve",
            captureId,
            vaultSize: attackVault.length,
            timestamp: new Date().toISOString(),
          });

          io.emit("vault_update", {
            capturedCount: attackVault.length,
            latest: captureId,
          });
        } catch (e) {
          console.error(`TX ${i} failed:`, e.message);
        }
      }

      surveillanceActive = false;

      await delay(500);

      io.emit("sophisticated_event", {
        phase: "surveillance",
        type: "surveillance_complete",
        message: `🎯 Surveillance complete — Eve has captured ${attackVault.length} signatures`,
        subMessage: `Eve is now waiting for the right moment to launch her coordinated attack...`,
        icon: "🎯",
        color: "#8b5cf6",
        actor: "Eve",
        capturedCount: attackVault.length,
        summary: true,
        timestamp: new Date().toISOString(),
      });

      io.emit("surveillance_complete", {
        capturedCount: attackVault.length,
      });
    } catch (err) {
      surveillanceActive = false;
      console.error("Surveillance error:", err.message);
      io.emit("sophisticated_event", {
        phase: "error",
        type: "error",
        message: `Error: ${err.message}`,
        icon: "❌",
        color: "#ef4444",
        timestamp: new Date().toISOString(),
      });
    }
  },

  // ============================================================
  // PHASE 2 — DELAYED BROADCAST ATTACK
  // Eve waits then launches all captured attacks at once
  // ============================================================
  async launchAttack(req, res) {
    const {
      delaySeconds = 5,
      preventionEnabled = false,
    } = req.body;

    if (attackVault.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Attack vault is empty. Run surveillance first.",
      });
    }

    if (attackPhaseActive) {
      return res.status(400).json({
        success: false,
        message: "Attack already in progress.",
      });
    }

    attackPhaseActive = true;
    const io = getIO();

    res.json({
      success: true,
      message: `Attack scheduled — launching in ${delaySeconds} seconds`,
      capturedCount: attackVault.length,
    });

    try {
      const provider = blockchainService.getProvider();
      const addresses = blockchainService.getAddresses();

      // ── Eve announces the attack ──
      io.emit("sophisticated_event", {
        phase: "attack",
        type: "attack_announced",
        message: `⚠️ Eve is preparing to launch coordinated replay attack!`,
        subMessage: `${attackVault.length} captured signatures ready — launching in ${delaySeconds} seconds`,
        icon: "⚠️",
        color: "#ef4444",
        actor: "Eve",
        capturedCount: attackVault.length,
        countdown: delaySeconds,
        timestamp: new Date().toISOString(),
      });

      // ── Countdown ──
      for (let t = delaySeconds; t > 0; t--) {
        await delay(1000);
        io.emit("sophisticated_event", {
          phase: "attack",
          type: "countdown",
          message: `⏳ Attack launching in ${t} second${t !== 1 ? "s" : ""}...`,
          icon: "⏳",
          color: "#f59e0b",
          actor: "Eve",
          countdown: t,
          timestamp: new Date().toISOString(),
        });
        io.emit("attack_countdown", { remaining: t });
      }

      await delay(500);

      io.emit("sophisticated_event", {
        phase: "attack",
        type: "attack_launched",
        message: `🚨 EVE LAUNCHES COORDINATED REPLAY ATTACK!`,
        subMessage: `Broadcasting all ${attackVault.length} captured signatures simultaneously!`,
        icon: "🚨",
        color: "#ef4444",
        actor: "Eve",
        timestamp: new Date().toISOString(),
      });

      await delay(1000);

      // ── Attack each captured signature ──
      let succeeded = 0;
      let blocked = 0;

      for (let i = 0; i < attackVault.length; i++) {
        const captured = attackVault[i];

        await delay(1500);

        io.emit("sophisticated_event", {
          phase: "attack",
          type: "replay_attempt",
          message: `⚔️ Replaying captured signature ${i + 1} of ${attackVault.length}`,
          subMessage: `Original TX: ${captured.originalTxHash?.substring(0, 20)}...`,
          icon: "⚔️",
          color: "#ef4444",
          actor: "Eve",
          attemptNumber: i + 1,
          captureId: captured.id,
          timestamp: new Date().toISOString(),
        });

        await delay(800);

        // Check prevention at middleware level first
        if (preventionEnabled) {
          blocked++;

          const log = await AttackLog.create({
            attackType: "signature_replay",
            attackerAddress: ACCOUNTS[2].address,
            victimAddress: ACCOUNTS[0].address,
            replayedSignature: captured.signature,
            originalTxHash: captured.originalTxHash,
            detectedAt: "middleware",
            blocked: true,
            reason:
              "Middleware blocked: Signature already used — delayed replay attack detected",
            contractType: captured.contractType,
            preventionEnabled: true,
          });

          io.emit("sophisticated_event", {
            phase: "attack",
            type: "blocked_middleware",
            message: `🛡️ BLOCKED — Replay #${i + 1} intercepted by middleware!`,
            subMessage: `Reason: Signature was used ${Math.floor(
              (Date.now() - new Date(captured.capturedAt).getTime()) / 1000
            )} seconds ago — delayed replay detected`,
            icon: "🛡️",
            color: "#10b981",
            actor: "System",
            blocked: true,
            blockedAt: "Middleware Layer",
            captureId: captured.id,
            attemptNumber: i + 1,
            timestamp: new Date().toISOString(),
          });

          io.emit("attack_detected", {
            attackType: "signature_replay",
            blocked: true,
            reason: "Delayed replay attack blocked by middleware",
            contractType: captured.contractType,
          });

          continue;
        }

        // Try on blockchain
        try {
          let replayReceipt;

          if (captured.contractType === "vulnerable") {
            replayReceipt =
              await blockchainService.executeVulnerableTransfer(
                ACCOUNTS[0].privateKey,
                captured.to,
                captured.amount,
                captured.signature
              );

            succeeded++;

            await Transaction.create({
              txHash: replayReceipt.hash,
              from: captured.from,
              to: captured.to,
              amount: captured.amount,
              signature: captured.signature,
              contractType: "vulnerable",
              status: "success",
              isReplay: true,
            });

            await AttackLog.create({
              attackType: "signature_replay",
              attackerAddress: ACCOUNTS[2].address,
              victimAddress: ACCOUNTS[0].address,
              replayedSignature: captured.signature,
              originalTxHash: captured.originalTxHash,
              detectedAt: "none",
              blocked: false,
              reason: `Delayed replay succeeded — signature reused after ${Math.floor(
                (Date.now() -
                  new Date(captured.capturedAt).getTime()) /
                  1000
              )} seconds`,
              contractType: "vulnerable",
              preventionEnabled: false,
            });

            io.emit("sophisticated_event", {
              phase: "attack",
              type: "replay_succeeded",
              message: `❌ REPLAY #${i + 1} SUCCEEDED — Alice drained again!`,
              subMessage: `${captured.amount} ETH stolen! Captured ${Math.floor(
                (Date.now() -
                  new Date(captured.capturedAt).getTime()) /
                  1000
              )} seconds ago — replayed now!`,
              icon: "💸",
              color: "#ef4444",
              actor: "Eve",
              blocked: false,
              amount: captured.amount,
              captureId: captured.id,
              attemptNumber: i + 1,
              timestamp: new Date().toISOString(),
            });

            io.emit("balance_update", {
              contractType: captured.contractType,
            });
            io.emit("attack_detected", {
              attackType: "signature_replay",
              blocked: false,
              reason: "Delayed replay attack succeeded on vulnerable contract",
              contractType: "vulnerable",
            });
          } else {
            // Secure contract
            try {
              await blockchainService.executeSecureTransfer(
                ACCOUNTS[0].privateKey,
                captured.to,
                captured.amount,
                captured.nonce,
                captured.deadline,
                captured.signature
              );
              succeeded++;
            } catch (contractErr) {
              blocked++;
              const reason =
                contractErr.reason ||
                "Invalid nonce: possible replay attack";

              await AttackLog.create({
                attackType: "signature_replay",
                attackerAddress: ACCOUNTS[2].address,
                victimAddress: ACCOUNTS[0].address,
                replayedSignature: captured.signature,
                originalTxHash: captured.originalTxHash,
                detectedAt: "smart_contract",
                blocked: true,
                reason: `Smart contract blocked delayed replay: ${reason}`,
                contractType: "secure",
                preventionEnabled: false,
              });

              io.emit("sophisticated_event", {
                phase: "attack",
                type: "blocked_contract",
                message: `⛓️ BLOCKED by Smart Contract — Replay #${i + 1} rejected!`,
                subMessage: `Reason: ${reason}`,
                icon: "⛓️",
                color: "#10b981",
                actor: "Smart Contract",
                blocked: true,
                blockedAt: "Smart Contract Layer",
                captureId: captured.id,
                attemptNumber: i + 1,
                timestamp: new Date().toISOString(),
              });

              io.emit("attack_detected", {
                attackType: "signature_replay",
                blocked: true,
                reason,
                contractType: "secure",
              });
            }
          }
        } catch (e) {
          console.error(`Replay ${i + 1} error:`, e.message);
        }
      }

      attackPhaseActive = false;

      await delay(1000);

      // ── Final summary ──
      io.emit("sophisticated_event", {
        phase: "complete",
        type: "attack_complete",
        message:
          succeeded > 0
            ? `💀 Attack complete — Eve successfully drained ${succeeded * parseFloat(attackVault[0]?.amount || 0)} ETH from Alice!`
            : `🏆 All ${blocked} replay attacks were BLOCKED — Alice's funds are safe!`,
        subMessage:
          succeeded > 0
            ? `${succeeded} attacks succeeded, ${blocked} blocked`
            : `Every delayed replay attempt was detected and prevented`,
        icon: succeeded > 0 ? "💀" : "🏆",
        color: succeeded > 0 ? "#ef4444" : "#10b981",
        summary: true,
        stats: {
          total: attackVault.length,
          succeeded,
          blocked,
        },
        timestamp: new Date().toISOString(),
      });

      io.emit("attack_phase_complete", { succeeded, blocked });
    } catch (err) {
      attackPhaseActive = false;
      console.error("Attack phase error:", err.message);
    }
  },
};

module.exports = sophisticatedAttackerController;