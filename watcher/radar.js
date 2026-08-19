const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const { summarizeRadarIntelligence } = require("./radar-intelligence");
const { computeRadarScore } = require("./lib/scoring-engine");
const { buildSurfaceDiscovery } = require("./lib/surface-discovery");
const { normalizeOnchainState } = require("./lib/onchain-state");
const { buildSignalClassification } = require("./lib/signal-classification");
const { buildEvidenceCorrelation } = require("./lib/evidence-correlation");
const { buildSignalBuilder } = require("./lib/signal-builder");

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

const {
  buildSignals,
} = buildSignalBuilder({
  includesAny,
  uniqueSortedStrings,
  ensureArray,
});
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

const {
  evaluateAlpha,
  detectEventType,
  classifySignalRegime,
  detectSignalFusion,
  getPriority,
  getEta,
} = buildSignalClassification({
  ensureArray,
});
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
    discoveryLiveApiRoutes: normalizeList(
      latest.discovery?.newLiveApiRoutes || []
    ),
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
  const chainIntelligencePath = path.join(publicDir, "chain-intelligence.json");
  const discoveryPath = path.join(publicDir, "discovery.json");
  const apiFile = path.join(newDir, "api.json");
  const manifestFile = path.join(newDir, "manifest.json");

  const chainIntelligence = await readJsonSafe(
    chainIntelligencePath,
    null
  );

  const manifest = await readJsonSafe(
    manifestFile,
    {}
  );

  const captureCoverage =
    manifest?.coverage || {};

  const observability = {
    status: String(
      captureCoverage.status || "UNKNOWN"
    ).toUpperCase(),

    blindSpot:
      captureCoverage.blindSpotDetected === true,

    degraded:
      captureCoverage.degraded === true,

    reasons:
      uniqueSortedStrings(
        captureCoverage.reasons || []
      ),

    navigationOk:
      captureCoverage.navigation?.ok === true,

    documentCaptured:
      captureCoverage.documentCaptured === true,

    capturedResponseCount:
      Number(
        captureCoverage.capturedResponseCount ?? 0
      ),

    firstPartyResponseCount:
      Number(
        captureCoverage.firstPartyResponseCount ?? 0
      ),

    apiResponseCount:
      Number(
        captureCoverage.apiResponseCount ?? 0
      ),

    firstPartyApiCount:
      Number(
        captureCoverage.firstPartyApiCount ?? 0
      ),
  };

  const surfaceDiscovery = buildSurfaceDiscovery({
    surfaceInventory: manifest?.surfaceInventory,
    surfaceDrift: manifest?.surfaceDrift,
    ensureArray,
    uniqueSortedStrings,
  });
  const normalizedOnchain =
    normalizeOnchainState(chainIntelligence);

   const existingHistory = await readJsonArraySafe(historyPath);

   let discovery = await readJsonSafe(discoveryPath, {
     checkedAt: null,
     sourceSnapshotId: null,
     snapshotDir: null,
     newUnknownChange: false,
     keyFunctionCandidate: null,
     newLabels: [],
     newRoutes: [],
     newApiRoutes: [],
     newLiveApiRoutes: [],
     newKeywords: [],
     criticalKeywords: [],
   });

 const currentSnapshotId = path.basename(newDir);

 const discoverySnapshotId =
   discovery.snapshotDir ||
   discovery.sourceSnapshotId ||
   null;

const discoveryMatchesCurrentSnapshot =
  !!discoverySnapshotId &&
  discoverySnapshotId === currentSnapshotId;

if (!discoveryMatchesCurrentSnapshot) {
  console.warn(
    `Ignoring stale discovery data: discovery=${
      discoverySnapshotId || "unknown"
    } current=${currentSnapshotId}`
  );

  discovery = {
    ...discovery,
    newUnknownChange: false,
    keyFunctionCandidate: null,
    newLabels: [],
    newRoutes: [],
    newApiRoutes: [],
    newLiveApiRoutes: [],
    newKeywords: [],
    criticalKeywords: [],
    staleIgnored: true,
  };
}

const apiData = await readJsonSafe(apiFile, []);

const oldApiFile = oldDir
  ? path.join(oldDir, "api.json")
  : null;

const oldApiData = oldApiFile
  ? await readJsonSafe(oldApiFile, [])
  : [];

  const discoveryCriticalKeywords = uniqueSortedStrings(discovery.criticalKeywords);
  const discoveryNewApiRoutes = uniqueSortedStrings(discovery.newApiRoutes);
  const discoveryNewLiveApiRoutes = uniqueSortedStrings(
    discovery.newLiveApiRoutes
  );
  const discoveryNewLabels = uniqueSortedStrings(discovery.newLabels);
  const discoveryNewRoutes = uniqueSortedStrings(discovery.newRoutes);
  const discoveryNewKeywords = uniqueSortedStrings(discovery.newKeywords);
  const discoveryCandidate = String(discovery.keyFunctionCandidate || "");

  function collectBackendSignals(entries) {
    const collected = [];

    for (const entry of ensureArray(entries)) {
      for (const sig of ensureArray(entry.backendSignals)) {
        collected.push(sig);
      }
    }

    return uniqueSortedStrings(collected);
  }

  const observedBackendSignals =
    collectBackendSignals(apiData);

  const previousBackendSignals =
    collectBackendSignals(oldApiData);

  const previousBackendSet =
    new Set(previousBackendSignals);

  const freshBackendSignals =
    observedBackendSignals.filter(
      (sig) => !previousBackendSet.has(sig)
    );

  // Compatibility alias:
  // everything below that previously used
  // uniqueBackendSignals now receives ONLY fresh deltas.
  const uniqueBackendSignals = freshBackendSignals;
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
    onchain: normalizedOnchain,
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

  // Newly discovered routes are weak structural context only.
  if (discoveryNewApiRoutes.length >= 1) weightedRawScore += 1;
  if (discoveryNewApiRoutes.length >= 2) weightedRawScore += 1;

  // Newly live first-party routes are fresh runtime evidence.
  if (discoveryNewLiveApiRoutes.length >= 1) weightedRawScore += 8;
  if (discoveryNewLiveApiRoutes.length >= 2) weightedRawScore += 4;

  if (discoveryCriticalKeywords.length >= 2) weightedRawScore += 6;
  if (discoveryCandidate.startsWith("api:")) weightedRawScore += 4;
  if (discoveryCandidate.startsWith("critical:")) weightedRawScore += 8;

  if (
    discoveryNewLiveApiRoutes.some((x) =>
      x.includes("claim")
    )
  ) {
    weightedRawScore += 10;
  }

  if (
    discoveryNewLiveApiRoutes.some((x) =>
      x.includes("reward")
    )
  ) {
    weightedRawScore += 8;
  }

  if (
    discoveryNewLiveApiRoutes.some((x) =>
      x.includes("verify") ||
      x.includes("nonce")
    )
  ) {
    weightedRawScore += 6;
  }

  if (
    discoveryNewLiveApiRoutes.some((x) =>
      x.includes("account") ||
      x.includes("wallet") ||
      x.includes("user")
    )
  ) {
    weightedRawScore += 5;
  }

  if (
    discoveryNewLiveApiRoutes.some((x) =>
      x.includes("fund") ||
      x.includes("pair") ||
      x.includes("build")
    )
  ) {
    weightedRawScore += 8;
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
      ? `Initial baseline snapshot generated with ${totalFiles} files. No historical comparison is available yet.`
      : movementCount === 0
        ? `No changes detected across ${totalFiles} analyzed files.`
        : `${movementCount} of ${totalFiles} files show movement (${movementPct}%). ${added} new (${addedPct}%) and ${changed} modified (${changedPct}).${
            signals.length ? ` Signals: ${signals.join(", ")}.` : " No relevant signals."
          }`,
    note:
      weightedRawScore >= 100
        ? "Very strong signals of real activation or an imminent launch."
        : radarScore.level === "CRITICAL"
          ? "Very strong signals of a possible imminent launch."
          : radarScore.level === "VERY HIGH"
            ? "Strong activation or pre-launch signals."
            : radarScore.level === "HIGH"
              ? "Significant frontend changes and relevant signals."
              : radarScore.level === "MEDIUM"
                ? "Visible development activity."
                : "No strong signals at this time.",
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
    ? `Initial baseline snapshot generated with ${totalFiles} files. No historical comparison is available yet.`
    : movementCount === 0
      ? `No changes detected across ${totalFiles} analyzed files.`
      : `${movementCount} of ${totalFiles} files show movement (${movementPct}%). ${added} new (${addedPct}%) and ${changed} modified (${changedPct}).${
          signals.length ? ` Signals: ${signals.join(", ")}.` : " No relevant signals."
        }${
          discoveryNewApiRoutes.length ? ` New APIs detected: ${discoveryNewApiRoutes.slice(0, 5).join(", ")}.` : ""
        }${
          uniqueBackendSignals.length ? ` Backend signals: ${uniqueBackendSignals.slice(0, 6).join(", ")}.` : ""
        }`;

  const intelligence = summarizeRadarIntelligence(draftSnapshot, existingHistory);

  const note = !oldDir
    ? "Initial baseline run. The next snapshot will allow change detection."
    : weightedRawScore >= 100
      ? "Very strong signals of real activation or an imminent launch."
      : radarScore.level === "CRITICAL"
        ? "Very strong signals of a possible imminent launch."
        : radarScore.level === "VERY HIGH"
          ? "Strong activation or pre-launch signals."
          : radarScore.level === "HIGH"
            ? "Significant frontend changes and relevant signals."
            : radarScore.level === "MEDIUM"
              ? "Visible development activity."
              : "No strong signals at this time.";

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
  const hasFreshDiscoveryEvidence =
    discoveryMatchesCurrentSnapshot &&
    (
      !!discovery.newUnknownChange ||
      discoveryNewLiveApiRoutes.length > 0 ||
      discoveryCriticalKeywords.length > 0 ||
      discoveryNewLabels.length > 0 ||
      discoveryNewRoutes.length > 0 ||
      discoveryNewKeywords.length > 0
    );

  const hasFreshBackendEvidence =
    freshBackendSignals.length > 0;

  const hasFreshSurfaceMovement =
    movementCount > 0 &&
    movementPct > 0;

  const hasFreshActivationEvidence =
    hasFreshSurfaceMovement ||
    hasFreshDiscoveryEvidence ||
    hasFreshBackendEvidence;

  if (!hasFreshActivationEvidence) {
    effectiveLevel =
      rawScore >= 15
        ? "MEDIUM"
        : "LOW";
  }

  const {
    evidenceCorrelation,
    temporalCorrelation,
  } = buildEvidenceCorrelation({
    discoveryMatchesCurrentSnapshot,
    discovery,
    discoveryNewApiRoutes,
    discoveryNewLiveApiRoutes,
    freshBackendSignals,
    discoveryCriticalKeywords,
    hasFreshSurfaceMovement,
    normalizedOnchain,
    existingHistory,
    generatedAt,
  });
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

    evidenceCorrelation,

    temporalCorrelation,

    surfaceDiscovery,

    observability,

    discovery: {
      checkedAt: discovery.checkedAt || null,
      sourceSnapshotId: discovery.sourceSnapshotId || null,
      snapshotDir: discovery.snapshotDir || null,
      newUnknownChange: !!discovery.newUnknownChange,
      keyFunctionCandidate: discoveryCandidate || null,
      newLabels: discoveryNewLabels.slice(0, 15),
      newRoutes: discoveryNewRoutes.slice(0, 15),
      newApiRoutes: discoveryNewApiRoutes.slice(0, 20),
      newLiveApiRoutes: discoveryNewLiveApiRoutes.slice(0, 20),
      newKeywords: discoveryNewKeywords.slice(0, 20),
      criticalKeywords: discoveryCriticalKeywords.slice(0, 20),
      apiResponseDrift:
        discovery.apiResponseDrift &&
        typeof discovery.apiResponseDrift === "object"
          ? discovery.apiResponseDrift
          : {
              detected: false,
              changedRouteCount: 0,
              changedRoutes: [],
            },
    },
    whyItMatters: intelligence.whyItMatters || "",
  };

  const alpha = evaluateAlpha(baseResult);
  const eventType = detectEventType(baseResult);
  const signalRegime = classifySignalRegime(baseResult, alpha, eventType);
  const signalFusion = detectSignalFusion(baseResult, alpha, eventType);

  const launchImminent =
    hasFreshActivationEvidence &&
    !!baseResult.launchImminent &&
    eventType === "CLAIM READINESS" &&
    (
      signalFusion === "FULL ACTIVATION STACK" ||
      signalFusion ===
        "REWARD + WALLET + AUTH CLUSTER"
    );

  const portalArmed =
    hasFreshActivationEvidence &&
    !!baseResult.portalArmed &&
    (
      signalFusion ===
        "REWARD + WALLET + AUTH CLUSTER" ||
      signalFusion ===
        "FULL ACTIVATION STACK"
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

  const alphaClass = alpha.alphaClass;
  const triggerState = alpha.triggerState;
  const suggestedAction = alpha.suggestedAction;

  let activationState = "IDLE";
  let activationAction = "No fresh activation event confirmed.";

  if (portalArmed) {
    activationState = "ARMED";
    activationAction =
      "Portal activation conditions detected. Maintain high-frequency monitoring.";
  }

  if (launchImminent) {
    activationState = "TRIGGERED";
    activationAction =
      "Launch-imminent activation conditions detected. Escalate immediately and monitor backend/UI flips aggressively.";
  }

  const priority = getPriority(enrichedBaseResult);
  const eta = getEta(enrichedBaseResult);

  const result = {
    ...enrichedBaseResult,
    alphaScore: alpha.alphaScore,
    alphaClass,
    triggerState,
    suggestedAction,
    activationState,
    activationAction,
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
        activationState: result.activationState,
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
