const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Hardhat test accounts
const ACCOUNTS = [
  {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
  {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  },
  {
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b",
  },
];

const CHAIN_IDS = [31337, 1, 11155111]; // local, mainnet, sepolia
const AMOUNTS = ["0.05", "0.1", "0.2", "0.5", "1.0", "2.0", "0.01", "0.15"];
const CONTRACT_TYPES = ["vulnerable", "secure"];

// Utility functions
const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomAmount = () => randomFrom(AMOUNTS);
const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const getTimestamp = (offsetSeconds = 0) => {
  const base = Math.floor(Date.now() / 1000);
  return base + offsetSeconds;
};

const formatDate = (unixTimestamp) => {
  return new Date(unixTimestamp * 1000).toISOString();
};

// Build message hash for vulnerable contract
const buildVulnerableHash = (from, to, amount) => {
  return ethers.solidityPackedKeccak256(
    ["address", "address", "uint256"],
    [from, to, ethers.parseEther(amount)]
  );
};

// Build message hash for secure contract
const buildSecureHash = (from, to, amount, nonce, deadline, chainId, contractAddress) => {
  return ethers.solidityPackedKeccak256(
    ["address", "address", "uint256", "uint256", "uint256", "uint256", "address"],
    [from, to, ethers.parseEther(amount), nonce, deadline, chainId, contractAddress]
  );
};

// Sign a message
const signMessage = async (hash, privateKey) => {
  const wallet = new ethers.Wallet(privateKey);
  return await wallet.signMessage(ethers.getBytes(hash));
};

// Generate dataset
async function generateDataset() {
  console.log("Generating dataset...");

  const dataset = [];
  const usedSignatures = new Set();
  const nonceTracker = {}; // address -> nonce
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // dummy

  let txId = 1;

  // =============================================
  // SECTION 1: LEGITIMATE TRANSACTIONS (400 rows)
  // =============================================
  console.log("Generating legitimate transactions...");

  for (let i = 0; i < 400; i++) {
    const sender = randomFrom(ACCOUNTS);
    const receiver = randomFrom(ACCOUNTS.filter((a) => a.address !== sender.address));
    const amount = randomAmount();
    const contractType = randomFrom(CONTRACT_TYPES);
    const chainId = 31337;
    const timestamp = getTimestamp(randomBetween(-86400, 0)); // last 24 hours
    const deadline = timestamp + 3600; // 1 hour from tx time

    // Track nonce per address
    const nonceKey = sender.address.toLowerCase();
    if (!nonceTracker[nonceKey]) nonceTracker[nonceKey] = 0;
    const nonce = nonceTracker[nonceKey]++;

    let signature, messageHash;

    if (contractType === "vulnerable") {
      messageHash = buildVulnerableHash(sender.address, receiver.address, amount);
    } else {
      messageHash = buildSecureHash(
        sender.address, receiver.address, amount,
        nonce, deadline, chainId, contractAddress
      );
    }

    signature = await signMessage(messageHash, sender.privateKey);
    const sigHash = ethers.keccak256(ethers.toUtf8Bytes(signature));
    usedSignatures.add(signature);

    dataset.push({
      transaction_id: `TX-${String(txId++).padStart(4, "0")}`,
      timestamp: formatDate(timestamp),
      unix_timestamp: timestamp,
      from_address: sender.address,
      to_address: receiver.address,
      amount_eth: amount,
      nonce: contractType === "secure" ? nonce : null,
      chain_id: chainId,
      deadline: contractType === "secure" ? deadline : null,
      signature_hash: sigHash.substring(0, 20) + "...",
      full_signature: signature,
      contract_type: contractType,
      is_replay: false,
      attack_type: "none",
      blocked: false,
      detection_layer: "none",
      reason: "Legitimate transaction",
      label: 0, // 0 = legitimate
    });
  }

  // ============================================================
  // SECTION 2: SIGNATURE REPLAY ATTACKS (150 rows)
  // ============================================================
  console.log("Generating signature replay attacks...");

  const legitimateTxs = dataset.filter((tx) => tx.contract_type === "vulnerable");

  for (let i = 0; i < 150; i++) {
    const originalTx = randomFrom(legitimateTxs);
    const timestamp = getTimestamp(randomBetween(1, 3600)); // after original
    const preventionEnabled = Math.random() > 0.4; // 60% prevention on

    dataset.push({
      transaction_id: `TX-${String(txId++).padStart(4, "0")}`,
      timestamp: formatDate(timestamp),
      unix_timestamp: timestamp,
      from_address: originalTx.from_address,
      to_address: originalTx.to_address,
      amount_eth: originalTx.amount_eth,
      nonce: null,
      chain_id: originalTx.chain_id,
      deadline: null,
      signature_hash: originalTx.signature_hash,
      full_signature: originalTx.full_signature,
      contract_type: "vulnerable",
      is_replay: true,
      attack_type: "signature_replay",
      blocked: preventionEnabled,
      detection_layer: preventionEnabled ? "middleware" : "none",
      reason: preventionEnabled
        ? "Middleware blocked: Signature already used"
        : "ATTACK SUCCEEDED — Vulnerable contract has no replay protection",
      label: 1, // 1 = replay attack
    });
  }

  // ============================================================
  // SECTION 3: NONCE REPLAY ATTACKS (100 rows)
  // ============================================================
  console.log("Generating nonce replay attacks...");

  const secureTxs = dataset.filter(
    (tx) => tx.contract_type === "secure" && !tx.is_replay
  );

  for (let i = 0; i < 100; i++) {
    const originalTx = randomFrom(secureTxs);
    const timestamp = getTimestamp(randomBetween(1, 3600));
    const preventionEnabled = Math.random() > 0.3;

    dataset.push({
      transaction_id: `TX-${String(txId++).padStart(4, "0")}`,
      timestamp: formatDate(timestamp),
      unix_timestamp: timestamp,
      from_address: originalTx.from_address,
      to_address: originalTx.to_address,
      amount_eth: originalTx.amount_eth,
      nonce: originalTx.nonce, // same nonce — this is the attack
      chain_id: originalTx.chain_id,
      deadline: originalTx.deadline,
      signature_hash: originalTx.signature_hash,
      full_signature: originalTx.full_signature,
      contract_type: "secure",
      is_replay: true,
      attack_type: "nonce_replay",
      blocked: true, // always blocked on secure contract
      detection_layer: preventionEnabled ? "middleware" : "smart_contract",
      reason: preventionEnabled
        ? "Middleware blocked: Nonce already used"
        : "Secure contract blocked: Invalid nonce: possible replay attack",
      label: 1,
    });
  }

  // ============================================================
  // SECTION 4: CROSS-CHAIN REPLAY ATTACKS (80 rows)
  // ============================================================
  console.log("Generating cross-chain replay attacks...");

  for (let i = 0; i < 80; i++) {
    const sender = randomFrom(ACCOUNTS);
    const receiver = randomFrom(ACCOUNTS.filter((a) => a.address !== sender.address));
    const amount = randomAmount();
    const originalChainId = 1; // signed for mainnet
    const replayChainId = 11155111; // replayed on sepolia
    const timestamp = getTimestamp(randomBetween(-3600, 0));
    const deadline = timestamp + 3600;

    const nonceKey = sender.address.toLowerCase();
    if (!nonceTracker[nonceKey]) nonceTracker[nonceKey] = 0;
    const nonce = nonceTracker[nonceKey]++;

    // Signed for mainnet (chainId 1)
    const messageHash = buildSecureHash(
      sender.address, receiver.address, amount,
      nonce, deadline, originalChainId, contractAddress
    );
    const signature = await signMessage(messageHash, sender.privateKey);
    const sigHash = ethers.keccak256(ethers.toUtf8Bytes(signature));

    dataset.push({
      transaction_id: `TX-${String(txId++).padStart(4, "0")}`,
      timestamp: formatDate(timestamp),
      unix_timestamp: timestamp,
      from_address: sender.address,
      to_address: receiver.address,
      amount_eth: amount,
      nonce,
      chain_id: replayChainId, // different chain — this is the attack
      original_chain_id: originalChainId,
      deadline,
      signature_hash: sigHash.substring(0, 20) + "...",
      full_signature: signature,
      contract_type: "secure",
      is_replay: true,
      attack_type: "cross_chain_replay",
      blocked: true,
      detection_layer: "smart_contract",
      reason: "Secure contract blocked: Chain ID mismatch — signature invalid on this chain",
      label: 1,
    });
  }

  // ============================================================
  // SECTION 5: EXPIRED TRANSACTION REPLAY ATTACKS (70 rows)
  // ============================================================
  console.log("Generating expired transaction attacks...");

  for (let i = 0; i < 70; i++) {
    const sender = randomFrom(ACCOUNTS);
    const receiver = randomFrom(ACCOUNTS.filter((a) => a.address !== sender.address));
    const amount = randomAmount();
    const chainId = 31337;

    // Deadline in the past
    const expiredDeadline = getTimestamp(-randomBetween(3600, 86400));
    const timestamp = getTimestamp(randomBetween(1, 100));

    const nonceKey = sender.address.toLowerCase();
    if (!nonceTracker[nonceKey]) nonceTracker[nonceKey] = 0;
    const nonce = nonceTracker[nonceKey]++;

    const messageHash = buildSecureHash(
      sender.address, receiver.address, amount,
      nonce, expiredDeadline, chainId, contractAddress
    );
    const signature = await signMessage(messageHash, sender.privateKey);
    const sigHash = ethers.keccak256(ethers.toUtf8Bytes(signature));

    const preventionEnabled = Math.random() > 0.3;

    dataset.push({
      transaction_id: `TX-${String(txId++).padStart(4, "0")}`,
      timestamp: formatDate(timestamp),
      unix_timestamp: timestamp,
      from_address: sender.address,
      to_address: receiver.address,
      amount_eth: amount,
      nonce,
      chain_id: chainId,
      deadline: expiredDeadline, // expired deadline
      signature_hash: sigHash.substring(0, 20) + "...",
      full_signature: signature,
      contract_type: "secure",
      is_replay: true,
      attack_type: "expired_tx",
      blocked: true,
      detection_layer: preventionEnabled ? "middleware" : "smart_contract",
      reason: preventionEnabled
        ? "Middleware blocked: Transaction deadline has passed"
        : "Secure contract blocked: Transaction expired",
      label: 1,
    });
  }

  // ============================================================
  // SECTION 6: RAPID/TIMING BASED REPLAY (50 rows)
  // ============================================================
  console.log("Generating timing-based replay attacks...");

  for (let i = 0; i < 50; i++) {
    const sender = randomFrom(ACCOUNTS);
    const receiver = randomFrom(ACCOUNTS.filter((a) => a.address !== sender.address));
    const amount = randomAmount();
    const timestamp = getTimestamp(0);

    const messageHash = buildVulnerableHash(
      sender.address, receiver.address, amount
    );
    const signature = await signMessage(messageHash, sender.privateKey);
    const sigHash = ethers.keccak256(ethers.toUtf8Bytes(signature));

    dataset.push({
      transaction_id: `TX-${String(txId++).padStart(4, "0")}`,
      timestamp: formatDate(timestamp),
      unix_timestamp: timestamp,
      from_address: sender.address,
      to_address: receiver.address,
      amount_eth: amount,
      nonce: null,
      chain_id: 31337,
      deadline: null,
      signature_hash: sigHash.substring(0, 20) + "...",
      full_signature: signature,
      contract_type: "vulnerable",
      is_replay: true,
      attack_type: "signature_replay",
      blocked: true,
      detection_layer: "middleware",
      reason: "Middleware blocked: Identical transaction within 5 second window",
      label: 1,
    });
  }

  // =============================================
  // SAVE TO FILES
  // =============================================

  // Shuffle dataset
  const shuffled = dataset.sort(() => Math.random() - 0.5);

  // Save as JSON
  const jsonPath = path.join(__dirname, "../../dataset/transactions.json");
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(shuffled, null, 2));

  // Save as CSV
  const csvHeaders = Object.keys(shuffled[0]).join(",");
  const csvRows = shuffled.map((row) =>
    Object.values(row)
      .map((v) => (v === null ? "" : `"${v}"`))
      .join(",")
  );
  const csvContent = [csvHeaders, ...csvRows].join("\n");
  const csvPath = path.join(__dirname, "../../dataset/transactions.csv");
  fs.writeFileSync(csvPath, csvContent);

  // Save summary stats
  const stats = {
    total: shuffled.length,
    legitimate: shuffled.filter((r) => !r.is_replay).length,
    replay_attacks: shuffled.filter((r) => r.is_replay).length,
    by_attack_type: {
      signature_replay: shuffled.filter((r) => r.attack_type === "signature_replay").length,
      nonce_replay: shuffled.filter((r) => r.attack_type === "nonce_replay").length,
      cross_chain_replay: shuffled.filter((r) => r.attack_type === "cross_chain_replay").length,
      expired_tx: shuffled.filter((r) => r.attack_type === "expired_tx").length,
      none: shuffled.filter((r) => r.attack_type === "none").length,
    },
    blocked: shuffled.filter((r) => r.blocked).length,
    succeeded: shuffled.filter((r) => r.is_replay && !r.blocked).length,
    by_detection_layer: {
      middleware: shuffled.filter((r) => r.detection_layer === "middleware").length,
      smart_contract: shuffled.filter((r) => r.detection_layer === "smart_contract").length,
      none: shuffled.filter((r) => r.detection_layer === "none").length,
    },
    by_contract_type: {
      vulnerable: shuffled.filter((r) => r.contract_type === "vulnerable").length,
      secure: shuffled.filter((r) => r.contract_type === "secure").length,
    },
  };

  const statsPath = path.join(__dirname, "../../dataset/dataset_summary.json");
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

  console.log("\n✅ Dataset generated successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📊 Total Records     : ${stats.total}`);
  console.log(`✅ Legitimate        : ${stats.legitimate}`);
  console.log(`❌ Replay Attacks    : ${stats.replay_attacks}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   Signature Replay  : ${stats.by_attack_type.signature_replay}`);
  console.log(`   Nonce Replay      : ${stats.by_attack_type.nonce_replay}`);
  console.log(`   Cross-chain       : ${stats.by_attack_type.cross_chain_replay}`);
  console.log(`   Expired TX        : ${stats.by_attack_type.expired_tx}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🛡️  Blocked           : ${stats.blocked}`);
  console.log(`💀 Succeeded         : ${stats.succeeded}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📁 Files saved to    : dataset/`);
  console.log(`   transactions.json`);
  console.log(`   transactions.csv`);
  console.log(`   dataset_summary.json`);
}

generateDataset().catch(console.error);