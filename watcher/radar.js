const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const { summarizeRadarIntelligence } = require("./radar-intelligence");
const { computeRadarScore } = require("./lib/scoring-engine");

const KEY_SIGNALS = [
  "claim",
  "claim now",
  "reward",
  "rewards",
  "verify",
  "connect",
  "connect x",
  "ethereum",
  "solana",
  "account",
  "payout",
  "enabled",
  "disabled",
  "launch",
  "portal",
  "airdrop",

  // nuevas señales críticas
  "eligible",
  "active",
  "canclaim",
  "isenabled",
  "available rewards",
  "wallet",
  "signin",
  "signmessage",
  "verifysignature",
  "nonce",
];

const SIGNAL_GROUPS = {
  AUTH: [
    "verify",
    "account",
    "login",
    "signin",
    "signmessage",
    "verifysignature",
    "nonce",
  ],
  REWARDS: [
    "claim",
    "claim now",
    "reward",
    "rewards",
    "airdrop",
    "payout",
    "eligible",
    "available rewards",
    "canclaim",
  ],
  CHAIN: [
    "ethereum",
    "solana",
    "connect",
    "wallet",
  ],
  SYSTEM: [
    "enabled",
    "disabled",
    "isenabled",
    "portal",
    "launch",
    "active",
  ],
};

const MAX_HISTORY = 200;
const TRIGGER_PRIORITIES = new Set(["HIGH", "VERY HIGH", "CRITICAL"]);

function scoreSignals(text) {
  const lower = String(text || "").toLowerCase();
  const hits = [];

  for (const signal of KEY_SIGNALS) {
    if (lower.includes(signal)) {
      hits.push(signal);
    }
  }

  return [...new Set(hits)];
}

async function loadLatestSnapshots() {
  const snapshotsDir = path.join(process.cwd(), "snapshots");

  if (!(await fs.pathExists(snapshotsDir))) {
    throw new Error(`No existe el directorio de snapshots: ${snapshotsDir}`);
  }

  const entries = await fs.readdir(snapshotsDir);
  const dirs = [];

  for (const entry of entries) {
    const fullPath = path.join(snapshotsDir, entry);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      dirs.push(fullPath);
    }
  }

  dirs.sort();

  if (dirs.length === 0) {
    throw new Error("No hay snapshots disponibles");
  }

  if (dirs.length === 1) {
    return {
      oldDir: null,
      newDir: dirs[0],
    };
  }

  return {
    oldDir: dirs[dirs.length - 2],
    newDir: dirs[dirs.length - 1],
  };
}

async function readAssets(dir) {
  const files = [];
  const assetsDir = path.join(dir, "assets");

  if (!(await fs.pathExists(assetsDir))) {
    return files;
  }

  async function walk(currentDir) {
    const items = await fs.readdir(currentDir);

    for (const item of items) {
      const full = path.join(currentDir, item);
      const stat = await fs.stat(full);

      if (stat.isDirectory()) {
        await walk(full);
      } else {
        files.push(full);
      }
    }
  }

  await walk(assetsDir);
  return files;
}

async function readFileSafe(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

function toAssetRelative(dir, file) {
  const assetsDir = path.join(dir, "assets");
  return path.relative(assetsDir, file).replace(/\\/g, "/");
}

function includesAny(text, needles) {
  const lower = String(text || "").toLowerCase();
  return needles.some((needle) => lower.includes(String(needle).toLowerCase()));
}

function buildSignals({ combinedText = "", changedFiles = [], movementPct = 0, recentChangesCount = 0 }) {
  const frontendHits = [];
  const infraHits = [];
  const rewardsHits = [];
  const behaviorHits = [];
  const onchainHits = [];

  const walletKeywords = [
    "wallet",
    "connect wallet",
    "solana",
    "ethereum",
    "phantom",
    "metamask",
    "account",
  ];

  const rewardKeywords = [
    "reward",
    "rewards",
    "claim",
    "claim now",
    "distribution",
    "points",
    "epoch",
    "airdrop",
    "payout",
    "eligible",
    "available rewards",
  ];

  const rewardActivationKeywords = [
    "claim",
    "claim now",
    "eligible",
    "available rewards",
    "canclaim",
    "isenabled",
    "active",
  ];

  const authKeywords = [
    "verify",
    "signin",
    "signmessage",
    "verifysignature",
    "nonce",
    "account",
  ];

  const ctaKeywords = [
    "connect",
    "launch",
    "enter",
    "start",
    "claim now",
    "portal",
    "available rewards",
  ];

  const disabledKeywords = [
    "disabled",
    "aria-disabled",
    "pointer-events-none",
    "opacity-50",
  ];

  const enabledKeywords = [
    "enabled",
    "isenabled",
    "active",
    "canclaim",
  ];

  const hasWalletStrings = includesAny(combinedText, walletKeywords);
  const hasRewardLogic = includesAny(combinedText, rewardKeywords);
  const hasRewardActivation = includesAny(combinedText, rewardActivationKeywords);
  const hasAuthSignals = includesAny(combinedText, authKeywords);
  const hasConnectUI = includesAny(combinedText, ctaKeywords);
  const hasDisabledState = includesAny(combinedText, disabledKeywords);
  const hasEnabledState = includesAny(combinedText, enabledKeywords);
  const hasVisibleCTAChange = includesAny(combinedText, ["connect", "claim", "launch", "portal"]);
  const hasClaimSignal = includesAny(combinedText, ["claim", "claim now", "canclaim"]);
  const hasEligibilitySignal = includesAny(combinedText, ["eligible", "available rewards"]);
  const hasActiveSignal = includesAny(combinedText, ["active", "enabled", "isenabled"]);

  if (hasWalletStrings) frontendHits.push("wallet_strings");
  if (hasConnectUI) frontendHits.push("connect_ui");
  if (hasDisabledState) frontendHits.push("disabled_state");
  if (hasEnabledState) frontendHits.push("enabled_state");
  if (hasVisibleCTAChange) frontendHits.push("cta_change");
  if (hasAuthSignals) frontendHits.push("auth_flow");

  const hasNewChunks = changedFiles.some((file) =>
    file.includes("_next/static") || file.endsWith(".js") || file.endsWith(".css")
  );

  if (hasNewChunks) infraHits.push("new_chunks");
  if (changedFiles.some((file) => file.endsWith(".css"))) infraHits.push("css_change");
  if (changedFiles.some((file) => file.endsWith(".js"))) infraHits.push("js_change");
  if (changedFiles.length >= 4) behaviorHits.push("multi_file_burst");

  if (hasRewardLogic) rewardsHits.push("reward_logic");
  if (hasRewardActivation) rewardsHits.push("reward_activation");
  if (hasClaimSignal) rewardsHits.push("claim_signal");
  if (hasEligibilitySignal) rewardsHits.push("eligibility_signal");
  if (hasActiveSignal) rewardsHits.push("active_signal");

  if (movementPct >= 10) behaviorHits.push("movement_spike");
  if (recentChangesCount >= 3) behaviorHits.push("recent_change_cluster");
  if (hasEnabledState && !hasDisabledState) behaviorHits.push("enabled_without_disabled");
  if (hasClaimSignal && hasEligibilitySignal) behaviorHits.push("claim_eligibility_convergence");
  if (hasWalletStrings && hasAuthSignals && hasRewardActivation) {
    behaviorHits.push("wallet_auth_reward_convergence");
  }

  const hasOnchainMovement = false;

  const frontendScore = Math.min(frontendHits.length * 20, 100);
  const infraScore = Math.min(infraHits.length * 20, 100);
  const rewardsScore = Math.min(rewardsHits.length * 25, 100);
  const behaviorScore = Math.min(behaviorHits.length * 25, 100);
  const onchainScore = Math.min(onchainHits.length * 30, 100);

  return {
    frontend: frontendHits,
    infra: infraHits,
    rewards: rewardsHits,
    behavior: behaviorHits,
    onchain: onchainHits,
    frontendScore,
    infraScore,
    rewardsScore,
    behaviorScore,
    onchainScore,
    movementPct,
    recentChangesCount,
    hasWalletStrings,
    hasConnectUI,
    hasDisabledState,
    hasEnabledState,
    hasRewardLogic,
    hasRewardActivation,
    hasAuthSignals,
    hasClaimSignal,
    hasEligibilitySignal,
    hasActiveSignal,
    hasOnchainMovement,
    hasNewChunks,
    hasVisibleCTAChange,
  };
}

function detectGroups(signals) {
  const detectedGroups = [];

  for (const [group, keywords] of Object.entries(SIGNAL_GROUPS)) {
    if (signals.some((signal) => keywords.includes(signal))) {
      detectedGroups.push(group);
    }
  }

  return detectedGroups;
}

function buildInsight(movementPct, signals, detectedGroups) {
  let insight = "No significant activity detected";
  let confidence = 0.2;

  const hasClaim = signals.includes("claim") || signals.includes("claim now") || signals.includes("canclaim");
  const hasEligible = signals.includes("eligible") || signals.includes("available rewards");
  const hasActive = signals.includes("active") || signals.includes("enabled") || signals.includes("isenabled");
  const hasWallet = signals.includes("connect") || signals.includes("wallet") || signals.includes("solana") || signals.includes("ethereum");
  const hasAuth = signals.includes("verify") || signals.includes("signin") || signals.includes("signmessage") || signals.includes("verifysignature") || signals.includes("nonce");

  if (movementPct > 20 && hasClaim && hasEligible && hasActive) {
    insight = "Eligibility, claim, and activation signals are converging strongly";
    confidence = 0.95;
  } else if (movementPct > 15 && hasClaim && hasEligible) {
    insight = "Claim readiness and eligibility indicators detected";
    confidence = 0.9;
  } else if (movementPct > 15 && hasWallet && hasAuth && hasClaim) {
    insight = "Wallet-auth-reward stack appears to be converging toward activation";
    confidence = 0.88;
  } else if (movementPct > 30 && hasClaim) {
    insight = "Strong indicators of claim or reward activation";
    confidence = 0.9;
  } else if (movementPct > 20 && detectedGroups.includes("AUTH")) {
    insight = "Authentication-related changes detected, possible gated feature";
    confidence = 0.75;
  } else if (movementPct > 20 && detectedGroups.includes("CHAIN")) {
    insight = "Blockchain connection flow evolving (wallet or network activity)";
    confidence = 0.7;
  } else if (movementPct > 10 && hasActive) {
    insight = "Activation-related state changes detected in frontend flow";
    confidence = 0.68;
  } else if (movementPct > 10) {
    insight = "Moderate frontend activity detected";
    confidence = 0.55;
  }

  return { insight, confidence };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readJsonArraySafe(filePath) {
  if (!(await fs.pathExists(filePath))) return [];
  try {
    const data = await fs.readJson(filePath);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function dedupeById(items) {
  return items.filter((item, index, arr) => {
    if (!item || !item.id) return false;
    return arr.findIndex((x) => x && x.id === item.id) === index;
  });
}

function normalizePatternEntry(pattern) {
  if (typeof pattern === "string") {
    return {
      tag: pattern,
      boost: 0,
      confidence: "INFO",
      reasons: [],
    };
  }

  return {
    tag: pattern?.tag || "UNKNOWN",
    boost: pattern?.boost ?? 0,
    confidence: pattern?.confidence || "INFO",
    reasons: ensureArray(pattern?.reasons),
  };
}

function round(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function clampPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, round(n)));
}

function normalizeScoreToPercent(rawScore) {
  const n = Number(rawScore || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;

  const normalized = Math.log10(n + 1) * 50;
  return clampPercent(normalized);
}

function classifyIntensity(rawScore) {
  const n = Number(rawScore || 0);

  if (n >= 100) return "EXTREME";
  if (n >= 70) return "VERY HIGH";
  if (n >= 40) return "HIGH";
  if (n >= 15) return "MEDIUM";
  return "LOW";
}

function evaluateAlpha(latest) {
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);
  const trend = Number(latest.trend || 0);
  const patternBoost = Number(latest?.breakdown?.patternBoost || 0);

  const tags = latest.tags || [];
  const signals = latest.signals || [];

  let alphaRaw =
    score * 0.35 +
    movementPct * 0.15 +
    trend * 1.5 +
    patternBoost * 0.6;

  const hasRewards =
    tags.includes("REWARDS") ||
    signals.includes("reward") ||
    signals.includes("claim") ||
    signals.includes("payout") ||
    signals.includes("eligible") ||
    signals.includes("canclaim");

  const hasWalletStack =
    (signals.includes("connect") || signals.includes("wallet")) &&
    (signals.includes("ethereum") || signals.includes("solana"));

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth") ||
    signals.includes("signin") ||
    signals.includes("signmessage") ||
    signals.includes("verifysignature") ||
    signals.includes("nonce");

  const hasActivation =
    signals.includes("enabled") ||
    signals.includes("isenabled") ||
    signals.includes("active");

  if (hasRewards) alphaRaw += 12;
  if (hasWalletStack) alphaRaw += 10;
  if (hasAuth) alphaRaw += 6;
  if (hasActivation) alphaRaw += 8;
  if (signals.includes("claim")) alphaRaw += 10;
  if (signals.includes("eligible")) alphaRaw += 8;
  if (signals.includes("canclaim")) alphaRaw += 8;

  const alphaScore = Math.max(0, Math.min(100, Math.round(alphaRaw)));

  let alphaClass = "NOISE";
  if (alphaScore >= 85) alphaClass = "CRITICAL";
  else if (alphaScore >= 70) alphaClass = "ACTIONABLE";
  else if (alphaScore >= 50) alphaClass = "SETUP";
  else if (alphaScore >= 25) alphaClass = "WATCH";

  let triggerState = "IDLE";
  if (alphaScore >= 85) triggerState = "TRIGGERED";
  else if (alphaScore >= 70) triggerState = "ARMED";
  else if (alphaScore >= 25) triggerState = "WATCHING";

  let suggestedAction = "Ignore noise and continue baseline monitoring.";

  if (alphaClass === "WATCH") {
    suggestedAction = "Watch closely and wait for confirmation.";
  } else if (alphaClass === "SETUP") {
    suggestedAction = "Track closely, compare against previous sweeps, and prepare alerts.";
  } else if (alphaClass === "ACTIONABLE") {
    suggestedAction = "High-conviction setup. Escalate alerts and monitor aggressively.";
  } else if (alphaClass === "CRITICAL") {
    suggestedAction = "Critical signal. Treat as imminent event candidate and escalate immediately.";
  }

  return {
    alphaScore,
    alphaClass,
    triggerState,
    suggestedAction,
  };
}

function detectEventType(latest) {
  const tags = latest.tags || [];
  const signals = latest.signals || [];
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);
  const level = latest.level || "LOW";

  const hasRewards =
    tags.includes("REWARDS") ||
    signals.includes("reward") ||
    signals.includes("claim") ||
    signals.includes("payout") ||
    signals.includes("airdrop") ||
    signals.includes("eligible") ||
    signals.includes("canclaim");

  const hasWallet =
    signals.includes("connect") ||
    signals.includes("wallet") ||
    signals.includes("ethereum") ||
    signals.includes("solana") ||
    tags.includes("CHAIN");

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth") ||
    signals.includes("signin") ||
    signals.includes("signmessage") ||
    signals.includes("verifysignature") ||
    signals.includes("nonce");

  const hasPortal =
    tags.includes("SYSTEM") ||
    signals.includes("portal");

  const hasActivation =
    signals.includes("enabled") ||
    signals.includes("isenabled") ||
    signals.includes("active");

  if (hasRewards && hasWallet && hasAuth && hasActivation && score >= 70) {
    return "REWARD ACTIVATION";
  }

  if (
    hasRewards &&
    (signals.includes("claim") || signals.includes("eligible") || signals.includes("canclaim")) &&
    score >= 60
  ) {
    return "CLAIM READINESS";
  }

  if (hasWallet && hasAuth && movementPct >= 10) {
    return "WALLET ENABLEMENT";
  }

  if (hasAuth && score >= 45) {
    return "AUTH STACK CHANGE";
  }

  if (hasPortal && movementPct >= 10) {
    return "PORTAL ARMING";
  }

  if (level === "VERY HIGH") {
    return "HIGH-PRIORITY SYSTEM EVENT";
  }

  if (level === "HIGH") {
    return "ELEVATED SIGNAL EVENT";
  }

  return "NOISE";
}

function classifySignalRegime(latest, alpha, eventType) {
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);
  const trend = Number(latest.trend || 0);
  const tags = latest.tags || [];
  const signals = latest.signals || [];

  const hasRewards =
    tags.includes("REWARDS") ||
    signals.includes("reward") ||
    signals.includes("claim") ||
    signals.includes("payout") ||
    signals.includes("airdrop") ||
    signals.includes("eligible") ||
    signals.includes("canclaim");

  const hasWallet =
    signals.includes("connect") ||
    signals.includes("wallet") ||
    signals.includes("ethereum") ||
    signals.includes("solana") ||
    tags.includes("CHAIN");

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth") ||
    signals.includes("signin") ||
    signals.includes("signmessage") ||
    signals.includes("verifysignature") ||
    signals.includes("nonce");

  if (
    alpha.triggerState === "TRIGGERED" &&
    alpha.alphaClass === "CRITICAL" &&
    (
      eventType === "REWARD ACTIVATION" ||
      eventType === "CLAIM READINESS" ||
      (hasRewards && hasWallet && hasAuth) ||
      (score >= 75 && movementPct >= 15 && trend >= 3)
    )
  ) {
    return "PRE-LAUNCH REAL";
  }

  if (
    alpha.alphaClass === "ACTIONABLE" ||
    alpha.triggerState === "ARMED" ||
    eventType === "WALLET ENABLEMENT" ||
    eventType === "PORTAL ARMING" ||
    eventType === "CLAIM READINESS"
  ) {
    return "HIGH-CONVICTION SETUP";
  }

  if (
    alpha.alphaClass === "SETUP" ||
    alpha.alphaClass === "WATCH" ||
    hasAuth
  ) {
    return "TRANSITIONAL SIGNAL";
  }

  return "NOISE DISGUISED AS SIGNAL";
}

function detectSignalFusion(latest, alpha, eventType, signalRegime) {
  const tags = latest.tags || [];
  const signals = latest.signals || [];
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);
  const patternBoost = Number(latest?.breakdown?.patternBoost || 0);

  const hasRewards =
    tags.includes("REWARDS") ||
    signals.includes("reward") ||
    signals.includes("claim") ||
    signals.includes("payout") ||
    signals.includes("airdrop") ||
    signals.includes("eligible") ||
    signals.includes("canclaim");

  const hasWallet =
    signals.includes("connect") ||
    signals.includes("wallet") ||
    signals.includes("ethereum") ||
    signals.includes("solana") ||
    tags.includes("CHAIN");

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth") ||
    signals.includes("signin") ||
    signals.includes("signmessage") ||
    signals.includes("verifysignature") ||
    signals.includes("nonce");

  const hasActivation =
    signals.includes("enabled") ||
    signals.includes("isenabled") ||
    signals.includes("active");

  const strongAlpha =
    alpha.alphaClass === "CRITICAL" ||
    alpha.alphaClass === "ACTIONABLE" ||
    alpha.triggerState === "TRIGGERED" ||
    alpha.triggerState === "ARMED";

  if (
    hasRewards &&
    hasWallet &&
    hasAuth &&
    hasActivation &&
    strongAlpha &&
    score >= 70 &&
    patternBoost >= 20
  ) {
    return "FULL ACTIVATION STACK";
  }

  if (hasRewards && hasWallet && hasAuth) {
    return "REWARD + WALLET + AUTH CLUSTER";
  }

  if (
    eventType !== "NOISE" &&
    (score >= 45 || movementPct >= 10 || Number(latest.trend || 0) >= 3)
  ) {
    return "ELEVATED MULTI-SIGNAL EVENT";
  }

  return "UNCLASSIFIED SIGNAL MIX";
}

function getPriority(latest) {
  const tags = latest.tags || [];

  if (tags.includes("LAUNCH_IMMINENT")) return "CRITICAL";
  if (tags.includes("CONFIRMED_ACTIVATION")) return "CRITICAL";
  if (latest.level === "VERY HIGH") return "VERY HIGH";
  if (latest.level === "HIGH") return "HIGH";
  if (latest.level === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function getEta(latest) {
  const tags = latest.tags || [];
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);
  const trend = String(latest.trendDirection || "FLAT");

  if (tags.includes("LAUNCH_IMMINENT")) return "< 2h";
  if (tags.includes("CONFIRMED_ACTIVATION")) return "< 6h";
  if (score >= 80 && movementPct >= 20 && trend === "UP") return "< 24h";
  if (score >= 65) return "24h - 72h";
  if (score >= 45) return "monitoring";
  return "unknown";
}

function getTopPatterns(latest, limit = 3) {
  return Array.isArray(latest.patterns) ? latest.patterns.slice(0, limit) : [];
}

function buildSignature(latest) {
  const tags = (latest.tags || []).slice().sort().join("|");
  const patternTags = getTopPatterns(latest, 5)
    .map((p) => (typeof p === "string" ? p : p?.tag || "UNKNOWN"))
    .sort()
    .join("|");
  const level = latest.level || "LOW";
  const scoreBand = Math.floor(Number(latest.score || 0) / 5) * 5;
  return `${level}::${scoreBand}::${tags}::${patternTags}`;
}

function buildAlertSignatureStable(latest) {
  const normalizeList = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") return x.tag || JSON.stringify(x);
        return "";
      })
      .filter(Boolean)
      .sort();

  const stable = {
    level: latest.level || "LOW",
    score: Math.round(Number(latest.score || 0)),
    movementPct: Math.round(Number(latest.movementPct || 0)),
    alphaScore: Math.round(Number(latest.alphaScore || 0)),
    alphaClass: latest.alphaClass || "NOISE",
    triggerState: latest.triggerState || "IDLE",
    eventType: latest.eventType || "NOISE",
    signalFusion: latest.signalFusion || "",
    signalRegime: latest.signalRegime || "",
    priority: latest.priority || "LOW",
    eta: latest.eta || "unknown",
    insight: latest.insight || "",
    tags: normalizeList(latest.tags),
    signals: normalizeList(latest.signals),
    patterns: normalizeList(latest.patterns),
  };

  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

async function persistDetectionOutputs({ publicDir, result }) {
  const latestPath = path.join(publicDir, "latest.json");
  const historyPath = path.join(publicDir, "history.json");
  const lastTriggeredPath = path.join(publicDir, "last-triggered.json");

  await fs.ensureDir(publicDir);

  const existingHistory = await readJsonArraySafe(historyPath);

  await fs.writeJson(latestPath, result, { spaces: 2 });

  const nextHistory = dedupeById([result, ...existingHistory]).slice(0, MAX_HISTORY);
  await fs.writeJson(historyPath, nextHistory, { spaces: 2 });

  if (TRIGGER_PRIORITIES.has(result.priority)) {
    await fs.writeJson(lastTriggeredPath, result, { spaces: 2 });
  }
}

async function main() {
  const { oldDir, newDir } = await loadLatestSnapshots();

  const oldFiles = oldDir ? await readAssets(oldDir) : [];
  const newFiles = await readAssets(newDir);

  const oldMap = new Map(oldFiles.map((file) => [toAssetRelative(oldDir, file), file]));
  const newMap = new Map(newFiles.map((file) => [toAssetRelative(newDir, file), file]));

  let added = 0;
  let changed = 0;
  const allSignals = new Set();
  const changedFiles = [];
  const changedContents = [];

  for (const [name, newFile] of newMap.entries()) {
    if (!oldMap.has(name)) {
      added++;
      changedFiles.push(name);
      const content = await readFileSafe(newFile);
      changedContents.push(content);
      scoreSignals(content).forEach((signal) => allSignals.add(signal));
      continue;
    }

    const oldContent = await readFileSafe(oldMap.get(name));
    const newContent = await readFileSafe(newFile);

    if (oldContent !== newContent) {
      changed++;
      changedFiles.push(name);
      changedContents.push(newContent);
      scoreSignals(newContent).forEach((signal) => allSignals.add(signal));
    }
  }

  const totalFiles = newFiles.length;
  const movementCount = added + changed;
  const movementPct = totalFiles > 0 ? Number(((movementCount / totalFiles) * 100).toFixed(2)) : 0;
  const addedPct = totalFiles > 0 ? Number(((added / totalFiles) * 100).toFixed(2)) : 0;
  const changedPct = totalFiles > 0 ? Number(((changed / totalFiles) * 100).toFixed(2)) : 0;

  const combinedText = changedContents.join("\n\n");
  const recentChangesCount = movementCount;

  const publicDir = path.join(__dirname, "..", "public", "data");
  const historyPath = path.join(publicDir, "history.json");
  const existingHistory = await readJsonArraySafe(historyPath);

  const advancedSignals = buildSignals({
    combinedText,
    changedFiles,
    movementPct,
    recentChangesCount,
  });

  const signals = [...allSignals];
  const detectedGroups = detectGroups(signals);
  const radarScore = computeRadarScore(advancedSignals, existingHistory);

  let weightedRawScore = Number(radarScore.score || 0);

  if (signals.includes("claim")) weightedRawScore += 10;
  if (signals.includes("claim now")) weightedRawScore += 8;
  if (signals.includes("eligible")) weightedRawScore += 8;
  if (signals.includes("active")) weightedRawScore += 6;
  if (signals.includes("canclaim")) weightedRawScore += 8;
  if (signals.includes("isenabled")) weightedRawScore += 8;
  if (signals.includes("enabled")) weightedRawScore += 5;
  if (signals.includes("available rewards")) weightedRawScore += 6;
  if (signals.includes("signmessage")) weightedRawScore += 4;
  if (signals.includes("verifysignature")) weightedRawScore += 4;
  if (signals.includes("nonce")) weightedRawScore += 3;

  const draftSnapshot = {
    id: path.basename(newDir),
    totalFiles,
    added,
    changed,
    movementCount,
    movementPct,
    addedPct,
    changedPct,
    signals,
    tags: detectedGroups,
    changedFiles,
  };

  const { insight, confidence } = buildInsight(movementPct, signals, detectedGroups);

  const summary = !oldDir
    ? `Primera captura base generada con ${totalFiles} archivos. Aún no hay comparación histórica.`
    : movementCount === 0
      ? `No se detectaron cambios en ${totalFiles} archivos analizados.`
      : `${movementCount} de ${totalFiles} archivos muestran movimiento (${movementPct}%). ${added} nuevos (${addedPct}%) y ${changed} modificados (${changedPct}).${
          signals.length ? ` Señales: ${signals.join(", ")}.` : " Sin señales relevantes."
        }`;

  const intelligence = summarizeRadarIntelligence(draftSnapshot, existingHistory);

  const note = !oldDir
    ? "Primera corrida base. El siguiente snapshot permitirá detectar cambios."
    : weightedRawScore >= 100
      ? "Señales muy fuertes de activación real o launch inminente."
      : radarScore.level === "CRITICAL"
        ? "Señales muy fuertes de posible launch imminente."
        : radarScore.level === "VERY HIGH"
          ? "Señales fuertes de activación o pre-launch."
          : radarScore.level === "HIGH"
            ? "Cambios importantes en frontend y señales relevantes."
            : radarScore.level === "MEDIUM"
              ? "Actividad de desarrollo visible."
              : "Sin señales fuertes por ahora.";

  const snapshotId = path.basename(newDir);
  const generatedAt = new Date().toISOString();
  const normalizedPatterns = ensureArray(radarScore.patterns).map(normalizePatternEntry);
  const rawScore = round(weightedRawScore);
  const scorePercent = normalizeScoreToPercent(rawScore);
  const movementPercent = clampPercent(movementPct);
  const addedPercent = clampPercent(addedPct);
  const changedPercent = clampPercent(changedPct);
  const activationPercent = clampPercent(intelligence.activationProbability);
  const intensityClass = classifyIntensity(rawScore);
  const overdrive = rawScore > 100;

  let effectiveLevel = radarScore.level;
  if (rawScore >= 100) effectiveLevel = "CRITICAL";
  else if (rawScore >= 70) effectiveLevel = "VERY HIGH";
  else if (rawScore >= 40) effectiveLevel = "HIGH";
  else if (rawScore >= 15) effectiveLevel = "MEDIUM";
  else effectiveLevel = "LOW";

  const baseResult = {
    id: `${snapshotId}__${generatedAt}`,
    snapshotId,
    totalFiles,
    added,
    changed,
    movementCount,
    movementPct,
    addedPct,
    changedPct,
    rawScore,
    rawActivationProbability: round(intelligence.activationProbability),
    movementPercent,
    addedPercent,
    changedPercent,
    scorePercent,
    activationProbability: activationPercent,
    score: rawScore,
    intensityClass,
    overdrive,
    signals,
    patternScore: intelligence.patternScore,
    patterns: normalizedPatterns,
    level: effectiveLevel,
    significance: intelligence.significance,
    rarityScore: intelligence.rarityScore,
    focusAreas: ensureArray(intelligence.focusAreas),
    sensitiveHits: ensureArray(intelligence.sensitiveHits),
    changeTypes: ensureArray(intelligence.changeTypes),
    insight,
    confidence,
    tags: [...new Set([...detectedGroups, ...ensureArray(radarScore.tags)])],
    summary,
    note,
    changedFiles,
    generatedAt,
    trend: radarScore.trend,
    trendDirection: radarScore.trendDirection,
    breakdown: {
      ...(radarScore.breakdown || {}),
      weightedBoost: round(rawScore - Number(radarScore.score || 0)),
    },
    advancedSignals,
    whyItMatters: intelligence.whyItMatters || "",
  };

  const alpha = evaluateAlpha(baseResult);
  const eventType = detectEventType(baseResult);
  const signalRegime = classifySignalRegime(baseResult, alpha, eventType);
  const signalFusion = detectSignalFusion(baseResult, alpha, eventType, signalRegime);
  const priority = getPriority(baseResult);
  const eta = getEta(baseResult);

  const result = {
    ...baseResult,
    alphaScore: alpha.alphaScore,
    alphaClass: alpha.alphaClass,
    triggerState: alpha.triggerState,
    suggestedAction: alpha.suggestedAction,
    eventType,
    signalRegime,
    signalFusion,
    priority,
    eta,
  };

  result.signature = buildSignature(result);
  result.alertSignature = buildAlertSignatureStable(result);

  await persistDetectionOutputs({
    publicDir,
    result,
  });

  console.log("Archivo generado:");
  console.log(path.join(publicDir, "latest.json"));
  console.log(JSON.stringify(result, null, 2));

  console.log("=== SYNC_STATUS ===");
  console.log(
    JSON.stringify(
      {
        id: result.id,
        snapshotId: result.snapshotId,
        generatedAt: result.generatedAt,
        rawScore: round(result.rawScore ?? result.score),
        scorePercent: round(result.scorePercent),
        movementPercent: round(result.movementPercent),
        activationProbability: round(result.activationProbability),
        intensityClass: result.intensityClass,
        overdrive: !!result.overdrive,
        level: result.level,
        priority: result.priority,
        alphaScore: result.alphaScore,
        alphaClass: result.alphaClass,
        triggerState: result.triggerState,
        eventType: result.eventType,
        signalFusion: result.signalFusion,
        signalRegime: result.signalRegime,
        eta: result.eta,
        signature: result.signature,
        alertSignature: result.alertSignature,
        wroteLatest: true,
        wroteHistory: true,
        wroteLastTriggered: TRIGGER_PRIORITIES.has(result.priority),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});