const { ethers } = require("ethers");
const blockchainService = require("../services/blockchainService");
const Transaction = require("../models/Transaction");
const AttackLog = require("../models/AttackLog");
const { getIO } = require("../utils/socketManager");

// Hardhat test accounts
const ACCOUNTS = [
  {
    name: "Alice (Victim)",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    role: "victim",
    color: "#3b82f6",
  },
  {
    name: "Bob (Receiver)",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    role: "receiver",
    color: "#10b981",
  },
  {
    name: "Eve (Attacker)",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    role: "attacker",
    color: "#ef4444",
  },
];

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const simulationController = {

  // Get balances of all accounts
  async getBalances(req, res) {
    try {
      const { contractType = "vulnerable" } = req.query;
      const balances = [];

      for (const account of ACCOUNTS) {
        try {
          const balance = await blockchainService.getBalance(
            contractType,
            account.address
          );
          balances.push({
            ...account,
            balance,
            contractType,
          });
        } catch (e) {
          balances.push({ ...account, balance: "0", contractType });
        }
      }

      res.json({ success: true, data: balances });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // Deposit funds for simulation
  async setupSimulation(req, res) {
    const { contractType = "vulnerable", amount = "1.0" } = req.body;
    const io = getIO();

    try {
      io.emit("simulation_event", {
        type: "setup",
        message: `Setting up simulation — depositing ${amount} ETH for Alice...`,
        icon: "⚙️",
        color: "#9ca3af",
        timestamp: new Date().toISOString(),
      });

      await delay(500);

      const receipt = await blockchainService.deposit(
        ACCOUNTS[0].privateKey,
        contractType,
        amount
      );

      io.emit("simulation_event", {
        type: "deposit",
        message: `Alice deposited ${amount} ETH into ${contractType} contract`,
        icon: "💰",
        color: "#10b981",
        from: ACCOUNTS[0].name,
        amount,
        txHash: receipt.hash,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: `Setup complete — Alice has ${amount} ETH`,
        txHash: receipt.hash,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // Run the full simulation
  async runSimulation(req, res) {
    const {
      contractType = "vulnerable",
      amount = "0.1",
      replayCount = 3,
      preventionEnabled = true,
    } = req.body;

    const io = getIO();

    // Respond immediately — simulation runs in background
    res.json({ success: true, message: "Simulation started" });

    try {
      const provider = blockchainService.getProvider();
      const addresses = blockchainService.getAddresses();

      // ── STEP 1: Alice sends legitimate transaction ──
      await delay(1000);

      io.emit("simulation_event", {
        type: "tx_building",
        message: "Alice is building a transaction to send ETH to Bob...",
        icon: "📝",
        color: "#3b82f6",
        actor: "Alice",
        timestamp: new Date().toISOString(),
      });

      await delay(1500);

      // Build and sign
      const aliceWallet = new ethers.Wallet(
        ACCOUNTS[0].privateKey,
        provider
      );
      const amountWei = ethers.parseEther(amount);
      let signature, nonce, deadline, messageHash;

      if (contractType === "vulnerable") {
        messageHash = ethers.solidityPackedKeccak256(
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
        messageHash = blockchainService.buildMessageHash(
          ACCOUNTS[0].address,
          ACCOUNTS[1].address,
          amount,
          nonce,
          deadline,
          chainId,
          addresses.secureContract
        );
        signature = await aliceWallet.signMessage(
          ethers.getBytes(messageHash)
        );
      }

      io.emit("simulation_event", {
        type: "tx_signed",
        message: `Alice signed the transaction with her private key`,
        subMessage: `Signature: ${signature.substring(0, 20)}...`,
        icon: "✍️",
        color: "#3b82f6",
        actor: "Alice",
        signature: signature.substring(0, 20) + "...",
        timestamp: new Date().toISOString(),
      });

      await delay(1500);

      io.emit("simulation_event", {
        type: "tx_broadcast",
        message: `Transaction broadcast to the network — visible to everyone!`,
        icon: "📡",
        color: "#f59e0b",
        actor: "Network",
        timestamp: new Date().toISOString(),
      });

      await delay(1000);

      // ── STEP 2: Attacker captures signature ──
      io.emit("simulation_event", {
        type: "capture",
        message: `⚡ Eve (Attacker) intercepts and captures the signed transaction!`,
        subMessage: `Captured signature: ${signature.substring(0, 20)}...`,
        icon: "👾",
        color: "#ef4444",
        actor: "Eve",
        captured: true,
        timestamp: new Date().toISOString(),
      });

      await delay(1500);

      // ── STEP 3: Execute legitimate transaction ──
      let receipt;
      try {
        if (contractType === "vulnerable") {
          receipt = await blockchainService.executeVulnerableTransfer(
            ACCOUNTS[0].privateKey,
            ACCOUNTS[1].address,
            amount,
            signature
          );
        } else {
          receipt = await blockchainService.executeSecureTransfer(
            ACCOUNTS[0].privateKey,
            ACCOUNTS[1].address,
            amount,
            nonce,
            deadline,
            signature
          );
        }

        // Save to DB
        await Transaction.create({
          txHash: receipt.hash,
          from: ACCOUNTS[0].address,
          to: ACCOUNTS[1].address,
          amount,
          signature,
          nonce: nonce || undefined,
          contractType,
          status: "success",
          isReplay: false,
        });

        io.emit("simulation_event", {
          type: "tx_success",
          message: `✅ Legitimate transaction SUCCESS — Alice sent ${amount} ETH to Bob`,
          subMessage: `TX: ${receipt.hash.substring(0, 20)}...`,
          icon: "✅",
          color: "#10b981",
          actor: "Alice",
          amount,
          from: "Alice",
          to: "Bob",
          txHash: receipt.hash,
          balanceChange: {
            alice: `-${amount} ETH`,
            bob: `+${amount} ETH`,
          },
          timestamp: new Date().toISOString(),
        });

        // Emit balance update
        io.emit("balance_update", { contractType });

      } catch (e) {
        io.emit("simulation_event", {
          type: "tx_failed",
          message: `Transaction failed: ${e.reason || e.message}`,
          icon: "❌",
          color: "#ef4444",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await delay(2000);

      // ── STEP 4: Replay attacks ──
      for (let i = 1; i <= replayCount; i++) {
        await delay(1500);

        io.emit("simulation_event", {
          type: "replay_attempt",
          message: `🔄 Eve attempts Replay Attack #${i} — reusing captured signature!`,
          subMessage: `Using same signature: ${signature.substring(0, 20)}...`,
          icon: "⚔️",
          color: "#ef4444",
          actor: "Eve",
          attemptNumber: i,
          timestamp: new Date().toISOString(),
        });

        await delay(1000);

        // Check prevention at middleware level
        if (preventionEnabled) {
          // Middleware blocks it
          const log = await AttackLog.create({
            attackType: "signature_replay",
            attackerAddress: ACCOUNTS[2].address,
            victimAddress: ACCOUNTS[0].address,
            replayedSignature: signature,
            originalTxHash: receipt.hash,
            detectedAt: "middleware",
            blocked: true,
            reason: "Middleware blocked: Signature already used",
            contractType,
            preventionEnabled: true,
          });

          io.emit("simulation_event", {
            type: "replay_blocked_middleware",
            message: `🛡️ BLOCKED by Middleware — Replay Attack #${i} stopped!`,
            subMessage: `Reason: Signature ${signature.substring(0, 20)}... was already used in a previous transaction`,
            icon: "🛡️",
            color: "#10b981",
            actor: "System",
            blocked: true,
            blockedAt: "Middleware Layer",
            reason: "Signature already used",
            attemptNumber: i,
            timestamp: new Date().toISOString(),
          });

          io.emit("attack_detected", {
            attackType: "signature_replay",
            blocked: true,
            reason: "Middleware blocked: Signature already used",
            contractType,
          });

          continue;
        }

        // Try on blockchain
        try {
          let replayReceipt;

          if (contractType === "vulnerable") {
            replayReceipt = await blockchainService.executeVulnerableTransfer(
              ACCOUNTS[0].privateKey,
              ACCOUNTS[1].address,
              amount,
              signature
            );

            await Transaction.create({
              txHash: replayReceipt.hash,
              from: ACCOUNTS[0].address,
              to: ACCOUNTS[1].address,
              amount,
              signature,
              contractType: "vulnerable",
              status: "success",
              isReplay: true,
            });

            await AttackLog.create({
              attackType: "signature_replay",
              attackerAddress: ACCOUNTS[2].address,
              victimAddress: ACCOUNTS[0].address,
              replayedSignature: signature,
              originalTxHash: receipt.hash,
              detectedAt: "none",
              blocked: false,
              reason: "Vulnerable contract — no replay protection",
              contractType: "vulnerable",
              preventionEnabled: false,
            });

            io.emit("simulation_event", {
              type: "replay_success",
              message: `❌ REPLAY ATTACK #${i} SUCCEEDED — Alice drained again!`,
              subMessage: `${amount} ETH stolen! Vulnerable contract accepted the same signature again.`,
              icon: "💸",
              color: "#ef4444",
              actor: "Eve",
              blocked: false,
              amount,
              balanceChange: {
                alice: `-${amount} ETH (STOLEN!)`,
                bob: `+${amount} ETH`,
              },
              timestamp: new Date().toISOString(),
            });

            io.emit("balance_update", { contractType });
            io.emit("attack_detected", {
              attackType: "signature_replay",
              blocked: false,
              reason: "Vulnerable contract accepted replay",
              contractType: "vulnerable",
            });

          } else {
            // Secure contract — will always block
            try {
              await blockchainService.executeSecureTransfer(
                ACCOUNTS[0].privateKey,
                ACCOUNTS[1].address,
                amount,
                nonce,
                deadline,
                signature
              );
            } catch (contractErr) {
              const reason =
                contractErr.reason ||
                "Invalid nonce: possible replay attack";

              await AttackLog.create({
                attackType: "signature_replay",
                attackerAddress: ACCOUNTS[2].address,
                victimAddress: ACCOUNTS[0].address,
                replayedSignature: signature,
                originalTxHash: receipt.hash,
                detectedAt: "smart_contract",
                blocked: true,
                reason: `Smart contract blocked: ${reason}`,
                contractType: "secure",
                preventionEnabled: false,
              });

              io.emit("simulation_event", {
                type: "replay_blocked_contract",
                message: `🛡️ BLOCKED by Smart Contract — Replay Attack #${i} rejected on-chain!`,
                subMessage: `Reason: ${reason}`,
                icon: "⛓️",
                color: "#10b981",
                actor: "Smart Contract",
                blocked: true,
                blockedAt: "Smart Contract Layer",
                reason,
                attemptNumber: i,
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
          console.error("Replay attempt error:", e.message);
        }
      }

      await delay(1000);

      // ── STEP 5: Final summary ──
      io.emit("simulation_event", {
        type: "simulation_complete",
        message: preventionEnabled
          ? `✅ Simulation complete — All ${replayCount} replay attacks were BLOCKED`
          : `⚠️ Simulation complete — All ${replayCount} replay attacks SUCCEEDED on vulnerable contract`,
        icon: preventionEnabled ? "🏆" : "⚠️",
        color: preventionEnabled ? "#10b981" : "#ef4444",
        summary: true,
        timestamp: new Date().toISOString(),
      });

      io.emit("balance_update", { contractType });

    } catch (err) {
      console.error("Simulation error:", err.message);
      io.emit("simulation_event", {
        type: "error",
        message: `Simulation error: ${err.message}`,
        icon: "❌",
        color: "#ef4444",
        timestamp: new Date().toISOString(),
      });
    }
  },
};

module.exports = simulationController;