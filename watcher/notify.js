const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const dataDir = path.join(__dirname, "..", "public", "data");
const latestFile = path.join(dataDir, "latest.json");
const alertsHistoryFile = path.join(dataDir, "alerts-history.json");
const lastAlertFile = path.join(dataDir, "last-alert.json");

function round(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function minutesSince(isoDate) {
  if (!isoDate) return Number.POSITIVE_INFINITY;
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return (now - then) / 60000;
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

function getFusionEmoji(signalFusion) {
  switch (signalFusion) {
    case "FULL ACTIVATION STACK":
      return "🚨🔥";
    case "REWARD + WALLET + AUTH CLUSTER":
      return "🔥";
    case "PORTAL READINESS CLUSTER":
      return "⚡";
    case "ELEVATED MULTI-SIGNAL EVENT":
      return "📡";
    default:
      return "👀";
  }
}

function getRegimeEmoji(regime) {
  switch (regime) {
    case "PRE-LAUNCH REAL":
      return "🚨🚨🚨";
    case "HIGH-CONVICTION SETUP":
      return "🔥🔥";
    case "TRANSITIONAL SIGNAL":
      return "⚠️";
    default:
      return "👀";
  }
}

function getTopPatterns(latest, limit = 3) {
  return Array.isArray(latest.patterns) ? latest.patterns.slice(0, limit) : [];
}

function getStableSignature(latest) {
  return latest.alertSignature || latest.signature || "NO_SIGNATURE";
}

function normalizePatternTag(pattern) {
  if (typeof pattern === "string") return pattern;
  if (pattern && typeof pattern === "object") return pattern.tag || "UNKNOWN";
  return "";
}

function normalizeStringList(list) {
  return [...new Set(ensureArray(list).map((x) => String(x || "").trim()).filter(Boolean))].sort();
}

function normalizePatternList(list) {
  return [...new Set(ensureArray(list).map(normalizePatternTag).filter(Boolean))].sort();
}

function diffLists(prevList, nextList) {
  const prev = new Set(prevList);
  const next = new Set(nextList);

  const added = nextList.filter((x) => !prev.has(x));
  const removed = prevList.filter((x) => !next.has(x));

  return { added, removed };
}

function hasSignal(latest, value) {
  return ensureArray(latest?.signals).includes(value);
}

function hasTag(source, value) {
  return ensureArray(source?.tags).includes(value);
}

function getCriticalChanges(latest, lastAlert) {
  if (!lastAlert) {
    return ["Initial alert state"];
  }

  const changes = [];

  const compareScalar = (label, prev, next) => {
    if ((prev ?? null) !== (next ?? null)) {
      changes.push(`${label}: ${prev ?? "∅"} → ${next ?? "∅"}`);
    }
  };

  compareScalar("Priority", lastAlert.priority, latest.priority);
  compareScalar("Level", lastAlert.level, latest.level);
  compareScalar("Alpha Class", lastAlert.alphaClass, latest.alphaClass);
  compareScalar("Trigger", lastAlert.triggerState, latest.triggerState);
  compareScalar("Event Type", lastAlert.eventType, latest.eventType);
  compareScalar("Signal Fusion", lastAlert.signalFusion, latest.signalFusion);
  compareScalar("Signal Regime", lastAlert.signalRegime, latest.signalRegime);
  compareScalar("ETA", lastAlert.eta, latest.eta);

  const prevSignals = normalizeStringList(lastAlert.signals);
  const nextSignals = normalizeStringList(latest.signals);
  const signalDiff = diffLists(prevSignals, nextSignals);

  const prevTags = normalizeStringList(lastAlert.tags);
  const nextTags = normalizeStringList(latest.tags);
  const tagDiff = diffLists(prevTags, nextTags);

  const prevPatterns = normalizePatternList(lastAlert.patterns);
  const nextPatterns = normalizePatternList(latest.patterns);
  const patternDiff = diffLists(prevPatterns, nextPatterns);

  if (signalDiff.added.length) {
    changes.push(`Signals added: ${signalDiff.added.join(", ")}`);
  }
  if (signalDiff.removed.length) {
    changes.push(`Signals removed: ${signalDiff.removed.join(", ")}`);
  }

  if (tagDiff.added.length) {
    changes.push(`Tags added: ${tagDiff.added.join(", ")}`);
  }
  if (tagDiff.removed.length) {
    changes.push(`Tags removed: ${tagDiff.removed.join(", ")}`);
  }

  if (patternDiff.added.length) {
    changes.push(`Patterns added: ${patternDiff.added.join(", ")}`);
  }
  if (patternDiff.removed.length) {
    changes.push(`Patterns removed: ${patternDiff.removed.join(", ")}`);
  }

  const prevScore = round(lastAlert.score);
  const nextScore = round(latest.score);
  if (prevScore !== nextScore) {
    changes.push(`Score: ${prevScore} → ${nextScore}`);
  }

  const prevMovement = round(lastAlert.movementPct);
  const nextMovement = round(latest.movementPct);
  if (prevMovement !== nextMovement) {
    changes.push(`Movement: ${prevMovement}% → ${nextMovement}%`);
  }

  const prevAlpha = Number(lastAlert.alphaScore || 0);
  const nextAlpha = Number(latest.alphaScore || 0);
  if (prevAlpha !== nextAlpha) {
    changes.push(`Alpha Score: ${prevAlpha} → ${nextAlpha}`);
  }

  const claimAppeared = !hasSignal(lastAlert, "claim") && hasSignal(latest, "claim");
  const enabledAppeared = !hasSignal(lastAlert, "enabled") && hasSignal(latest, "enabled");
  const disabledGone = hasSignal(lastAlert, "disabled") && !hasSignal(latest, "disabled");
  const verifyAppeared = !hasSignal(lastAlert, "verify") && hasSignal(latest, "verify");
  const imminentAppeared = !lastAlert.launchImminent && !!latest.launchImminent;
  const portalArmedAppeared = !lastAlert.portalArmed && !!latest.portalArmed;
  const portalArmedTagAppeared = !hasTag(lastAlert, "PORTAL_ARMED") && hasTag(latest, "PORTAL_ARMED");

  if (claimAppeared) changes.push("Critical: claim signal appeared");
  if (enabledAppeared) changes.push("Critical: enabled signal appeared");
  if (disabledGone) changes.push("Critical: disabled signal disappeared");
  if (verifyAppeared) changes.push("Critical: verify signal appeared");
  if (imminentAppeared) changes.push("Critical: LAUNCH_IMMINENT detected");
  if (portalArmedAppeared || portalArmedTagAppeared) changes.push("Critical: PORTAL_ARMED detected");

  return changes.length ? changes : ["State changed"];
}

function classifyChangeSeverity(latest, lastAlert) {
  if (!lastAlert) return "INITIAL";

  const eventTypeChanged = (lastAlert.eventType || "") !== (latest.eventType || "");
  const triggerChanged = (lastAlert.triggerState || "") !== (latest.triggerState || "");
  const alphaClassChanged = (lastAlert.alphaClass || "") !== (latest.alphaClass || "");
  const regimeChanged = (lastAlert.signalRegime || "") !== (latest.signalRegime || "");
  const fusionChanged = (lastAlert.signalFusion || "") !== (latest.signalFusion || "");
  const imminentChanged = !!lastAlert.launchImminent !== !!latest.launchImminent;
  const portalArmedChanged = !!lastAlert.portalArmed !== !!latest.portalArmed;
  const portalArmedTagChanged = hasTag(lastAlert, "PORTAL_ARMED") !== hasTag(latest, "PORTAL_ARMED");

  const claimAppeared = !hasSignal(lastAlert, "claim") && hasSignal(latest, "claim");
  const enabledAppeared = !hasSignal(lastAlert, "enabled") && hasSignal(latest, "enabled");
  const disabledGone = hasSignal(lastAlert, "disabled") && !hasSignal(latest, "disabled");
  const verifyAppeared = !hasSignal(lastAlert, "verify") && hasSignal(latest, "verify");

  if (
    claimAppeared ||
    enabledAppeared ||
    disabledGone ||
    verifyAppeared ||
    imminentChanged ||
    portalArmedChanged ||
    portalArmedTagChanged ||
    eventTypeChanged ||
    triggerChanged ||
    alphaClassChanged ||
    regimeChanged ||
    fusionChanged
  ) {
    return "CRITICAL_FIELD_CHANGE";
  }

  const scoreDelta = Math.abs(Number(latest.score || 0) - Number(lastAlert.score || 0));
  const movementDelta = Math.abs(Number(latest.movementPct || 0) - Number(lastAlert.movementPct || 0));

  if (scoreDelta >= 5 || movementDelta >= 10) {
    return "MATERIAL_CHANGE";
  }

  return "MINOR_CHANGE";
}

function buildDecision(latest, lastAlert) {
  const signature = getStableSignature(latest);
  const priority = latest.priority || "LOW";
  const triggerState = latest.triggerState || "IDLE";
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);
  const launchImminent = !!latest.launchImminent;
  const portalArmed = !!latest.portalArmed || hasTag(latest, "PORTAL_ARMED");

  // 🚨 IMMINENT OVERRIDE
  if (launchImminent) {
    return {
      send: true,
      reason: "Launch imminent override",
      signature,
      priority: "CRITICAL",
      changeSeverity: "CRITICAL_FIELD_CHANGE",
      criticalChanges: ["LAUNCH_IMMINENT detected"],
    };
  }

  // 🔥 PORTAL ARMED OVERRIDE
  if (portalArmed) {
    return {
      send: true,
      reason: "Portal armed override",
      signature,
      priority: "VERY HIGH",
      changeSeverity: "CRITICAL_FIELD_CHANGE",
      criticalChanges: ["PORTAL_ARMED detected"],
    };
  }

  if (lastAlert && lastAlert.signature === signature) {
    return {
      send: false,
      reason: "Unchanged state vs previous alert",
      signature,
      priority,
      changeSeverity: "NONE",
      criticalChanges: [],
    };
  }

  if (priority === "LOW" && score < 45) {
    return {
      send: false,
      reason: "Signal too weak",
      signature,
      priority,
      changeSeverity: "NONE",
      criticalChanges: [],
    };
  }

  const criticalChanges = getCriticalChanges(latest, lastAlert);
  const changeSeverity = classifyChangeSeverity(latest, lastAlert);

  if (!lastAlert) {
    return {
      send: true,
      reason: "First alert",
      signature,
      priority,
      changeSeverity,
      criticalChanges,
    };
  }

  if (changeSeverity === "CRITICAL_FIELD_CHANGE") {
    return {
      send: true,
      reason: "Critical field change detected",
      signature,
      priority,
      changeSeverity,
      criticalChanges,
    };
  }

  if (triggerState === "TRIGGERED") {
    return {
      send: true,
      reason: "Alpha state changed and trigger is TRIGGERED",
      signature,
      priority,
      changeSeverity,
      criticalChanges,
    };
  }

  if (priority === "CRITICAL") {
    return {
      send: true,
      reason: "Critical state changed",
      signature,
      priority,
      changeSeverity,
      criticalChanges,
    };
  }

  if (priority === "VERY HIGH") {
    return {
      send: true,
      reason: "Very high state changed",
      signature,
      priority,
      changeSeverity,
      criticalChanges,
    };
  }

  if (priority === "HIGH") {
    if (movementPct >= 15 || score >= 70) {
      return {
        send: true,
        reason: "High signal changed with enough movement",
        signature,
        priority,
        changeSeverity,
        criticalChanges,
      };
    }

    return {
      send: false,
      reason: "High but not urgent enough",
      signature,
      priority,
      changeSeverity,
      criticalChanges,
    };
  }

  if (priority === "MEDIUM") {
    const mins = minutesSince(lastAlert.sentAt);

    if (mins < 180) {
      return {
        send: false,
        reason: "Medium changed but still inside cooldown window",
        signature,
        priority,
        changeSeverity,
        criticalChanges,
      };
    }

    return {
      send: true,
      reason: "Medium signal changed after cooldown",
      signature,
      priority,
      changeSeverity,
      criticalChanges,
    };
  }

  return {
    send: false,
    reason: "No notification rule matched",
    signature,
    priority,
    changeSeverity,
    criticalChanges,
  };
}

function buildTelegramMessage(latest, decision) {
  const patterns = getTopPatterns(latest);
  const isImminent = !!latest.launchImminent;
  const isPortalArmed = !!latest.portalArmed || hasTag(latest, "PORTAL_ARMED");

  const tagsList = ensureArray(latest.tags).slice();
  if (isImminent && !tagsList.includes("LAUNCH_IMMINENT")) {
    tagsList.push("LAUNCH_IMMINENT");
  }
  if (isPortalArmed && !tagsList.includes("PORTAL_ARMED")) {
    tagsList.push("PORTAL_ARMED");
  }

  const tags = tagsList.join(", ") || "none";
  const focus = ensureArray(latest.focusAreas).join(", ") || "none";
  const signals = ensureArray(latest.signals).slice(0, 12).join(", ") || "none";
  const discovery = latest.discovery || {};

  const apiRoutes = ensureArray(discovery.newApiRoutes).slice(0, 3);
  const criticalKeywords = ensureArray(discovery.criticalKeywords).slice(0, 5);
  const candidate = discovery.keyFunctionCandidate || null;

  const discoveryLines = [];
  if (apiRoutes.length) {
    discoveryLines.push(`• API detected: ${apiRoutes.join(", ")}`);
  }
  if (criticalKeywords.length) {
    discoveryLines.push(`• Critical keywords: ${criticalKeywords.join(", ")}`);
  }
  if (candidate) {
    discoveryLines.push(`• Candidate: ${candidate}`);
  }

  const discoveryBlock = discoveryLines.length ? discoveryLines.join("\n") : "• none";
  const changeLines = ensureArray(decision.criticalChanges).slice(0, 8);

  const patternLines = patterns.length
    ? patterns
        .map((p) => {
          const tag = typeof p === "string" ? p : p?.tag || "UNKNOWN";
          const reasons = typeof p === "string" ? [] : ensureArray(p?.reasons);
          return `• <b>${escapeHtml(tag)}</b> — ${escapeHtml(reasons.join(" / ") || "No detailed reasons")}`;
        })
        .join("\n")
    : "• none";

  const criticalLines = changeLines.length
    ? changeLines.map((line) => `• ${escapeHtml(line)}`).join("\n")
    : "• none";

  const trendArrow =
    latest.trendDirection === "UP"
      ? "↑"
      : latest.trendDirection === "DOWN"
        ? "↓"
        : "→";

  const title =
    isImminent
      ? "🚨🚨 POND0X RADAR — THIS IS IT"
      : isPortalArmed
        ? "🔥 POND0X RADAR — PORTAL ARMED"
        : decision.priority === "CRITICAL"
          ? "🚨 POND0X RADAR — CRITICAL"
          : decision.priority === "VERY HIGH"
            ? "⚠️ POND0X RADAR — VERY HIGH"
            : decision.priority === "HIGH"
              ? "📡 POND0X RADAR — HIGH"
              : "🛰️ POND0X RADAR — MEDIUM";

  const statusLine = isImminent
    ? `<b>STATUS:</b> 🚨 THIS IS NOT A DRILL`
    : isPortalArmed
      ? `<b>STATUS:</b> 🔥 HIGH-CONVICTION SETUP — PORTAL ARMED`
      : "";

  return [
    `<b>${title}</b>`,
    statusLine,
    ``,
    `<b>Score:</b> ${escapeHtml(round(latest.score))}`,
    `<b>Level:</b> ${escapeHtml(latest.level)}`,
    `<b>Trend:</b> ${trendArrow} ${escapeHtml(round(latest.trend))} (${escapeHtml(latest.trendDirection)})`,
    `<b>Movement:</b> ${escapeHtml(round(latest.movementPct))}%`,
    `<b>ETA:</b> ${escapeHtml(latest.eta || "unknown")}`,
    ``,
    `<b>Alpha Score:</b> ${escapeHtml(latest.alphaScore)}`,
    `<b>Alpha Class:</b> ${escapeHtml(latest.alphaClass)}`,
    `<b>Trigger:</b> ${escapeHtml(latest.triggerState)}`,
    `<b>Action:</b> ${escapeHtml(latest.suggestedAction)}`,
    `<b>Event Type:</b> ${escapeHtml(latest.eventType)}`,
    `<b>Signal Fusion:</b> ${escapeHtml(getFusionEmoji(latest.signalFusion))} ${escapeHtml(latest.signalFusion)}`,
    `<b>Signal Regime:</b> ${escapeHtml(getRegimeEmoji(latest.signalRegime))} ${escapeHtml(latest.signalRegime)}`,
    ``,
    `<b>What changed</b>`,
    criticalLines,
    ``,
    `<b>Patterns</b>`,
    patternLines,
    ``,
    `<b>Tags:</b> ${escapeHtml(tags)}`,
    `<b>Focus:</b> ${escapeHtml(focus)}`,
    `<b>Signals:</b> ${escapeHtml(signals)}`,
    ``,
    `<b>Discovery</b>`,
    discoveryBlock,
    ``,
    `<b>Insight:</b> ${escapeHtml(latest.insight || "No insight available")}`,
    `<b>Summary:</b> ${escapeHtml(latest.summary || "No summary available")}`,
    ``,
    `<b>Decision:</b> ${escapeHtml(decision.reason)}`,
    `<b>Change severity:</b> ${escapeHtml(decision.changeSeverity || "UNKNOWN")}`,
    `<b>Generated:</b> ${escapeHtml(latest.generatedAt || new Date().toISOString())}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendTelegramMessage(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram credentials missing. Skipping send.");
    return false;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }

  return true;
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

async function appendAlertHistory(entry) {
  const history = await readJsonArraySafe(alertsHistoryFile);
  const nextHistory = [entry, ...history]
    .filter((item, index, arr) => arr.findIndex((x) => x && x.id === item.id) === index)
    .slice(0, 300);

  await writeJsonAtomic(alertsHistoryFile, nextHistory);
}

function buildAlertRecord(latest, decision) {
  return {
    id: latest.id,
    snapshotId: latest.snapshotId,
    sentAt: new Date().toISOString(),
    priority: decision.priority,
    reason: decision.reason,
    signature: decision.signature,
    alertSignature: latest.alertSignature || null,
    legacySignature: latest.signature || null,
    changeSeverity: decision.changeSeverity || "UNKNOWN",
    criticalChanges: ensureArray(decision.criticalChanges),
    score: latest.score,
    level: latest.level,
    significance: latest.significance,
    trend: latest.trend,
    trendDirection: latest.trendDirection,
    movementPct: latest.movementPct,
    eta: latest.eta,
    alphaScore: latest.alphaScore,
    alphaClass: latest.alphaClass,
    triggerState: latest.triggerState,
    suggestedAction: latest.suggestedAction,
    eventType: latest.eventType,
    signalRegime: latest.signalRegime,
    signalFusion: latest.signalFusion,
    launchImminent: !!latest.launchImminent,
    portalArmed: !!latest.portalArmed || hasTag(latest, "PORTAL_ARMED"),
    tags: ensureArray(latest.tags),
    signals: ensureArray(latest.signals),
    focusAreas: ensureArray(latest.focusAreas),
    sensitiveHits: ensureArray(latest.sensitiveHits),
    patterns: ensureArray(latest.patterns),
    changedFiles: ensureArray(latest.changedFiles),
    summary: latest.summary || "",
    insight: latest.insight || "",
    whyItMatters: latest.whyItMatters || "",
    generatedAt: latest.generatedAt,
  };
}

async function main() {
  if (!(await fs.pathExists(latestFile))) {
    console.log("latest.json not found. Skipping notify.");
    return;
  }

  const latest = await fs.readJson(latestFile);

  let lastAlert = null;
  if (await fs.pathExists(lastAlertFile)) {
    try {
      lastAlert = await fs.readJson(lastAlertFile);
    } catch {
      lastAlert = null;
    }
  }

  const decision = buildDecision(latest, lastAlert);

  console.log(
    `Notify decision: send=${decision.send} | priority=${decision.priority} | reason=${decision.reason} | signature=${decision.signature} | severity=${decision.changeSeverity} | imminent=${!!latest.launchImminent} | portalArmed=${!!latest.portalArmed || hasTag(latest, "PORTAL_ARMED")}`
  );

  if (!decision.send) {
    return;
  }

  const message = buildTelegramMessage(latest, decision);
  const sent = await sendTelegramMessage(message);
  const alertRecord = buildAlertRecord(latest, decision);

  if (sent) {
    await writeJsonAtomic(lastAlertFile, alertRecord);
    await appendAlertHistory(alertRecord);
    console.log("Smart alert sent to Telegram channel");
  } else {
    console.log("Alert generated but not sent because Telegram credentials are missing");
  }
}

main().catch((error) => {
  console.error("notify.js failed:", error);
  process.exit(1);
});