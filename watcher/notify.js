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

function buildDecision(latest, lastAlert) {
  const signature = getStableSignature(latest);
  const priority = latest.priority || "LOW";
  const triggerState = latest.triggerState || "IDLE";
  const score = Number(latest.score || 0);
  const movementPct = Number(latest.movementPct || 0);

  // 1) REGLA MAESTRA:
  // si el estado actual es igual al último alertado, NO enviar
  if (lastAlert && lastAlert.signature === signature) {
    return {
      send: false,
      reason: "Unchanged state vs previous alert",
      signature,
      priority,
    };
  }

  // 2) filtro base de ruido
  if (priority === "LOW" && score < 45) {
    return {
      send: false,
      reason: "Signal too weak",
      signature,
      priority,
    };
  }

  // 3) primera alerta
  if (!lastAlert) {
    return {
      send: true,
      reason: "First alert",
      signature,
      priority,
    };
  }

  // 4) reglas de prioridad, pero solo si YA cambió la firma
  if (triggerState === "TRIGGERED") {
    return {
      send: true,
      reason: "Alpha state changed and trigger is TRIGGERED",
      signature,
      priority,
    };
  }

  if (priority === "CRITICAL") {
    return {
      send: true,
      reason: "Critical state changed",
      signature,
      priority,
    };
  }

  if (priority === "VERY HIGH") {
    return {
      send: true,
      reason: "Very high state changed",
      signature,
      priority,
    };
  }

  if (priority === "HIGH") {
    if (movementPct >= 15 || score >= 70) {
      return {
        send: true,
        reason: "High signal changed with enough movement",
        signature,
        priority,
      };
    }

    return {
      send: false,
      reason: "High but not urgent enough",
      signature,
      priority,
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
      };
    }

    return {
      send: true,
      reason: "Medium signal changed after cooldown",
      signature,
      priority,
    };
  }

  return {
    send: false,
    reason: "No notification rule matched",
    signature,
    priority,
  };
}

function buildTelegramMessage(latest, decision) {
  const patterns = getTopPatterns(latest);
  const tags = ensureArray(latest.tags).join(", ") || "none";
  const focus = ensureArray(latest.focusAreas).join(", ") || "none";
  const signals = ensureArray(latest.signals).slice(0, 12).join(", ") || "none";

  const patternLines = patterns.length
    ? patterns
        .map((p) => {
          const tag = typeof p === "string" ? p : p?.tag || "UNKNOWN";
          const reasons = typeof p === "string" ? [] : ensureArray(p?.reasons);
          return `• <b>${escapeHtml(tag)}</b> — ${escapeHtml(reasons.join(" / ") || "No detailed reasons")}`;
        })
        .join("\n")
    : "• none";

  const trendArrow =
    latest.trendDirection === "UP"
      ? "↑"
      : latest.trendDirection === "DOWN"
        ? "↓"
        : "→";

  const title =
    decision.priority === "CRITICAL"
      ? "🚨 POND0X RADAR — CRITICAL"
      : decision.priority === "VERY HIGH"
        ? "⚠️ POND0X RADAR — VERY HIGH"
        : decision.priority === "HIGH"
          ? "📡 POND0X RADAR — HIGH"
          : "🛰️ POND0X RADAR — MEDIUM";

  return [
    `<b>${title}</b>`,
    ``,
    `<b>Score:</b> ${escapeHtml(round(latest.score))}`,
    `<b>Level:</b> ${escapeHtml(latest.level)}`,
    `<b>Trend:</b> ${trendArrow} ${escapeHtml(latest.trendDirection)} (${escapeHtml(round(latest.trend))})`,
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
    `<b>Decision:</b> ${escapeHtml(decision.reason)}`,
    `<b>Generated:</b> ${escapeHtml(latest.generatedAt || new Date().toISOString())}`,
  ].join("\n");
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

  await fs.ensureDir(path.dirname(alertsHistoryFile));
  await fs.writeJson(alertsHistoryFile, nextHistory, { spaces: 2 });
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
    `Notify decision: send=${decision.send} | priority=${decision.priority} | reason=${decision.reason} | signature=${decision.signature}`
  );

  if (!decision.send) {
    return;
  }

  const message = buildTelegramMessage(latest, decision);
  const sent = await sendTelegramMessage(message);

  const alertRecord = buildAlertRecord(latest, decision);

  if (sent) {
    await fs.ensureDir(path.dirname(lastAlertFile));
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