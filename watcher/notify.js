const fs = require("fs-extra");
const path = require("path");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = "-1003564899779";

if (!TELEGRAM_TOKEN) {
  throw new Error("Missing TELEGRAM_TOKEN env variable");
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

function shouldSendAlert(data) {
  const movementPct = data.movementPct ?? 0;
  const score = data.score ?? 0;
  const level = data.level || "LOW";
  const signals = data.signals || [];
  const trend = data.trend ?? 0;

  if (level === "VERY HIGH") return true;
  if (level === "HIGH") return true;
  if (movementPct >= 30) return true;
  if (score >= 60) return true;
  if (trend >= 10) return true;

  const hasStrongCombo =
    (signals.includes("claim") && signals.includes("reward")) ||
    (signals.includes("connect") && signals.includes("ethereum")) ||
    (signals.includes("connect") && signals.includes("solana")) ||
    (signals.includes("verify") && signals.includes("account"));

  if (hasStrongCombo) return true;

  return false;
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

  const trendText =
    trendDirection === "UP"
      ? `UP +${trend}%`
      : trendDirection === "DOWN"
      ? `DOWN ${trend}%`
      : `${trend}%`;

  return `🚨 POND0X RADAR SIGNAL

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
  const latestPath = path.join(__dirname, "output", "latest.json");
  const lastAlertPath = path.join(__dirname, "last-alert.json");

  if (!(await fs.pathExists(latestPath))) {
    throw new Error(`No existe latest.json en: ${latestPath}`);
  }

  const data = await fs.readJson(latestPath);

  if (!(await fs.pathExists(lastAlertPath))) {
    await fs.writeJson(lastAlertPath, { lastSignature: null }, { spaces: 2 });
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

  console.log("Smart alert sent to Telegram channel");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});