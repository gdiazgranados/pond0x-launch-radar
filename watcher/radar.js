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
  const snapshotsDir = path.join(__dirname, "snapshots");

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

async function main() {
  const { oldDir, newDir } = await loadLatestSnapshots();

  const oldFiles = oldDir ? await readAssets(oldDir) : [];
  const newFiles = await readAssets(newDir);

  const oldMap = new Map(
    oldFiles.map((file) => [toAssetRelative(oldDir, file), file])
  );
  const newMap = new Map(
    newFiles.map((file) => [toAssetRelative(newDir, file), file])
  );

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

  const movementPct =
    totalFiles > 0 ? Number(((movementCount / totalFiles) * 100).toFixed(2)) : 0;
  const addedPct =
    totalFiles > 0 ? Number(((added / totalFiles) * 100).toFixed(2)) : 0;
  const changedPct =
    totalFiles > 0 ? Number(((changed / totalFiles) * 100).toFixed(2)) : 0;

  const combinedText = changedContents.join("\n\n");
  const recentChangesCount = movementCount;

  const historyFile = path.join(__dirname, "..", "public", "data", "history.json");
  let existingHistory = [];

  if (await fs.pathExists(historyFile)) {
    try {
      existingHistory = await fs.readJson(historyFile);
      if (!Array.isArray(existingHistory)) existingHistory = [];
    } catch {
      existingHistory = [];
    }
  }

  const advancedSignals = buildSignals({
    combinedText,
    changedFiles,
    movementPct,
    recentChangesCount,
  });

  const signals = [...allSignals];
  const detectedGroups = detectGroups(signals);
  const radarScore = computeRadarScore(
    advancedSignals,
    Array.isArray(existingHistory) ? existingHistory : []
   );

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

  const result = {
    id: path.basename(newDir),
    totalFiles,
    added,
    changed,
    movementCount,
    movementPct,
    addedPct,
    changedPct,
    signals,
    patternScore: intelligence.patternScore,
    patterns: radarScore.patterns,
    activationProbability: intelligence.activationProbability,
    score: radarScore.score,
    level: radarScore.level,
    significance: intelligence.significance,
    rarityScore: intelligence.rarityScore,
    focusAreas: intelligence.focusAreas,
    sensitiveHits: intelligence.sensitiveHits,
    changeTypes: intelligence.changeTypes,
    insight,
    confidence,
    tags: [...new Set([...detectedGroups, ...radarScore.tags])],
    summary,
    note,
    changedFiles,
    generatedAt: new Date().toISOString(),
    trend: radarScore.trend,
    trendDirection: radarScore.trendDirection,
    breakdown: radarScore.breakdown,
    advancedSignals,
    whyItMatters: intelligence.whyItMatters,
  };

  draftSnapshot.summary = summary;
  draftSnapshot.insight = insight;
  draftSnapshot.note = note;

  const publicDir = path.join(__dirname, "..", "public", "data");
  const publicFile = path.join(publicDir, "latest.json");

  await fs.ensureDir(publicDir);
  await fs.writeJson(publicFile, result, { spaces: 2 });

  const nextHistory = [...existingHistory, result].slice(-200);
  await fs.writeJson(historyFile, nextHistory, { spaces: 2 });

  console.log("Archivo generado:");
  console.log(publicFile);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});