const fs = require("fs");
const path = require("path");
const Transaction = require("../models/Transaction");
const AttackLog = require("../models/AttackLog");
const {
  emitAttackDetected,
  emitTransactionUpdate,
} = require("../utils/socketManager");

// ============================================================
// HELPERS
// ============================================================
const safeContractType = (val) => {
  const v = (val || "").toLowerCase().trim();
  if (v === "secure") return "secure";
  if (v === "vulnerable") return "vulnerable";
  return "vulnerable";
};

const safeAttackType = (val) => {
  const valid = [
    "signature_replay",
    "nonce_replay",
    "cross_chain_replay",
    "expired_tx",
  ];
  return valid.includes(val) ? val : "signature_replay";
};

const safeDetectionLayer = (val) => {
  const valid = ["smart_contract", "middleware", "frontend", "none"];
  return valid.includes(val) ? val : "middleware";
};

const getReasonForAttackType = (attackType, contractType) => {
  const reasons = {
    signature_replay:
      contractType === "secure"
        ? "Secure contract blocked: Signature already used"
        : "Middleware blocked: Signature already used",
    nonce_replay:
      "Secure contract blocked: Invalid nonce: possible replay attack",
    cross_chain_replay:
      "Secure contract blocked: Chain ID mismatch — signature invalid on this chain",
    expired_tx:
      contractType === "secure"
        ? "Secure contract blocked: Transaction expired"
        : "Middleware blocked: Transaction deadline has passed",
  };
  return reasons[attackType] || "Replay attack detected";
};

// ============================================================
// DETECTION ENGINE
// Uses dataset labels as ground truth
// ============================================================
const detectionEngine = {
  detect(tx) {
    const attacks = [];

    // Use dataset label as source of truth
    const isReplay =
      tx.is_replay === "true" ||
      tx.is_replay === true ||
      tx.label === "1" ||
      tx.label === 1;

    if (!isReplay) {
      return attacks; // legitimate transaction
    }

    const contractType = safeContractType(tx.contract_type);
    const attackType = safeAttackType(tx.attack_type);
    const detectionLayer = safeDetectionLayer(tx.detection_layer);

    attacks.push({
      type: attackType,
      reason:
        tx.reason && tx.reason.length > 5
          ? tx.reason
          : getReasonForAttackType(attackType, contractType),
      layer: detectionLayer,
    });

    return attacks;
  },
};

// ============================================================
// AUTOSCAN STATE
// ============================================================
let scanState = {
  running: false,
  progress: 0,
  total: 0,
  processed: 0,
  legitimate: 0,
  attacks: 0,
  blocked: 0,
  succeeded: 0,
  startTime: null,
  endTime: null,
  completed: false,
};

const getScanState = () => ({ ...scanState });

// ============================================================
// CSV PARSER
// ============================================================
const parseCSV = (csvContent) => {
  const lines = csvContent.trim().split("\n");
  const headers = lines[0]
    .split(",")
    .map((h) => h.replace(/"/g, "").trim());

  const rows = lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^,]+)(?=,|$)/g) || [];
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ? values[i].replace(/"/g, "").trim() : "";
    });
    return obj;
  });

  return { headers, rows };
};

// ============================================================
// MAIN AUTOSCAN FUNCTION
// ============================================================
const runAutoScan = async (io, preventionEnabled = true, delayMs = 50) => {
  if (scanState.running) {
    return { success: false, message: "AutoScan already running" };
  }

  const datasetPath = path.join(__dirname, "../data/transactions.csv");
  if (!fs.existsSync(datasetPath)) {
    return {
      success: false,
      message:
        "Dataset not found at server/data/transactions.csv. Run generateDataset.js first.",
    };
  }

  const csvContent = fs.readFileSync(datasetPath, "utf-8");
  const { headers, rows } = parseCSV(csvContent);

  console.log(`CSV loaded: ${rows.length} rows, headers: ${headers.join(", ")}`);

  // Preview first row
  if (rows[0]) {
    console.log("Sample row:", {
      is_replay: rows[0].is_replay,
      label: rows[0].label,
      attack_type: rows[0].attack_type,
      contract_type: rows[0].contract_type,
    });
  }

  // Count legitimate vs attack in dataset
  const legitCount = rows.filter(
    (r) => r.is_replay !== "true" && r.label !== "1"
  ).length;
  const attackCount = rows.filter(
    (r) => r.is_replay === "true" || r.label === "1"
  ).length;
  console.log(`Dataset: ${legitCount} legitimate, ${attackCount} attacks`);

  // Reset
  scanState = {
    running: true,
    progress: 0,
    total: rows.length,
    processed: 0,
    legitimate: 0,
    attacks: 0,
    blocked: 0,
    succeeded: 0,
    startTime: new Date().toISOString(),
    endTime: null,
    completed: false,
  };

  await Transaction.deleteMany({ isAutoScan: true });
  await AttackLog.deleteMany({ isAutoScan: true });

  console.log(`AutoScan started: ${rows.length} transactions to process`);

  io.emit("autoscan_started", {
    total: rows.length,
    message: "AutoScan started — processing dataset...",
  });

  for (let i = 0; i < rows.length; i++) {
    const tx = rows[i];
    const contractType = safeContractType(tx.contract_type);
    const attacksDetected = detectionEngine.detect(tx);
    const isAttack = attacksDetected.length > 0;

    // ✅ Smart blocking logic
    // Secure contract: always blocked (smart contract protection)
    // Vulnerable contract: only blocked if prevention is ON
    const isBlocked =
      isAttack && (contractType === "secure" || preventionEnabled);

    scanState.processed = i + 1;
    scanState.progress = Math.round(((i + 1) / rows.length) * 100);

    try {
      if (!isAttack) {
        scanState.legitimate++;

        await Transaction.create({
          from:
            tx.from_address ||
            "0x0000000000000000000000000000000000000001",
          to:
            tx.to_address ||
            "0x0000000000000000000000000000000000000002",
          amount: tx.amount_eth || "0.1",
          nonce:
            tx.nonce && tx.nonce !== ""
              ? parseInt(tx.nonce)
              : undefined,
          deadline:
            tx.deadline && tx.deadline !== ""
              ? parseInt(tx.deadline)
              : undefined,
          signature: tx.full_signature || tx.signature_hash || "0x000",
          chainId: parseInt(tx.chain_id) || 31337,
          contractType,
          status: "success",
          isReplay: false,
          isAutoScan: true,
          txHash: tx.transaction_id || `AUTO-${i}`,
        });

        io.emit("transaction_update", {
          type: "autoscan_transaction",
          scanState: { ...scanState },
        });
      } else {
        scanState.attacks++;
        if (isBlocked) {
          scanState.blocked++;
        } else {
          scanState.succeeded++;
        }

        for (const attack of attacksDetected) {
          const log = await AttackLog.create({
            attackType: safeAttackType(attack.type),
            attackerAddress:
              tx.from_address ||
              "0x0000000000000000000000000000000000000001",
            victimAddress:
              tx.from_address ||
              "0x0000000000000000000000000000000000000001",
            replayedSignature:
              tx.full_signature || tx.signature_hash || "0x000",
            detectedAt: safeDetectionLayer(attack.layer),
            blocked: isBlocked,
            reason: attack.reason || "Replay attack detected",
            contractType,
            preventionEnabled,
            isAutoScan: true,
          });

          emitAttackDetected({
            id: log._id,
            attackType: safeAttackType(attack.type),
            blocked: isBlocked,
            reason: attack.reason,
            from: tx.from_address,
            contractType,
            scanProgress: scanState.progress,
          });
        }

        await Transaction.create({
          from:
            tx.from_address ||
            "0x0000000000000000000000000000000000000001",
          to:
            tx.to_address ||
            "0x0000000000000000000000000000000000000002",
          amount: tx.amount_eth || "0.1",
          nonce:
            tx.nonce && tx.nonce !== ""
              ? parseInt(tx.nonce)
              : undefined,
          signature:
            tx.full_signature || tx.signature_hash || "0x000",
          contractType,
          status: isBlocked ? "blocked" : "success",
          isReplay: true,
          isAutoScan: true,
          txHash: tx.transaction_id
            ? `${tx.transaction_id}-REPLAY`
            : `AUTO-REPLAY-${i}`,
        });
      }
    } catch (err) {
      console.error(`Row ${i} error:`, err.message);
    }

    if (i % 10 === 0 || i === rows.length - 1) {
      io.emit("autoscan_progress", { ...scanState });
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  scanState.running = false;
  scanState.completed = true;
  scanState.endTime = new Date().toISOString();

  const duration = (
    (new Date(scanState.endTime) - new Date(scanState.startTime)) /
    1000
  ).toFixed(1);

  const finalReport = {
    ...scanState,
    duration: `${duration}s`,
    blockRate:
      scanState.attacks > 0
        ? ((scanState.blocked / scanState.attacks) * 100).toFixed(1)
        : "0",
    detectionRate:
      scanState.total > 0
        ? ((scanState.attacks / scanState.total) * 100).toFixed(1)
        : "0",
  };

  io.emit("autoscan_complete", finalReport);
  console.log("AutoScan complete:", finalReport);

  return { success: true, report: finalReport };
};

module.exports = { runAutoScan, getScanState };