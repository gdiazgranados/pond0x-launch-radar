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
  CHAIN: ["ethereum", "solana", "connect", "wallet"],
  SYSTEM: ["enabled", "disabled", "isenabled", "portal", "launch", "active"],
};

const DISCOVERY_CRITICAL_KEYWORDS = [
  "claim",
  "claim now",
  "eligible",
  "active",
  "canclaim",
  "isenabled",
  "enabled",
  "available rewards",
  "reward",
  "rewards",
  "wallet",
  "account",
  "verify",
  "signin",
  "signmessage",
  "verifysignature",
  "nonce",
  "portal",
];

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

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSortedStrings(values) {
  return [...new Set(ensureArray(values).map((x) => String(x || "").trim()).filter(Boolean))].sort();
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

async function readJsonSafe(filePath, fallback = {}) {
  if (!(await fs.pathExists(filePath))) return fallback;
  try {
    return await fs.readJson(filePath);
  } catch {
    return fallback;
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

function detectGroups(signals) {
  const detectedGroups = [];

  for (const [group, keywords] of Object.entries(SIGNAL_GROUPS)) {
    if (signals.some((signal) => keywords.includes(signal))) {
      detectedGroups.push(group);
    }
  }

  return detectedGroups;
}

async function writeJsonAtomic(filePath, data, spaces = 2) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );

  await fs.ensureDir(dir);
  await fs.writeJson(tmpPath, data, { spaces });
  await fs.move(tmpPath, filePath, { overwrite: true });
}

function buildSignals({
  combinedText = "",
  changedFiles = [],
  movementPct = 0,
  recentChangesCount = 0,
  discovery = {},
  backendSignals = [],
}) {
  const frontendHits = [];
  const infraHits = [];
  const rewardsHits = [];
  const behaviorHits = [];

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

  const discoveryKeywords = uniqueSortedStrings(discovery.criticalKeywords);
  const discoveryApiRoutes = uniqueSortedStrings(discovery.newApiRoutes);
  const discoveryCandidate = String(discovery.keyFunctionCandidate || "").toLowerCase();
  const backendSignalsText = uniqueSortedStrings(backendSignals).join(" ");

  const discoveryText = [
    combinedText,
    discoveryKeywords.join(" "),
    discoveryApiRoutes.join(" "),
    discoveryCandidate,
    backendSignalsText,
  ].join("\n");

  const hasWalletStrings = includesAny(discoveryText, walletKeywords);
  const hasRewardLogic = includesAny(discoveryText, rewardKeywords);
  const hasRewardActivation = includesAny(discoveryText, rewardActivationKeywords);
  const hasAuthSignals = includesAny(discoveryText, authKeywords);
  const hasConnectUI = includesAny(discoveryText, ctaKeywords);
  const hasDisabledState = includesAny(discoveryText, disabledKeywords);
  const hasEnabledState = includesAny(discoveryText, enabledKeywords);
  const hasVisibleCTAChange = includesAny(discoveryText, ["connect", "claim", "launch", "portal"]);
  const hasClaimSignal = includesAny(discoveryText, ["claim", "claim now", "canclaim"]);
  const hasEligibilitySignal = includesAny(discoveryText, ["eligible", "available rewards", "eligible_true"]);
  const hasActiveSignal = includesAny(discoveryText, ["active", "enabled", "isenabled", "active_true", "enabled_true"]);
  const hasApiSurface = discoveryApiRoutes.length > 0;
  const hasClaimApi = discoveryApiRoutes.some((x) => x.includes("claim"));
  const hasRewardApi = discoveryApiRoutes.some((x) => x.includes("reward"));
  const hasAuthApi = discoveryApiRoutes.some((x) => x.includes("auth") || x.includes("verify") || x.includes("nonce"));
  const hasAccountApi = discoveryApiRoutes.some((x) => x.includes("account") || x.includes("user") || x.includes("wallet"));

  const hasEligibleTrue = backendSignals.includes("eligible_true");
  const hasCanClaimTrue = backendSignals.includes("canclaim_true");
  const hasEnabledTrue = backendSignals.includes("enabled_true");
  const hasActiveTrue = backendSignals.includes("active_true");
  const hasRewardsArray = backendSignals.includes("rewards_array");

  if (hasWalletStrings) frontendHits.push("wallet_strings");
  if (hasConnectUI) frontendHits.push("connect_ui");
  if (hasDisabledState) frontendHits.push("disabled_state");
  if (hasEnabledState) frontendHits.push("enabled_state");
  if (hasVisibleCTAChange) frontendHits.push("cta_change");
  if (hasAuthSignals) frontendHits.push("auth_flow");
  if (hasApiSurface) frontendHits.push("api_surface");

  const hasNewChunks = changedFiles.some(
    (file) => file.includes("_next/static") || file.endsWith(".js") || file.endsWith(".css")
  );

  if (hasNewChunks) infraHits.push("new_chunks");
  if (changedFiles.some((file) => file.endsWith(".css"))) infraHits.push("css_change");
  if (changedFiles.some((file) => file.endsWith(".js"))) infraHits.push("js_change");
  if (hasClaimApi) infraHits.push("claim_api");
  if (hasRewardApi) infraHits.push("reward_api");
  if (hasAuthApi) infraHits.push("auth_api");
  if (hasAccountApi) infraHits.push("account_api");

  if (changedFiles.length >= 4) behaviorHits.push("multi_file_burst");

  if (hasRewardLogic) rewardsHits.push("reward_logic");
  if (hasRewardActivation) rewardsHits.push("reward_activation");
  if (hasClaimSignal) rewardsHits.push("claim_signal");
  if (hasEligibilitySignal) rewardsHits.push("eligibility_signal");
  if (hasActiveSignal) rewardsHits.push("active_signal");
  if (hasClaimApi) rewardsHits.push("claim_api_signal");
  if (hasRewardApi) rewardsHits.push("reward_api_signal");
  if (hasEligibleTrue) rewardsHits.push("eligible_true_signal");
  if (hasCanClaimTrue) rewardsHits.push("canclaim_true_signal");
  if (hasEnabledTrue) rewardsHits.push("enabled_true_signal");
  if (hasActiveTrue) rewardsHits.push("active_true_signal");
  if (hasRewardsArray) rewardsHits.push("rewards_array_signal");

  if (movementPct >= 10) behaviorHits.push("movement_spike");
  if (recentChangesCount >= 3) behaviorHits.push("recent_change_cluster");
  if (hasEnabledState && !hasDisabledState) behaviorHits.push("enabled_without_disabled");
  if (hasClaimSignal && hasEligibilitySignal) behaviorHits.push("claim_eligibility_convergence");
  if (hasWalletStrings && hasAuthSignals && hasRewardActivation) {
    behaviorHits.push("wallet_auth_reward_convergence");
  }
  if (discoveryKeywords.length >= 2) behaviorHits.push("discovery_keyword_cluster");
  if (hasApiSurface && discoveryCandidate) behaviorHits.push("api_surface_candidate");
  if (hasEligibleTrue && hasCanClaimTrue) behaviorHits.push("backend_claim_activation");
  if (hasEnabledTrue || hasActiveTrue) behaviorHits.push("backend_enabled_state");
  if (hasRewardsArray) behaviorHits.push("backend_rewards_payload");

  const frontendScore = Math.min(frontendHits.length * 20, 100);
  const infraScore = Math.min(infraHits.length * 20, 100);
  const rewardsScore = Math.min(rewardsHits.length * 25, 100);
  const behaviorScore = Math.min(behaviorHits.length * 25, 100);

  return {
    frontend: frontendHits,
    infra: infraHits,
    rewards: rewardsHits,
    behavior: behaviorHits,
    frontendScore,
    infraScore,
    rewardsScore,
    behaviorScore,
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
    hasApiSurface,
    hasClaimApi,
    hasRewardApi,
    hasAuthApi,
    hasAccountApi,
    hasEligibleTrue,
    hasCanClaimTrue,
    hasEnabledTrue,
    hasActiveTrue,
    hasRewardsArray,
    hasNewChunks,
    hasVisibleCTAChange,
  };
}

function buildInsight(movementPct, signals, detectedGroups, discovery = {}, backendSignals = []) {
  let insight = "No significant activity detected";
  let confidence = 0.2;

  const hasClaim = signals.includes("claim") || signals.includes("claim now") || signals.includes("canclaim");
  const hasEligible = signals.includes("eligible") || signals.includes("available rewards");
  const hasActive = signals.includes("active") || signals.includes("enabled") || signals.includes("isenabled");
  const hasWallet =
    signals.includes("connect") ||
    signals.includes("wallet") ||
    signals.includes("solana") ||
    signals.includes("ethereum");
  const hasAuth =
    signals.includes("verify") ||
    signals.includes("signin") ||
    signals.includes("signmessage") ||
    signals.includes("verifysignature") ||
    signals.includes("nonce");

  const discoveryKeywords = uniqueSortedStrings(discovery.criticalKeywords);
  const discoveryApiRoutes = uniqueSortedStrings(discovery.newApiRoutes);
  const candidate = String(discovery.keyFunctionCandidate || "").toLowerCase();

  const hasDiscoveryClaim = discoveryKeywords.includes("claim") || candidate.includes("claim");
  const hasDiscoveryEligible = discoveryKeywords.includes("eligible");
  const hasDiscoveryActive =
    discoveryKeywords.includes("active") ||
    discoveryKeywords.includes("enabled") ||
    discoveryKeywords.includes("isenabled") ||
    discoveryKeywords.includes("canclaim");

  const hasApiCandidate = candidate.startsWith("api:");
  const hasCriticalCandidate = candidate.startsWith("critical:");
  const hasEligibleTrue = backendSignals.includes("eligible_true");
  const hasCanClaimTrue = backendSignals.includes("canclaim_true");
  const hasEnabledTrue = backendSignals.includes("enabled_true");
  const hasActiveTrue = backendSignals.includes("active_true");
  const hasRewardsArray = backendSignals.includes("rewards_array");

  if (hasEligibleTrue && hasCanClaimTrue) {
    insight = "Backend indicates eligibility and claim activation directly";
    confidence = 0.99;
  } else if ((hasEnabledTrue || hasActiveTrue) && hasRewardsArray) {
    insight = "Backend payload suggests active rewards state with claimable context";
    confidence = 0.96;
  } else if ((hasClaim || hasDiscoveryClaim) && (hasEligible || hasDiscoveryEligible) && (hasActive || hasDiscoveryActive)) {
    insight = "Eligibility, claim, and activation signals are converging strongly";
    confidence = 0.96;
  } else if (discoveryApiRoutes.length > 0 && (hasApiCandidate || hasCriticalCandidate)) {
    insight = "New API surface or critical discovery candidate detected alongside activation signals";
    confidence = 0.92;
  } else if (movementPct > 15 && (hasClaim || hasDiscoveryClaim) && (hasEligible || hasDiscoveryEligible)) {
    insight = "Claim readiness and eligibility indicators detected";
    confidence = 0.9;
  } else if (movementPct > 15 && hasWallet && hasAuth && (hasClaim || hasDiscoveryClaim)) {
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
  } else if ((movementPct > 10 && hasActive) || hasDiscoveryActive) {
    insight = "Activation-related state changes detected in frontend flow";
    confidence = 0.68;
  } else if (movementPct > 10) {
    insight = "Moderate frontend activity detected";
    confidence = 0.55;
  }

  return { insight, confidence };
}

function evaluateAlpha(latest) {
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);
  const trend = Number(latest.trend || 0);
  const patternBoost = Number(latest?.breakdown?.patternBoost || 0);

  const tags = latest.tags || [];
  const signals = latest.signals || [];
  const discovery = latest.discovery || {};
  const backendSignals = latest.backendSignals || [];

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
  if (ensureArray(discovery.newApiRoutes).length > 0) alphaRaw += 8;
  if (ensureArray(discovery.criticalKeywords).length >= 2) alphaRaw += 6;
  if (String(discovery.keyFunctionCandidate || "").startsWith("api:")) alphaRaw += 6;
  if (String(discovery.keyFunctionCandidate || "").startsWith("critical:")) alphaRaw += 8;
  if (backendSignals.includes("eligible_true")) alphaRaw += 15;
  if (backendSignals.includes("canclaim_true")) alphaRaw += 20;
  if (backendSignals.includes("enabled_true")) alphaRaw += 10;
  if (backendSignals.includes("active_true")) alphaRaw += 8;
  if (backendSignals.includes("rewards_array")) alphaRaw += 8;

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
  const discovery = latest.discovery || {};
  const backendSignals = latest.backendSignals || [];
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

  const hasPortal = tags.includes("SYSTEM") || signals.includes("portal");

  const hasActivation =
    signals.includes("enabled") ||
    signals.includes("isenabled") ||
    signals.includes("active");

  const discoveryApiRoutes = ensureArray(discovery.newApiRoutes);
  const hasClaimApi = discoveryApiRoutes.some((x) => String(x).includes("claim"));
  const hasRewardApi = discoveryApiRoutes.some((x) => String(x).includes("reward"));
  const hasAccountApi = discoveryApiRoutes.some(
    (x) => String(x).includes("account") || String(x).includes("user") || String(x).includes("wallet")
  );

  const hasEligibleTrue = backendSignals.includes("eligible_true");
  const hasCanClaimTrue = backendSignals.includes("canclaim_true");
  const hasEnabledTrue = backendSignals.includes("enabled_true");
  const hasActiveTrue = backendSignals.includes("active_true");
  const hasRewardsArray = backendSignals.includes("rewards_array");

  if ((hasEligibleTrue && hasCanClaimTrue) || (hasEnabledTrue && hasRewardsArray && score >= 70)) {
    return "REWARD ACTIVATION";
  }

  if (
    (hasClaimApi || hasRewardApi || hasEligibleTrue) &&
    (signals.includes("claim") || signals.includes("eligible") || signals.includes("canclaim") || hasCanClaimTrue) &&
    score >= 60
  ) {
    return "CLAIM READINESS";
  }

  if (hasRewards && hasWallet && hasAuth && hasActivation && score >= 70) {
    return "REWARD ACTIVATION";
  }

  if (hasWallet && (hasAuth || hasAccountApi) && movementPct >= 10) {
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
  const backendSignals = latest.backendSignals || [];

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

  const backendActivation =
    backendSignals.includes("eligible_true") ||
    backendSignals.includes("canclaim_true") ||
    backendSignals.includes("enabled_true") ||
    backendSignals.includes("active_true");

  if (
    alpha.triggerState === "TRIGGERED" &&
    alpha.alphaClass === "CRITICAL" &&
    (
      eventType === "REWARD ACTIVATION" ||
      eventType === "CLAIM READINESS" ||
      backendActivation ||
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

  if (alpha.alphaClass === "SETUP" || alpha.alphaClass === "WATCH" || hasAuth) {
    return "TRANSITIONAL SIGNAL";
  }

  return "NOISE DISGUISED AS SIGNAL";
}

function detectSignalFusion(latest, alpha, eventType) {
  const tags = latest.tags || [];
  const signals = latest.signals || [];
  const discovery = latest.discovery || {};
  const backendSignals = latest.backendSignals || [];
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

  const hasApiSurface = ensureArray(discovery.newApiRoutes).length > 0;
  const backendActivation =
    backendSignals.includes("eligible_true") ||
    backendSignals.includes("canclaim_true") ||
    backendSignals.includes("enabled_true") ||
    backendSignals.includes("active_true");

  const strongAlpha =
    alpha.alphaClass === "CRITICAL" ||
    alpha.alphaClass === "ACTIONABLE" ||
    alpha.triggerState === "TRIGGERED" ||
    alpha.triggerState === "ARMED";

  if (
    hasRewards &&
    hasWallet &&
    hasAuth &&
    (hasActivation || backendActivation) &&
    strongAlpha &&
    score >= 70 &&
    patternBoost >= 20
  ) {
    return "FULL ACTIVATION STACK";
  }

  if (hasRewards && hasWallet && hasAuth && hasApiSurface) {
    return "REWARD + WALLET + AUTH CLUSTER";
  }

  if (eventType !== "NOISE" && (score >= 45 || movementPct >= 10 || Number(latest.trend || 0) >= 3)) {
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
    backendSignals: normalizeList(latest.backendSignals || []),
    discoveryCriticalKeywords: normalizeList(latest.discovery?.criticalKeywords || []),
    discoveryApiRoutes: normalizeList(latest.discovery?.newApiRoutes || []),
    discoveryCandidate: String(latest.discovery?.keyFunctionCandidate || ""),
  };

  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

async function persistDetectionOutputs({ publicDir, result }) {
  const latestPath = path.join(publicDir, "latest.json");
  const historyPath = path.join(publicDir, "history.json");
  const lastTriggeredPath = path.join(publicDir, "last-triggered.json");

  await fs.ensureDir(publicDir);

  const existingHistory = await readJsonArraySafe(historyPath);
  const nextHistory = dedupeById([result, ...existingHistory]).slice(0, MAX_HISTORY);

  await writeJsonAtomic(latestPath, result);
  await writeJsonAtomic(historyPath, nextHistory);

  if (TRIGGER_PRIORITIES.has(result.priority)) {
    await writeJsonAtomic(lastTriggeredPath, result);
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
  const discoveryPath = path.join(publicDir, "discovery.json");
  const apiFile = path.join(newDir, "api.json");

  const existingHistory = await readJsonArraySafe(historyPath);
  const discovery = await readJsonSafe(discoveryPath, {
    checkedAt: null,
    sourceSnapshotId: null,
    snapshotDir: null,
    newUnknownChange: false,
    keyFunctionCandidate: null,
    newLabels: [],
    newRoutes: [],
    newApiRoutes: [],
    newKeywords: [],
    criticalKeywords: [],
  });
  const apiData = await readJsonSafe(apiFile, []);

  const discoveryCriticalKeywords = uniqueSortedStrings(discovery.criticalKeywords);
  const discoveryNewApiRoutes = uniqueSortedStrings(discovery.newApiRoutes);
  const discoveryNewLabels = uniqueSortedStrings(discovery.newLabels);
  const discoveryNewRoutes = uniqueSortedStrings(discovery.newRoutes);
  const discoveryNewKeywords = uniqueSortedStrings(discovery.newKeywords);
  const discoveryCandidate = String(discovery.keyFunctionCandidate || "");

  const backendSignals = [];
  for (const entry of ensureArray(apiData)) {
    for (const sig of ensureArray(entry.backendSignals)) {
      backendSignals.push(sig);
    }
  }
  const uniqueBackendSignals = uniqueSortedStrings(backendSignals);

  const advancedSignals = buildSignals({
    combinedText,
    changedFiles,
    movementPct,
    recentChangesCount,
    discovery: {
      ...discovery,
      criticalKeywords: discoveryCriticalKeywords,
      newApiRoutes: discoveryNewApiRoutes,
    },
    backendSignals: uniqueBackendSignals,
  });

  discoveryCriticalKeywords
    .filter((x) => DISCOVERY_CRITICAL_KEYWORDS.includes(x))
    .forEach((signal) => allSignals.add(signal));

  if (discoveryNewApiRoutes.some((x) => x.includes("claim"))) allSignals.add("claim");
  if (discoveryNewApiRoutes.some((x) => x.includes("reward"))) allSignals.add("reward");
  if (discoveryNewApiRoutes.some((x) => x.includes("verify"))) allSignals.add("verify");
  if (discoveryNewApiRoutes.some((x) => x.includes("nonce"))) allSignals.add("nonce");
  if (discoveryNewApiRoutes.some((x) => x.includes("account") || x.includes("user"))) allSignals.add("account");
  if (discoveryNewApiRoutes.some((x) => x.includes("wallet"))) allSignals.add("wallet");

  if (uniqueBackendSignals.includes("eligible_true")) allSignals.add("eligible");
  if (uniqueBackendSignals.includes("canclaim_true")) allSignals.add("canclaim");
  if (uniqueBackendSignals.includes("enabled_true")) allSignals.add("enabled");
  if (uniqueBackendSignals.includes("active_true")) allSignals.add("active");
  if (uniqueBackendSignals.includes("account_object")) allSignals.add("account");

  const signals = uniqueSortedStrings([...allSignals]);
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

  if (discovery.newUnknownChange) weightedRawScore += 4;
  if (discoveryNewApiRoutes.length >= 1) weightedRawScore += 8;
  if (discoveryNewApiRoutes.length >= 2) weightedRawScore += 6;
  if (discoveryCriticalKeywords.length >= 2) weightedRawScore += 6;
  if (discoveryCandidate.startsWith("api:")) weightedRawScore += 8;
  if (discoveryCandidate.startsWith("critical:")) weightedRawScore += 10;
  if (discoveryNewApiRoutes.some((x) => x.includes("claim"))) weightedRawScore += 10;
  if (discoveryNewApiRoutes.some((x) => x.includes("reward"))) weightedRawScore += 8;
  if (discoveryNewApiRoutes.some((x) => x.includes("verify") || x.includes("nonce"))) weightedRawScore += 6;
  if (discoveryNewApiRoutes.some((x) => x.includes("account") || x.includes("wallet") || x.includes("user"))) {
    weightedRawScore += 5;
  }

  if (uniqueBackendSignals.includes("eligible_true")) weightedRawScore += 20;
  if (uniqueBackendSignals.includes("canclaim_true")) weightedRawScore += 25;
  if (uniqueBackendSignals.includes("enabled_true")) weightedRawScore += 15;
  if (uniqueBackendSignals.includes("active_true")) weightedRawScore += 12;
  if (uniqueBackendSignals.includes("rewards_array")) weightedRawScore += 10;
  if (uniqueBackendSignals.includes("balance_detected")) weightedRawScore += 6;
  if (uniqueBackendSignals.includes("account_object")) weightedRawScore += 6;

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
    score: round(weightedRawScore),
    trend: radarScore.trend,
    trendDirection: radarScore.trendDirection,
    backendSignals: uniqueBackendSignals,
    summary: !oldDir
      ? `Primera captura base generada con ${totalFiles} archivos. Aún no hay comparación histórica.`
      : movementCount === 0
        ? `No se detectaron cambios en ${totalFiles} archivos analizados.`
        : `${movementCount} de ${totalFiles} archivos muestran movimiento (${movementPct}%). ${added} nuevos (${addedPct}%) y ${changed} modificados (${changedPct}).${
            signals.length ? ` Señales: ${signals.join(", ")}.` : " Sin señales relevantes."
          }`,
    note:
      weightedRawScore >= 100
        ? "Señales muy fuertes de activación real o launch inminente."
        : radarScore.level === "CRITICAL"
          ? "Señales muy fuertes de posible launch imminente."
          : radarScore.level === "VERY HIGH"
            ? "Señales fuertes de activación o pre-launch."
            : radarScore.level === "HIGH"
              ? "Cambios importantes en frontend y señales relevantes."
              : radarScore.level === "MEDIUM"
                ? "Actividad de desarrollo visible."
                : "Sin señales fuertes por ahora.",
  };

  const { insight, confidence } = buildInsight(
    movementPct,
    signals,
    detectedGroups,
    {
      ...discovery,
      criticalKeywords: discoveryCriticalKeywords,
      newApiRoutes: discoveryNewApiRoutes,
      keyFunctionCandidate: discoveryCandidate,
    },
    uniqueBackendSignals
  );

  const summary = !oldDir
    ? `Primera captura base generada con ${totalFiles} archivos. Aún no hay comparación histórica.`
    : movementCount === 0
      ? `No se detectaron cambios en ${totalFiles} archivos analizados.`
      : `${movementCount} de ${totalFiles} archivos muestran movimiento (${movementPct}%). ${added} nuevos (${addedPct}%) y ${changed} modificados (${changedPct}).${
          signals.length ? ` Señales: ${signals.join(", ")}.` : " Sin señales relevantes."
        }${
          discoveryNewApiRoutes.length ? ` API nuevas detectadas: ${discoveryNewApiRoutes.slice(0, 5).join(", ")}.` : ""
        }${
          uniqueBackendSignals.length ? ` Backend signals: ${uniqueBackendSignals.slice(0, 6).join(", ")}.` : ""
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
    portalArmed: !!intelligence.portalArmed,
    launchImminent: !!intelligence.launchImminent,
    signals,
    backendSignals: uniqueBackendSignals,
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
      discoveryApiCount: discoveryNewApiRoutes.length,
      discoveryKeywordCount: discoveryCriticalKeywords.length,
      backendSignalCount: uniqueBackendSignals.length,
    },
    advancedSignals,
    discovery: {
      checkedAt: discovery.checkedAt || null,
      sourceSnapshotId: discovery.sourceSnapshotId || null,
      snapshotDir: discovery.snapshotDir || null,
      newUnknownChange: !!discovery.newUnknownChange,
      keyFunctionCandidate: discoveryCandidate || null,
      newLabels: discoveryNewLabels.slice(0, 15),
      newRoutes: discoveryNewRoutes.slice(0, 15),
      newApiRoutes: discoveryNewApiRoutes.slice(0, 20),
      newKeywords: discoveryNewKeywords.slice(0, 20),
      criticalKeywords: discoveryCriticalKeywords.slice(0, 20),
    },
    whyItMatters: intelligence.whyItMatters || "",
  };

  const alpha = evaluateAlpha(baseResult);
  const eventType = detectEventType(baseResult);
  const signalRegime = classifySignalRegime(baseResult, alpha, eventType);
  const signalFusion = detectSignalFusion(baseResult, alpha, eventType);

  const launchImminent =
    !!baseResult.launchImminent &&
    eventType === "CLAIM READINESS" &&
    signalFusion === "FULL ACTIVATION STACK";

  const portalArmed =
    !!baseResult.portalArmed &&
    (
      signalFusion === "REWARD + WALLET + AUTH CLUSTER" ||
      signalFusion === "FULL ACTIVATION STACK"
    ) &&
    eventType === "CLAIM READINESS";

  const enrichedBaseResult = {
    ...baseResult,
    launchImminent,
    portalArmed,
    tags: [
      ...new Set([
        ...ensureArray(baseResult.tags),
        ...(launchImminent ? ["LAUNCH_IMMINENT"] : []),
        ...(portalArmed ? ["PORTAL_ARMED"] : []),
      ]),
    ],
  };

  const priority = getPriority(enrichedBaseResult);
  const eta = getEta(enrichedBaseResult);

  const result = {
    ...enrichedBaseResult,
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        wroteTo: publicDir,
        latest: "latest.json",
        history: "history.json",
        lastTriggeredUpdated: TRIGGER_PRIORITIES.has(result.priority),
        id: result.id,
        snapshotId: result.snapshotId,
        generatedAt: result.generatedAt,
        score: result.score,
        level: result.level,
        priority: result.priority,
        alphaScore: result.alphaScore,
        alphaClass: result.alphaClass,
        triggerState: result.triggerState,
        eventType: result.eventType,
        signalFusion: result.signalFusion,
        signalRegime: result.signalRegime,
        eta: result.eta,
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