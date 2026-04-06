const fs = require("fs-extra");
const path = require("path");

const { summarizeRadarIntelligence } = require("./radar-intelligence");
const { computeRadarScore } = require("./lib/scoring-engine");

const KEY_SIGNALS = [
  "claim",
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
];

const SIGNAL_GROUPS = {
  AUTH: ["verify", "account", "login"],
  REWARDS: ["claim", "reward", "airdrop"],
  CHAIN: ["ethereum", "solana", "connect"],
  SYSTEM: ["enabled", "disabled", "portal", "launch"],
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

  const walletKeywords = ["wallet", "connect wallet", "solana", "ethereum", "phantom", "metamask"];
  const rewardKeywords = ["reward", "rewards", "claim", "distribution", "points", "epoch", "airdrop", "payout"];
  const ctaKeywords = ["connect", "launch", "enter", "start", "claim now", "portal"];
  const disabledKeywords = ["disabled", "aria-disabled", "pointer-events-none", "opacity-50"];

  const hasWalletStrings = includesAny(combinedText, walletKeywords);
  const hasRewardLogic = includesAny(combinedText, rewardKeywords);
  const hasConnectUI = includesAny(combinedText, ctaKeywords);
  const hasDisabledState = includesAny(combinedText, disabledKeywords);
  const hasVisibleCTAChange = includesAny(combinedText, ["connect", "claim", "launch", "portal"]);

  if (hasWalletStrings) frontendHits.push("wallet_strings");
  if (hasConnectUI) frontendHits.push("connect_ui");
  if (hasDisabledState) frontendHits.push("disabled_state");
  if (hasVisibleCTAChange) frontendHits.push("cta_change");

  const hasNewChunks = changedFiles.some((file) =>
    file.includes("_next/static") || file.endsWith(".js") || file.endsWith(".css")
  );

  if (hasNewChunks) infraHits.push("new_chunks");
  if (changedFiles.some((file) => file.endsWith(".css"))) infraHits.push("css_change");
  if (changedFiles.some((file) => file.endsWith(".js"))) infraHits.push("js_change");
  if (changedFiles.length >= 4) behaviorHits.push("multi_file_burst");

  if (hasRewardLogic) rewardsHits.push("reward_logic");
  if (movementPct >= 10) behaviorHits.push("movement_spike");
  if (recentChangesCount >= 3) behaviorHits.push("recent_change_cluster");

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
    hasRewardLogic,
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

  if (movementPct > 30 && signals.includes("claim")) {
    insight = "Strong indicators of claim or reward activation";
    confidence = 0.9;
  } else if (movementPct > 20 && detectedGroups.includes("AUTH")) {
    insight = "Authentication-related changes detected, possible gated feature";
    confidence = 0.75;
  } else if (movementPct > 20 && detectedGroups.includes("CHAIN")) {
    insight = "Blockchain connection flow evolving (wallet or network activity)";
    confidence = 0.7;
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
    signals.includes("payout");

  const hasWalletStack =
    signals.includes("connect") &&
    (signals.includes("ethereum") || signals.includes("solana"));

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth");

  if (hasRewards) alphaRaw += 12;
  if (hasWalletStack) alphaRaw += 10;
  if (hasAuth) alphaRaw += 6;

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
    signals.includes("airdrop");

  const hasWallet =
    signals.includes("connect") ||
    signals.includes("ethereum") ||
    signals.includes("solana") ||
    tags.includes("CHAIN");

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth");

  const hasPortal =
    tags.includes("SYSTEM") ||
    signals.includes("portal");

  if (hasRewards && hasWallet && score >= 70) {
    return "REWARD ACTIVATION";
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
    signals.includes("airdrop");

  const hasWallet =
    signals.includes("connect") ||
    signals.includes("ethereum") ||
    signals.includes("solana") ||
    tags.includes("CHAIN");

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth");

  const hasPortal =
    tags.includes("SYSTEM") ||
    signals.includes("portal");

  if (
    alpha.triggerState === "TRIGGERED" &&
    alpha.alphaClass === "CRITICAL" &&
    (
      eventType === "REWARD ACTIVATION" ||
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
    eventType === "PORTAL ARMING"
  ) {
    return "HIGH-CONVICTION SETUP";
  }

  if (
    alpha.alphaClass === "SETUP" ||
    alpha.alphaClass === "WATCH" ||
    hasPortal ||
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
    signals.includes("airdrop");

  const hasWallet =
    signals.includes("connect") ||
    signals.includes("ethereum") ||
    signals.includes("solana") ||
    tags.includes("CHAIN");

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth");

  const hasPortal =
    tags.includes("SYSTEM") ||
    signals.includes("portal");

  const strongAlpha =
    alpha.alphaClass === "CRITICAL" ||
    alpha.alphaClass === "ACTIONABLE" ||
    alpha.triggerState === "TRIGGERED" ||
    alpha.triggerState === "ARMED";

  if (
    hasRewards &&
    hasWallet &&
    hasAuth &&
    strongAlpha &&
    score >= 70 &&
    patternBoost >= 20
  ) {
    return "FULL ACTIVATION STACK";
  }

  if (
    hasRewards &&
    hasWallet &&
    hasAuth
  ) {
    return "REWARD + WALLET + AUTH CLUSTER";
  }

  if (
    hasPortal &&
    hasWallet &&
    (signalRegime === "HIGH-CONVICTION SETUP" || signalRegime === "PRE-LAUNCH REAL")
  ) {
    return "PORTAL READINESS CLUSTER";
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
    : `${movementCount} de ${totalFiles} archivos muestran movimiento (${movementPct}%). ${added} nuevos (${addedPct}%) y ${changed} modificados (${changedPct}%).${
        signals.length ? ` Señales: ${signals.join(", ")}.` : " Sin señales relevantes."
      }`;

  const intelligence = summarizeRadarIntelligence(draftSnapshot, existingHistory);

  const note = !oldDir
    ? "Primera corrida base. El siguiente snapshot permitirá detectar cambios."
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
    signals,
    patternScore: intelligence.patternScore,
    patterns: normalizedPatterns,
    activationProbability: intelligence.activationProbability,
    score: radarScore.score,
    level: radarScore.level,
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
    breakdown: radarScore.breakdown || {},
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
        score: round(result.score),
        level: result.level,
        priority: result.priority,
        alphaScore: result.alphaScore,
        alphaClass: result.alphaClass,
        triggerState: result.triggerState,
        eventType: result.eventType,
        signalFusion: result.signalFusion,
        signalRegime: result.signalRegime,
        eta: result.eta,
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