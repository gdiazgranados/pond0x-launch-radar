const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const dataDir = path.join(__dirname, "..", "public", "data");
const chainFile = path.join(dataDir, "chain-intelligence.json");
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
    resumed ||
    spike ||
    funding ||
    cycle ||
    fundingWindow ||
    patternCross ||
    periodic;

  const reason = resumed
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

  const prediction = p.nextFundingExpectedAt
    ? `

🧠 <b>Cycle Intelligence</b>
Cadence confidence: <b>${esc(a.cadenceConfidence || "LOW")}</b>
Reward-transfer-after-funding: <b>${fmt(a.rewardTransferAfterFundingPct ?? a.claimAfterFundingProbabilityPct)}%</b>
Automation confidence: <b>${fmt(a.automationConfidence)}/100</b>
Predictor: <b>${esc(String(p.status || "N/A").replaceAll("_", " "))}</b>
Next funding estimate: <b>${esc(p.nextFundingExpectedAt)}</b>`
    : "";

  const match = Number.isFinite(
    Number(m.historicalPatternMatchPct)
  )
    ? `

🧬 <b>Pattern Match</b>
Match: <b>${fmt(m.historicalPatternMatchPct)}%</b>
Status: <b>${esc(String(m.status || "N/A").replaceAll("_", " "))}</b>
Model confidence: <b>${esc(m.confidence || "LOW")}</b>
Live trigger present: <b>${m.liveEvidence ? "YES" : "NO"}</b>`
    : "";

  const msg = `⛓️ <b>POND0X RADAR — ${reason}</b>

⛏️ <b>Last 5 minutes</b>
Reward transfers: <b>${fmt(w.rewardTransfers ?? w.rewards)}</b>
wPOND distributed: <b>${fmt(w.wpondDistributed)}</b>
Avg transfer: <b>${fmt(w.avgTransfer ?? w.avgReward)}</b>
Largest transfer: <b>${fmt(w.largestTransfer ?? w.largestReward)}</b>

📈 Reward transfer velocity: <b>${Number(c.rewardTransferVelocityPct ?? c.claimVelocityPct ?? 0) >= 0 ? "+" : ""}${fmt(c.rewardTransferVelocityPct ?? c.claimVelocityPct)}%</b>
💧 Volume velocity: <b>${Number(c.volumeVelocityPct || 0) >= 0 ? "+" : ""}${fmt(c.volumeVelocityPct)}%</b>
💰 Distributor funding: <b>${c.fundingDetected ? "DETECTED" : "not detected"}</b>
🔗 Chain confirmation: <b>${fmt(c.chainConfirmationScore)}/100</b>
🔥 Activity: <b>${esc(c.activityState)}</b>${prediction}${match}

<i>Statistical on-chain intelligence. Pattern Match is similarity to observed historical cycles, not a probability or guarantee of a claim or launch.</i>`;

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
