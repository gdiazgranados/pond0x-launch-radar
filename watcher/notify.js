const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const latestFile = path.join(__dirname, "..", "public", "data", "latest.json");
const alertsHistoryFile = path.join(__dirname, "..", "public", "data", "alerts-history.json");
const lastAlertFile = path.join(__dirname, "last-alert.json");

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
  const trend = Number(latest.trend || 0);
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
    (score >= 45 || movementPct >= 10 || trend >= 3)
  ) {
    return "ELEVATED MULTI-SIGNAL EVENT";
  }

  return "UNCLASSIFIED SIGNAL MIX";
}

function round(n) {
  return Math.round(Number(n || 0) * 100) / 100;
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
  const patternTags = getTopPatterns(latest, 5).map((p) => p.tag).sort().join("|");
  const level = latest.level || "LOW";
  const scoreBand = Math.floor(Number(latest.score || 0) / 5) * 5;
  return `${level}::${scoreBand}::${tags}::${patternTags}`;
}

function minutesSince(isoDate) {
  if (!isoDate) return Number.POSITIVE_INFINITY;
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return (now - then) / 60000;
}

function shouldNotify(latest, lastAlert, alpha) {

if (alpha.triggerState === "TRIGGERED") {
  const signature = buildSignature(latest);
  const mins = lastAlert ? minutesSince(lastAlert.sentAt) : Number.POSITIVE_INFINITY;

  if (lastAlert && lastAlert.signature === signature && mins < 10) {
    return {
      send: false,
      reason: "Duplicate Alpha trigger within 10m",
      signature,
      priority: "CRITICAL",
    };
  }

  return {
    send: true,
    reason: "Alpha TRIGGERED override",
    signature,
    priority: "CRITICAL",
  };
}
  const priority = getPriority(latest);
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);
  const signature = buildSignature(latest);

  if (priority === "LOW" && score < 45) {
    return { send: false, reason: "Signal too weak", signature, priority };
  }

  if (!lastAlert) {
    return { send: true, reason: "First alert", signature, priority };
  }

  const sameSignature = lastAlert.signature === signature;
  const mins = minutesSince(lastAlert.sentAt);

  if (priority === "CRITICAL") {
    if (sameSignature && mins < 15) {
      return { send: false, reason: "Duplicate CRITICAL within 15m", signature, priority };
    }
    return { send: true, reason: "Critical signal", signature, priority };
  }

  if (priority === "VERY HIGH") {
    if (sameSignature && mins < 30) {
      return { send: false, reason: "Duplicate VERY HIGH within 30m", signature, priority };
    }
    return { send: true, reason: "Very high signal", signature, priority };
  }

  if (priority === "HIGH") {
    if (sameSignature && mins < 60) {
      return { send: false, reason: "Duplicate HIGH within 60m", signature, priority };
    }
    if (movementPct >= 15 || score >= 70) {
      return { send: true, reason: "High signal with movement", signature, priority };
    }
    return { send: false, reason: "High but not urgent enough", signature, priority };
  }

  if (priority === "MEDIUM") {
    if (sameSignature && mins < 180) {
      return { send: false, reason: "Duplicate MEDIUM within 180m", signature, priority };
    }
    return { send: true, reason: "Medium signal", signature, priority };
  }

  return { send: false, reason: "No notification rule matched", signature, priority };
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function buildTelegramMessage(latest, decision, alpha, eventType, signalRegime, signalFusion) {
  const priority = decision.priority;
  const eta = getEta(latest);
  const patterns = getTopPatterns(latest);
  const tags = (latest.tags || []).join(", ") || "none";
  const focus = (latest.focusAreas || []).join(", ") || "none";
  const signals = (latest.signals || []).slice(0, 12).join(", ") || "none";

  const patternLines = patterns.length
    ? patterns
        .map((p) => `• <b>${escapeHtml(p.tag)}</b> — ${escapeHtml((p.reasons || []).join(" / "))}`)
        .join("\n")
    : "• none";

  const trendArrow =
    latest.trendDirection === "UP"
      ? "↑"
      : latest.trendDirection === "DOWN"
      ? "↓"
      : "→";

  const title =
    priority === "CRITICAL"
      ? "🚨 POND0X RADAR — CRITICAL"
      : priority === "VERY HIGH"
      ? "⚠️ POND0X RADAR — VERY HIGH"
      : priority === "HIGH"
      ? "📡 POND0X RADAR — HIGH"
      : "🛰️ POND0X RADAR — MEDIUM";

  return [
  `<b>${title}</b>`,
  ``,
  `<b>Score:</b> ${escapeHtml(round(latest.score))}`,
  `<b>Level:</b> ${escapeHtml(latest.level)}`,
  `<b>Trend:</b> ${trendArrow} ${escapeHtml(latest.trendDirection)} (${escapeHtml(round(latest.trend))})`,
  `<b>Movement:</b> ${escapeHtml(round(latest.movementPct))}%`,
  `<b>ETA:</b> ${escapeHtml(eta)}`,
  ``,
  `<b>Alpha Score:</b> ${escapeHtml(alpha.alphaScore)}`,
  `<b>Alpha Class:</b> ${escapeHtml(alpha.alphaClass)}`,
  `<b>Trigger:</b> ${escapeHtml(alpha.triggerState)}`,
  `<b>Action:</b> ${escapeHtml(alpha.suggestedAction)}`,
  `<b>Event Type:</b> ${escapeHtml(eventType)}`,
  `<b>Signal Fusion:</b> ${escapeHtml(getFusionEmoji(signalFusion))} ${escapeHtml(signalFusion)}`,
  `<b>Signal Regime:</b> ${escapeHtml(getRegimeEmoji(signalRegime))} ${escapeHtml(signalRegime)}`,
  `<b>Event Type:</b> ${escapeHtml(eventType)}`,
  ``,
  `<b>Patterns</b>`,
    patternLines,
    ``,
    `<b>Tags:</b> ${escapeHtml(tags)}`,
    `<b>Focus:</b> ${escapeHtml(focus)}`,
    `<b>Signals:</b> ${escapeHtml(signals)}`,
    ``,
    `<b>Insight:</b> ${escapeHtml(latest.insight || "No insight available")}`,
    `<b>Summary:</b> ${escapeHtml(latest.summary || "No summary available")}`,
    ``,
    `<b>Generated:</b> ${escapeHtml(latest.generatedAt || new Date().toISOString())}`,
  ].join("\n");
}

function getFusionEmoji(signalFusion) {
  switch (signalFusion) {
    case "FULL ACTIVATION STACK":
      return "🚨🔥"
    case "REWARD + WALLET + AUTH CLUSTER":
      return "🔥"
    case "PORTAL READINESS CLUSTER":
      return "⚡"
    case "ELEVATED MULTI-SIGNAL EVENT":
      return "📡"
    default:
      return "👀"
  }
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

async function appendAlertHistory(entry) {
  let history = [];

  if (await fs.pathExists(alertsHistoryFile)) {
    try {
      history = await fs.readJson(alertsHistoryFile);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
  }

  history.push(entry);
  history = history.slice(-300);

  await fs.ensureDir(path.dirname(alertsHistoryFile));
  await fs.writeJson(alertsHistoryFile, history, { spaces: 2 });
}

async function main() {
  if (!(await fs.pathExists(latestFile))) {
    console.log("latest.json not found. Skipping notify.");
    return;
  }

  const latest = await fs.readJson(latestFile);
const alpha = evaluateAlpha(latest);
const eventType = detectEventType(latest);
const signalRegime = classifySignalRegime(latest, alpha, eventType);
const signalFusion = detectSignalFusion(latest, alpha, eventType, signalRegime);

  let lastAlert = null;
  if (await fs.pathExists(lastAlertFile)) {
    try {
      lastAlert = await fs.readJson(lastAlertFile);
    } catch {
      lastAlert = null;
    }
  }

  const decision = shouldNotify(latest, lastAlert, alpha);

  console.log(
    `Notify decision: send=${decision.send} | priority=${decision.priority} | reason=${decision.reason}`
  );

  if (!decision.send) {
    return;
  }

  const message = buildTelegramMessage(
    latest,
    decision,
    alpha,
    signalFusion,
    signalRegime,
    eventType
  );
  const sent = await sendTelegramMessage(message);

  const alertRecord = {
  sentAt: new Date().toISOString(),
  priority: decision.priority,
  reason: decision.reason,
  signature: decision.signature,
  score: latest.score,
  level: latest.level,
  trend: latest.trend,
  trendDirection: latest.trendDirection,
  movementPct: latest.movementPct,
  tags: latest.tags || [],
  patterns: getTopPatterns(latest, 5),
  generatedAt: latest.generatedAt,
  alphaScore: alpha.alphaScore,
  alphaClass: alpha.alphaClass,
  triggerState: alpha.triggerState,
  suggestedAction: alpha.suggestedAction,
  eventType,
  signalRegime,
  signalFusion,
};

  if (sent) {
    await fs.writeJson(lastAlertFile, alertRecord, { spaces: 2 });
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