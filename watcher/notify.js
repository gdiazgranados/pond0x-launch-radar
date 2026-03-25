require("dotenv").config();

const fs = require("fs-extra");
const path = require("path");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_TOKEN) {
  throw new Error("Missing TELEGRAM_TOKEN env variable");
}

if (!CHAT_ID) {
  throw new Error("Missing TELEGRAM_CHAT_ID env variable");
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
    }),
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(`Telegram error: ${JSON.stringify(data)}`);
  }

  return data;
}

function buildAlertSignature(data) {
  const significance = data.significance || "NONE";
  const focusAreas = (data.focusAreas || []).slice().sort().join("|");
  const hits = (data.sensitiveHits || []).slice().sort().join("|");
  const level = data.level || "LOW";
  const generatedHour = data.generatedAt
    ? new Date(data.generatedAt).toISOString().slice(0, 13)
    : "unknown";

  return `${significance}__${level}__${focusAreas}__${hits}__${generatedHour}`;
}

function classifyAlert(data) {
  const significance = data.significance || "NONE";
  const rarityScore = data.rarityScore ?? 0;
  const focusAreas = data.focusAreas || [];

  if (significance === "HIGH") {
    return "CRITICAL";
  }

  if (
    focusAreas.includes("REWARDS") ||
    focusAreas.includes("CLAIM")
  ) {
    return "HIGH";
  }

  if (rarityScore >= 70) {
    return "HIGH";
  }

  if (significance === "WATCH") {
    return "EARLY";
  }

  return null;
}

function detectSignalType(data) {
  const focusAreas = data.focusAreas || [];
  const signals = data.signals || [];
  const tags = data.tags || [];

  if (focusAreas.includes("REWARDS") || focusAreas.includes("CLAIM")) {
    return "REWARDS";
  }

  if (focusAreas.includes("WALLET")) {
    return "WALLET";
  }

  if (focusAreas.includes("AUTH")) {
    return "AUTH";
  }

  if (focusAreas.includes("SYSTEM") || focusAreas.includes("PORTAL")) {
    return "SYSTEM";
  }

  if (signals.length === 0 && tags.length === 0) {
    return "NO SIGNAL";
  }

  return "WATCH";
}

function shouldSendAlert(data) {
  return classifyAlert(data) !== null;
}

function formatAlertMessage(data) {
  const level = data.level || "LOW";
  const significance = data.significance || "NONE";
  const score = data.score ?? 0;
  const movementPct = data.movementPct ?? 0;
  const rarityScore = data.rarityScore ?? 0;
  const trend = data.trend ?? 0;
  const trendDirection = data.trendDirection || "FLAT";
  const signals = data.signals?.length ? data.signals.join(", ") : "none";
  const tags = data.tags?.length ? data.tags.join(", ") : "none";
  const focusAreas = data.focusAreas?.length ? data.focusAreas.join(", ") : "none";
  const hits = data.sensitiveHits?.length ? data.sensitiveHits.join(", ") : "none";
  const changeTypes = data.changeTypes?.length ? data.changeTypes.join(", ") : "none";
  const insight = data.insight || "No insight";
  const summary = data.summary || "No summary";
  const alertType = classifyAlert(data) || "INFO";
  const signalType = detectSignalType(data);

  const trendText =
    trendDirection === "UP"
      ? `UP +${trend}%`
      : trendDirection === "DOWN"
      ? `DOWN ${trend}%`
      : `${trend}%`;

  let header = "🟢 STABLE SURFACE";
  if (alertType === "EARLY") header = "🟡 EARLY WATCH SIGNAL";
  if (alertType === "HIGH") header = "🟠 HIGH-SENSITIVITY SIGNAL";
  if (alertType === "CRITICAL") header = "🚨 POND0X ACTIVATION SIGNAL";

  return `${header}

🚦 Alert Type: ${alertType}
🧬 Signal Type: ${signalType}
⚡ Level: ${level}
📌 Significance: ${significance}
📊 Score: ${score}
📈 Movement: ${movementPct}%
🧭 Rarity: ${rarityScore}
📉 Trend: ${trendText}

🎯 Focus Areas: ${focusAreas}
🔎 Sensitive Hits: ${hits}
🧱 Change Types: ${changeTypes}
🧠 Signals: ${signals}
🏷 Tags: ${tags}

🔍 Insight:
${insight}

📝 Summary:
${summary}`;
}

async function main() {
  const publicDataDir = path.join(__dirname, "..", "public", "data");
  const latestPath = path.join(publicDataDir, "latest.json");
  const lastAlertPath = path.join(__dirname, "last-alert.json");
  const alertsHistoryPath = path.join(publicDataDir, "alerts-history.json");

  if (!(await fs.pathExists(latestPath))) {
    throw new Error(`No existe latest.json en: ${latestPath}`);
  }

  const data = await fs.readJson(latestPath);

  if (!(await fs.pathExists(lastAlertPath))) {
    await fs.writeJson(lastAlertPath, { lastSignature: null }, { spaces: 2 });
  }

  if (!(await fs.pathExists(alertsHistoryPath))) {
    await fs.writeJson(alertsHistoryPath, [], { spaces: 2 });
  }

  const lastAlertState = await fs.readJson(lastAlertPath);
  const lastSignature = lastAlertState.lastSignature || null;
  const currentSignature = buildAlertSignature(data);

  if (!shouldSendAlert(data)) {
    console.log("No alert triggered");
    return;
  }

  if (lastSignature === currentSignature) {
    console.log("Duplicate alert skipped");
    return;
  }

  const message = formatAlertMessage(data);
  await sendTelegramMessage(message);

  await fs.writeJson(
    lastAlertPath,
    { lastSignature: currentSignature },
    { spaces: 2 }
  );

  const alertsHistory = await fs.readJson(alertsHistoryPath);
  alertsHistory.unshift({
    id: data.id,
    level: data.level,
    significance: data.significance || "NONE",
    rarityScore: data.rarityScore ?? 0,
    score: data.score ?? 0,
    movementPct: data.movementPct ?? 0,
    trend: data.trend ?? 0,
    trendDirection: data.trendDirection || "FLAT",
    signals: data.signals || [],
    tags: data.tags || [],
    focusAreas: data.focusAreas || [],
    sensitiveHits: data.sensitiveHits || [],
    changeTypes: data.changeTypes || [],
    changedFiles: data.changedFiles || [],
    insight: data.insight || "No insight",
    summary: data.summary || "No summary",
    sentAt: new Date().toISOString(),
  });

  await fs.writeJson(alertsHistoryPath, alertsHistory.slice(0, 50), {
    spaces: 2,
  });

  console.log("Smart alert sent to Telegram channel");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});