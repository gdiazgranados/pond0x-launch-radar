"use strict";

const fs = require("fs-extra");
const path = require("path");

const {
  arr,
  n,
  readJsonOptional,
} = require("./lib/runtime-data");

const ROOT = path.join(__dirname, "..");

const runtimeArg = process.argv.find((arg) =>
  arg.startsWith("--runtime=")
);

const runtimeRoot = runtimeArg
  ? path.resolve(
      ROOT,
      runtimeArg.slice("--runtime=".length)
    )
  : null;

const DATA_DIR = runtimeRoot
  ? path.join(runtimeRoot, "data")
  : path.join(ROOT, "public", "data");

const SNAPSHOTS_DIR = runtimeRoot
  ? path.join(runtimeRoot, "snapshots")
  : path.join(ROOT, "snapshots");

const LATEST_FILE = path.join(DATA_DIR, "latest.json");
const DISCOVERY_FILE = path.join(DATA_DIR, "discovery.json");
const ROUTE_FILE = path.join(DATA_DIR, "route-api-discovery.json");
const DECISION_FILE = path.join(DATA_DIR, "activation-decision.json");

const OUTPUT_FILE = path.join(
  DATA_DIR,
  "snapshot-retention-policy.json"
);

const MAX_EVIDENCE_SNAPSHOTS = 10;

async function getSnapshotDirs() {
  if (!(await fs.pathExists(SNAPSHOTS_DIR))) return [];

  const entries = await fs.readdir(
    SNAPSHOTS_DIR,
    { withFileTypes: true }
  );

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function evaluateMeaningfulChange({
  latest,
  discovery,
  route,
  decision,
}) {
  const reasons = [];

  if (n(latest?.score) > 0) {
    reasons.push("radar_score_positive");
  }

  if (
    latest?.triggerState &&
    latest.triggerState !== "IDLE"
  ) {
    reasons.push("trigger_state_active");
  }

  if (
    latest?.activationState &&
    latest.activationState !== "IDLE"
  ) {
    reasons.push("activation_state_active");
  }

  if (discovery?.newUnknownChange === true) {
    reasons.push("fresh_discovery");
  }

  if (
    arr(discovery?.newApiRoutes).length ||
    arr(discovery?.newLiveApiRoutes).length ||
    arr(discovery?.criticalKeywords).length
  ) {
    reasons.push("discovery_delta");
  }

  if (arr(route?.dormantToLive).length) {
    reasons.push("dormant_to_live");
  }

  if (route?.apiResponseDrift?.detected === true) {
    reasons.push("api_response_drift");
  }

  if (
    decision?.state &&
    decision.state !== "QUIET"
  ) {
    reasons.push(`decision_${decision.state}`);
  }

  return reasons;
}

async function main() {
  await fs.ensureDir(DATA_DIR);

  const [latest, discovery, route, decision] =
    await Promise.all([
      readJsonOptional(LATEST_FILE),
      readJsonOptional(DISCOVERY_FILE),
      readJsonOptional(ROUTE_FILE),
      readJsonOptional(DECISION_FILE),
    ]);

  const snapshots = await getSnapshotDirs();
  const newestLocalSnapshotId = snapshots.at(-1) || null;
  const dataSnapshotId = latest?.snapshotId || null;

  const snapshotAligned =
    Boolean(dataSnapshotId) &&
    dataSnapshotId === newestLocalSnapshotId;

  let evaluationStatus = "READY";
  let preserveFullSnapshot = true;
  let reasons = [];

  if (!latest) {
    evaluationStatus = "LATEST_DATA_MISSING";
    reasons = ["latest_data_missing"];
  } else if (!newestLocalSnapshotId) {
    evaluationStatus = "SNAPSHOT_MISSING";
    reasons = ["snapshot_missing"];
  } else if (!snapshotAligned) {
    evaluationStatus = "INPUT_MISMATCH";
    reasons = ["snapshot_input_mismatch"];
  } else {
    reasons = evaluateMeaningfulChange({
      latest,
      discovery,
      route,
      decision,
    });

    preserveFullSnapshot = reasons.length > 0;
  }

  const output = {
    version: 1,
    evaluatedAt: new Date().toISOString(),

    evaluationStatus,

    snapshot: {
      dataSnapshotId,
      newestLocalSnapshotId,
      aligned: snapshotAligned,
    },

    preserveFullSnapshot,
    reasons,

    policy: {
      baselineSnapshots: 1,
      maxEvidenceSnapshots: MAX_EVIDENCE_SNAPSHOTS,
      quietSweepPersistence: "metadata-only",
      meaningfulChangePersistence: "full-snapshot",
      mismatchBehavior: "preserve-full-snapshot",
    },
  };

  await fs.writeJson(
    OUTPUT_FILE,
    output,
    { spaces: 2 }
  );

  console.log(
    `Snapshot Retention Policy v1 | status=${evaluationStatus} snapshot=${dataSnapshotId || "none"} local=${newestLocalSnapshotId || "none"} preserve=${preserveFullSnapshot} reasons=${reasons.join(",") || "none"}`
  );
}

main().catch((error) => {
  console.error(
    "snapshot-retention-policy failed:",
    error
  );
  process.exit(1);
});