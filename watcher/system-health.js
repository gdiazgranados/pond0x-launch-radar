const fs = require("fs-extra");
const path = require("path");

const dataDir = path.join(__dirname, "..", "public", "data");
const outputFile = path.join(dataDir, "system-health.json");

async function readJsonSafe(name) {
  try {
    return await fs.readJson(path.join(dataDir, name));
  } catch {
    return null;
  }
}

function normalizeStatus(value) {
  const status = String(value || "UNKNOWN").toUpperCase();
  if (["HEALTHY", "SUCCESS", "FRESH"].includes(status)) return "HEALTHY";
  if (["DEGRADED", "LAGGING", "PARTIAL"].includes(status)) return "DEGRADED";
  if (["ERROR", "FAILED", "BLIND_SPOT", "STALE"].includes(status)) return "ERROR";
  return "UNKNOWN";
}

function stage(status, detail, checkedAt) {
  return { status, detail, checkedAt };
}

async function main() {
  const checkedAt = new Date().toISOString();

  const heartbeat = await readJsonSafe("heartbeat.json");
  const latest = await readJsonSafe("latest.json");
  const chain = await readJsonSafe("chain-intelligence.json");
  const telegram = await readJsonSafe("telegram-health.json");

  const triggerStatus = heartbeat?.status === "success" ? "HEALTHY" : "ERROR";
  const captureStatus = normalizeStatus(latest?.observability?.status);
  const chainStatus = normalizeStatus(chain?.chainObservability?.status);
  const radarStatus = latest?.generatedAt ? "HEALTHY" : "ERROR";
  const telegramStatus = normalizeStatus(telegram?.status);

  const stages = {
    trigger: stage(
      triggerStatus,
      heartbeat?.source
        ? `Sweep accepted from ${heartbeat.source}`
        : "Heartbeat unavailable",
      heartbeat?.lastSuccessAt || heartbeat?.lastRunAt || checkedAt
    ),
    capture: stage(
      captureStatus,
      latest?.observability?.status
        ? `Web observability ${latest.observability.status}`
        : "Capture observability unavailable",
      latest?.generatedAt || checkedAt
    ),
    chain: stage(
      chainStatus,
      chain?.chainObservability?.status
        ? `Chain observability ${chain.chainObservability.status}`
        : "Chain observability unavailable",
      chain?.generatedAt || chain?.checkedAt || checkedAt
    ),
    radar: stage(
      radarStatus,
      latest?.generatedAt
        ? `Radar snapshot ${latest.id || "generated"}`
        : "latest.json unavailable",
      latest?.generatedAt || checkedAt
    ),
    telegram: stage(
      telegramStatus,
      telegram?.status
        ? `Telegram probe ${telegram.status}`
        : "Telegram probe unavailable",
      telegram?.checkedAt || checkedAt
    ),
    publish: stage(
      "HEALTHY",
      "This health snapshot is only visible after radar-data publication succeeds",
      checkedAt
    ),
  };

  const statuses = Object.values(stages).map((item) => item.status);
  const coreStages = [
    stages.trigger.status,
    stages.capture.status,
    stages.chain.status,
    stages.radar.status,
    stages.publish.status,
  ];

  let overall = "HEALTHY";
  if (coreStages.includes("ERROR")) overall = "ERROR";
  else if (statuses.includes("ERROR") || statuses.includes("DEGRADED") || statuses.includes("UNKNOWN")) {
    overall = "DEGRADED";
  }

  const output = {
    checkedAt,
    overall,
    stages,
    run: {
      source: heartbeat?.source || null,
      triggerEvent: heartbeat?.triggerEvent || null,
      workflowRunId: heartbeat?.workflowRunId || null,
      workflowRunNumber: heartbeat?.workflowRunNumber || null,
      actor: heartbeat?.actor || null,
      lastSuccessAt: heartbeat?.lastSuccessAt || null,
    },
  };

  await fs.writeJson(outputFile, output, { spaces: 2 });
  console.log(`System health: ${overall}`);
}

main().catch((error) => {
  console.error("system-health failed:", error);
  process.exit(1);
});