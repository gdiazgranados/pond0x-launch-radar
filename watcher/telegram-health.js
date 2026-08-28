const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const dataDir = path.join(__dirname, "..", "public", "data");
const outputFile = path.join(dataDir, "telegram-health.json");
const lastAlertFile = path.join(dataDir, "last-alert.json");
const chainNotifyStateFile = path.join(dataDir, "chain-notify-state.json");

async function readJsonSafe(file) {
  try {
    return await fs.readJson(file);
  } catch {
    return null;
  }
}

async function telegramCall(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    const description = payload?.description || `HTTP ${response.status}`;
    throw new Error(`${method}: ${description}`);
  }

  return payload.result;
}

async function main() {
  const checkedAt = new Date().toISOString();
  const lastAlert = await readJsonSafe(lastAlertFile);
  const chainState = await readJsonSafe(chainNotifyStateFile);

  const health = {
    checkedAt,
    status: "UNKNOWN",
    credentialsConfigured: Boolean(TOKEN && CHAT),
    botReachable: false,
    chatReachable: false,
    botUsername: null,
    chatTitle: null,
    lastSuccessfulAlertAt: lastAlert?.sentAt || null,
    lastSuccessfulChainAlertAt: chainState?.lastSentAt || null,
    lastError: null,
  };

  if (!TOKEN || !CHAT) {
    health.status = "ERROR";
    health.lastError = "Telegram credentials are missing";
    await fs.writeJson(outputFile, health, { spaces: 2 });
    console.log("Telegram health: ERROR — credentials missing");
    return;
  }

  try {
    const bot = await telegramCall("getMe");
    health.botReachable = true;
    health.botUsername = bot?.username || null;

    const chat = await telegramCall("getChat", { chat_id: CHAT });
    health.chatReachable = true;
    health.chatTitle = chat?.title || chat?.username || chat?.first_name || null;

    health.status = "HEALTHY";
    console.log("Telegram health: HEALTHY");
  } catch (error) {
    health.status = health.botReachable ? "DEGRADED" : "ERROR";
    health.lastError = error instanceof Error ? error.message : String(error);
    console.log(`Telegram health: ${health.status} — ${health.lastError}`);
  }

  await fs.writeJson(outputFile, health, { spaces: 2 });
}

main().catch(async (error) => {
  const fallback = {
    checkedAt: new Date().toISOString(),
    status: "ERROR",
    credentialsConfigured: Boolean(TOKEN && CHAT),
    botReachable: false,
    chatReachable: false,
    botUsername: null,
    chatTitle: null,
    lastSuccessfulAlertAt: null,
    lastSuccessfulChainAlertAt: null,
    lastError: error instanceof Error ? error.message : String(error),
  };

  await fs.ensureDir(dataDir);
  await fs.writeJson(outputFile, fallback, { spaces: 2 });
  console.error("telegram-health failed:", error);
});