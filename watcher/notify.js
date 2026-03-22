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
  const level = data.level || "LOW";
  const movementPct = data.movementPct ?? 0;
  const score = data.score ?? 0;
  const signals = (data.signals || []).join("|");
  return `${level}__${movementPct}__${score}__${signals}`;
}

function classifyAlert(data) {
  const movementPct = data.movementPct ?? 0;
  const score = data.score ?? 0;
  const level = data.level || "LOW";
  const signals = data.signals || [];
  const trend = data.trend ?? 0;
  const tags = data.tags || [];

  const hasRewardsCombo =
    signals.includes("claim") ||
    (signals.includes("reward") && signals.includes("connect"));

  const hasWalletCombo =
    signals.includes("connect") &&
    (signals.includes("ethereum") || signals.includes("solana"));

  const hasAuthCombo =
    signals.includes("verify") && signals.includes("account");

  const earlySignals =
    (signals.includes("connect") && signals.includes("account")) ||
    (signals.includes("verify") && signals.includes("connect")) ||
    (signals.includes("portal") && movementPct >= 10);

  if (level === "VERY HIGH") {
    return "CRITICAL";
  }

  if (
    (level === "HIGH" && trend >= 5) ||
    (movementPct >= 30 && trend >= 5) ||
    (score >= 60 && trend >= 5) ||
    hasRewardsCombo
  ) {
    return "HIGH";
  }

  if (
    (hasWalletCombo && trend >= 3) ||
    (hasAuthCombo && trend >= 3) ||
    (tags.includes("REWARDS") && trend >= 3) ||
    (earlySignals && trend >= 2)
  ) {
    return "EARLY";
  }

  return null;
}

function shouldSendAlert(data) {
  return classifyAlert(data) !== null;
}

function formatAlertMessage(data) {
  const level = data.level || "LOW";
  const score = data.score ?? 0;
  const movementPct = data.movementPct ?? 0;
  const trend = data.trend ?? 0;
  const trendDirection = data.trendDirection || "FLAT";
  const signals = data.signals?.length ? data.signals.join(", ") : "none";
  const tags = data.tags?.length ? data.tags.join(", ") : "none";
  const insight = data.insight || "No insight";
  const summary = data.summary || "No summary";
  const alertType = classifyAlert(data) || "INFO";

  const trendText =
    trendDirection === "UP"
      ? `UP +${trend}%`
      : trendDirection === "DOWN"
      ? `DOWN ${trend}%`
      : `${trend}%`;

  let header = "🟢 QUIET SURFACE";
  if (alertType === "EARLY") header = "🟡 EARLY SIGNAL DETECTED";
  if (alertType === "HIGH") header = "🟠 HIGH-CONFIDENCE SIGNAL";
  if (alertType === "CRITICAL") header = "🚨 POND0X ACTIVATION SIGNAL";

  return `${header}

🚦 Alert Type: ${alertType}
⚡ Level: ${level}
📊 Score: ${score}
📈 Movement: ${movementPct}%
📉 Trend: ${trendText}

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
    score: data.score ?? 0,
    movementPct: data.movementPct ?? 0,
    trend: data.trend ?? 0,
    trendDirection: data.trendDirection || "FLAT",
    signals: data.signals || [],
    tags: data.tags || [],
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