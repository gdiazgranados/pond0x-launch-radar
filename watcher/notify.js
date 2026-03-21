const fs = require("fs-extra");
const path = require("path");

const TELEGRAM_TOKEN = "8787516823:AAHuPOSID8SzDobCcWZTOl9GaZOwYP9RjHw";
const CHAT_ID = "-1003564899779";

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

async function main() {
  const latestPath = path.join(__dirname, "output", "latest.json");

  if (!(await fs.pathExists(latestPath))) {
    throw new Error(`No existe latest.json en: ${latestPath}`);
  }

  const data = await fs.readJson(latestPath);

  const shouldAlert =
  data.level === "HIGH" ||
  data.level === "VERY HIGH" ||
  (data.movementPct ?? 0) > 30;

  if (!shouldAlert) {
    console.log("No alert triggered");
    return;
  }

  const message =
`🚨 Pond0x Radar Alert

Level: ${data.level}
Score: ${data.score}
Movement: ${data.movementPct}%

Signals: ${data.signals?.join(", ") || "none"}

Insight:
${data.insight || "No insight"}

Summary:
${data.summary || "No summary"}
`;

  await sendTelegramMessage(message);
  console.log("Alert sent to Telegram channel");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});