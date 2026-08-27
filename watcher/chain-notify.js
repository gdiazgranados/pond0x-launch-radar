const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const dataDir = path.join(__dirname, "..", "public", "data");
const chainFile = path.join(dataDir, "chain-intelligence.json");
const recipientLedgerFile = path.join(dataDir, "reward-recipients.json");
const stateFile = path.join(dataDir, "chain-notify-state.json");

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;");
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

async function send(text) {
  if (!TOKEN || !CHAT) {
    console.log("Telegram credentials missing");
    return false;
  }

  const r = await fetch(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: CHAT,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    }
  );

  if (!r.ok) {
    throw new Error(await r.text());
  }

  return true;
}

async function main() {
  if (!(await fs.pathExists(chainFile))) {
    return;
  }

  const c = await fs.readJson(chainFile);

  let ledger = null;
  try {
    ledger = await fs.readJson(recipientLedgerFile);
  } catch {}

  let prev = {};

  try {
    prev = await fs.readJson(stateFile);
  } catch {}

  /*
   * Transition comparisons are only meaningful when the previous
   * observation is recent. Preserve lastSentAt so Telegram cooldown
   * continues to work even after a monitoring gap.
   */
  const prevObservedAt = prev.observedAt
    ? new Date(prev.observedAt).getTime()
    : 0;

  const prevAgeMinutes = prevObservedAt
    ? (Date.now() - prevObservedAt) / 60000
    : Infinity;

  const prevIsFresh =
    prevAgeMinutes >= 0 &&
    prevAgeMinutes <= 15;

  if (!prevIsFresh) {
    prev = {
      lastSentAt: prev.lastSentAt || null,
    };
  }

  const w = c.windows?.["5m"] || {};
  const p = c.predictor || {};
  const a = c.cycleAnalytics || {};
  const m = c.patternMatch || {};

  const now = Date.now();

  const lastSent = prev.lastSentAt
    ? new Date(prev.lastSentAt).getTime()
    : 0;

  const mins = (now - lastSent) / 60000;

  const newExternalTransfers = Number(
    ledger?.newTransfersThisSweep ??
    c?.recipientLedger?.newTransfersThisSweep ??
    0
  );

  const newExternalRecipients = Number(
    ledger?.newRecipientsThisSweep ??
    c?.recipientLedger?.newRecipientsThisSweep ??
    0
  );

  const latestExternalRecipient = Array.isArray(ledger?.recipients)
    ? ledger.recipients[0] || null
    : Array.isArray(c?.recipientLedger?.recipients)
      ? c.recipientLedger.recipients[0] || null
      : null;

  const externalTransfer = newExternalTransfers > 0;

  const resumed =
    (prev.activityState === "QUIET" ||
      prev.activityState === "COOLING") &&
    Number(w.rewardTransfers ?? w.rewards ?? 0) >= 3;

  const spike =
    Number(w.rewardTransfers ?? w.rewards ?? 0) >= 5 &&
    (
      Number(c.rewardTransferVelocityPct ?? c.claimVelocityPct ?? 0) >= 100 ||
      Number(c.volumeVelocityPct || 0) >= 100
    );

  const funding =
    !!c.fundingDetected &&
    !prev.fundingDetected;

  const cycle =
    a.cycleSignal === "DISTRIBUTION_CYCLE_DETECTED" &&
    prev.cycleSignal !== "DISTRIBUTION_CYCLE_DETECTED";

  const fundingWindow =
    p.status === "IN_FUNDING_WINDOW" &&
    prev.predictorStatus !== "IN_FUNDING_WINDOW" &&
    ["HIGH", "VERY HIGH"].includes(a.cadenceConfidence);

  const patternCross =
    Number(m.historicalPatternMatchPct || 0) >= 80 &&
    Number(prev.patternMatchPct || 0) < 80 &&
    !!m.liveEvidence;

  const periodic =
    Number(w.rewardTransfers ?? w.rewards ?? 0) >= 3 &&
    mins >= 30;

  const shouldSend =
    externalTransfer ||
    resumed ||
    spike ||
    funding ||
    cycle ||
    fundingWindow ||
    patternCross ||
    periodic;

  const reason = externalTransfer
    ? "NEW EXTERNAL wPOND TRANSFER"
    : resumed
      ? "REWARD TRANSFER ACTIVITY RESUMED"
      : spike
        ? "REWARD FLOW SPIKE"
        : funding
          ? "DISTRIBUTOR FUNDING DETECTED"
          : cycle
            ? "DISTRIBUTION CYCLE DETECTED"
            : fundingWindow
              ? "EXPECTED FUNDING WINDOW"
              : patternCross
                ? "HIGH PATTERN MATCH + LIVE EVIDENCE"
                : "30-MIN ACTIVITY SUMMARY";

  const externalBlock = externalTransfer
    ? `\n\n🎯 <b>External wPOND recipient activity</b>\nNew transfers this sweep: <b>${fmt(newExternalTransfers)}</b>\nNew recipients this sweep: <b>${fmt(newExternalRecipients)}</b>\nRecipient: <b>${esc(latestExternalRecipient?.wallet || "unknown")}</b>\nAmount: <b>${fmt(latestExternalRecipient?.totalWPOND || 0)} wPOND</b>\nTx: <b>${esc(latestExternalRecipient?.lastSignature || "unknown")}</b>`
    : "";

  const prediction = p.nextFundingExpectedAt
    ? `\n\n🧠 <b>Cycle Intelligence</b>\nCadence confidence: <b>${esc(a.cadenceConfidence || "LOW")}</b>\nReward-transfer-after-funding: <b>${fmt(a.rewardTransferAfterFundingPct ?? a.claimAfterFundingProbabilityPct)}%</b>\nAutomation confidence: <b>${fmt(a.automationConfidence)}/100</b>\nPredictor: <b>${esc(String(p.status || "N/A").replaceAll("_", " "))}</b>\nNext funding estimate: <b>${esc(p.nextFundingExpectedAt)}</b>`
    : "";

  const match = Number.isFinite(
    Number(m.historicalPatternMatchPct)
  )
    ? `\n\n🧬 <b>Pattern Match</b>\nMatch: <b>${fmt(m.historicalPatternMatchPct)}%</b>\nStatus: <b>${esc(String(m.status || "N/A").replaceAll("_", " "))}</b>\nBaseline confidence: <b>${esc(m.baselineConfidence ?? m.confidence ?? "LOW")}</b>\nLive trigger present: <b>${m.liveEvidence ? "YES" : "NO"}</b>`
    : "";

  const msg = `⛓️ <b>POND0X RADAR — ${reason}</b>\n\n⛏️ <b>Last 5 minutes</b>\nReward transfers: <b>${fmt(w.rewardTransfers ?? w.rewards)}</b>\nwPOND distributed: <b>${fmt(w.wpondDistributed)}</b>\nAvg transfer: <b>${fmt(w.avgTransfer ?? w.avgReward)}</b>\nLargest transfer: <b>${fmt(w.largestTransfer ?? w.largestReward)}</b>\n\n📈 Reward transfer velocity: <b>${Number(c.rewardTransferVelocityPct ?? c.claimVelocityPct ?? 0) >= 0 ? "+" : ""}${fmt(c.rewardTransferVelocityPct ?? c.claimVelocityPct)}%</b>\n💧 Volume velocity: <b>${Number(c.volumeVelocityPct || 0) >= 0 ? "+" : ""}${fmt(c.volumeVelocityPct)}%</b>\n💰 Distributor funding: <b>${c.fundingDetected ? "DETECTED" : "not detected"}</b>\n🔗 Chain confirmation: <b>${fmt(c.chainConfirmationScore)}/100</b>\n🔥 Activity: <b>${esc(c.activityState)}</b>${externalBlock}${prediction}${match}\n\n<i>External recipient transfers are tracked as claim candidates; they are not automatically asserted to be rewards.</i>`;

  let lastSentAt = prev.lastSentAt || null;

  if (shouldSend) {
    if (await send(msg)) {
      lastSentAt = new Date().toISOString();
      console.log("Chain alert sent");
    }
  } else {
    console.log("No material chain alert");
  }

  /*
   * Always persist the latest observed state, even when Telegram
   * does not send a message.
   */
  await fs.writeJson(
    stateFile,
    {
      observedAt: new Date().toISOString(),
      lastSentAt,
      activityState: c.activityState,
      fundingDetected: !!c.fundingDetected,
      rewardTransfers5m: Number(w.rewardTransfers ?? w.rewards ?? 0),
      rewards5m: Number(w.rewardTransfers ?? w.rewards ?? 0),
      volume5m: Number(w.wpondDistributed || 0),
      cycleSignal: a.cycleSignal || null,
      predictorStatus: p.status || null,
      patternMatchPct: Number(
        m.historicalPatternMatchPct || 0
      ),
      patternMatchStatus: m.status || null,
      externalClaimLastObservedAt:
        ledger?.lastObservedAt ??
        c?.recipientLedger?.lastObservedAt ??
        null,
      externalClaimTotalTransfers: Number(
        ledger?.totalTransfers ??
        c?.recipientLedger?.totalTransfers ??
        0
      ),
    },
    {
      spaces: 2,
    }
  );
}

main().catch((e) => {
  console.error("chain-notify failed:", e);
  process.exit(1);
});
