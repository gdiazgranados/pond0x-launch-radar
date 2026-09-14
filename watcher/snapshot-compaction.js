"use strict";

const fs = require("fs-extra");
const path = require("path");
const { arr, readJsonRequired } = require("./lib/runtime-data");
const { evidenceReasons } = require("./lib/snapshot-policy");

const ROOT = path.join(__dirname, "..");
const runtimeArg = process.argv.find((arg) => arg.startsWith("--runtime="));
const APPLY = process.argv.includes("--apply");
const PRODUCTION = process.argv.includes("--production");

if (runtimeArg && PRODUCTION) {
  throw new Error("Use either --runtime=... or --production, not both.");
}

const runtimeRoot = runtimeArg
  ? path.resolve(ROOT, runtimeArg.slice("--runtime=".length))
  : null;

const DATA_DIR = runtimeRoot
  ? path.join(runtimeRoot, "data")
  : path.join(ROOT, "public", "data");

const SNAPSHOTS_DIR = runtimeRoot
  ? path.join(runtimeRoot, "snapshots")
  : path.join(ROOT, "snapshots");

const POLICY_FILE = path.join(DATA_DIR, "snapshot-retention-policy.json");
const ARCHIVE_FILE = path.join(DATA_DIR, "historical-evidence-archive.json");

const CORE_FILES = [
  "manifest.json",
  "urls.json",
  "api.json",
  "index.html",
];

async function directorySize(dir) {
  if (!(await fs.pathExists(dir))) return 0;

  let total = 0;

  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);

    total += entry.isDirectory()
      ? await directorySize(target)
      : entry.isFile()
        ? (await fs.stat(target)).size
        : 0;
  }

  return total;
}

async function inspectCore(dir) {
  const missing = [];
  let sizeBytes = 0;

  for (const name of CORE_FILES) {
    const file = path.join(dir, name);

    if (!(await fs.pathExists(file))) {
      missing.push(name);
      continue;
    }

    sizeBytes += (await fs.stat(file)).size;
  }

  return {
    complete: missing.length === 0,
    missing,
    sizeBytes,
  };
}

async function getSnapshotIds() {
  if (!(await fs.pathExists(SNAPSHOTS_DIR))) return [];

  return (await fs.readdir(SNAPSHOTS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function buildPlan(rows) {
  const quietCandidates = rows.filter(
    (row) =>
      !row.current &&
      row.core.complete &&
      row.reasons.length === 0
  );

  const newestQuietBaseline =
    quietCandidates.at(-1)?.snapshotId || null;

  return rows.map((row) => {
    const alreadyCompact =
      row.core.complete &&
      row.sizeBytes === row.core.sizeBytes;

    let action = "KEEP_FULL";
    let reason = "evidence";

    if (row.current) {
      reason = "CURRENT";
    } else if (!row.core.complete) {
      reason = `CORE_INCOMPLETE:${row.core.missing.join(",")}`;
    } else if (row.reasons.length) {
      reason = row.reasons.join(",");
    } else if (row.snapshotId === newestQuietBaseline) {
      reason = "QUIET_BASELINE";
    } else if (alreadyCompact) {
      action = "ALREADY_COMPACT";
      reason = "redundant_quiet";
    } else {
      action = "COMPACT_CORE";
      reason = "redundant_quiet";
    }

    return {
      ...row,
      action,
      reason,
      projectedBytes:
        action === "COMPACT_CORE"
          ? row.core.sizeBytes
          : row.sizeBytes,
    };
  });
}

async function compactSnapshot(snapshotId) {
  const dir = path.join(SNAPSHOTS_DIR, snapshotId);

  await Promise.all([
    fs.remove(path.join(dir, "assets")),
    fs.remove(path.join(dir, "api")),
  ]);
}

function toMiB(bytes) {
  return bytes / 1024 / 1024;
}

function printPlan(plan, totalBytes, projectedBytes) {
  const count = (action) =>
    plan.filter((row) => row.action === action).length;

  console.log(
    `Snapshot Compaction v1 - ${APPLY ? "APPLY" : "DRY RUN"}`
  );
  console.log("--------------------------------");
  console.log(`snapshots .............. ${plan.length}`);
  console.log(`full snapshots kept .... ${count("KEEP_FULL")}`);
  console.log(`compact candidates ..... ${count("COMPACT_CORE")}`);
  console.log(`already compact ........ ${count("ALREADY_COMPACT")}`);
  console.log(
    `total size ............. ${toMiB(totalBytes).toFixed(2)} MiB`
  );
  console.log(
    `projected size ......... ${toMiB(projectedBytes).toFixed(2)} MiB`
  );
  console.log(
    `potential reduction .... ${toMiB(
      totalBytes - projectedBytes
    ).toFixed(2)} MiB`
  );
  console.log("");

  for (const row of plan) {
    console.log(
      `${row.action.padEnd(15)} ${row.snapshotId} ` +
      `${toMiB(row.sizeBytes).toFixed(2).padStart(6)} MiB  ${row.reason}`
    );
  }
}

async function main() {
  if (APPLY && !runtimeRoot && !PRODUCTION) {
    throw new Error("--apply requires --runtime=... or --production");
  }

  const [policy, archive] = await Promise.all([
    readJsonRequired(POLICY_FILE),
    readJsonRequired(ARCHIVE_FILE),
  ]);

  if (policy.evaluationStatus !== "READY") {
    throw new Error(
      `Retention policy is not READY: ${policy.evaluationStatus}`
    );
  }

  if (policy.snapshot?.aligned !== true) {
    throw new Error("Retention policy snapshot is not aligned.");
  }

  const snapshotIds = await getSnapshotIds();
  const currentId = policy.snapshot?.dataSnapshotId || null;

  if (!currentId || !snapshotIds.includes(currentId)) {
    throw new Error("Current snapshot is missing from snapshot storage.");
  }

  const archiveBySnapshot = new Map(
    arr(archive?.entries)
      .filter((entry) => entry?.snapshotId)
      .map((entry) => [entry.snapshotId, entry])
  );

  const rows = await Promise.all(
    snapshotIds.map(async (snapshotId) => {
      const dir = path.join(SNAPSHOTS_DIR, snapshotId);

      return {
        snapshotId,
        current: snapshotId === currentId,
        sizeBytes: await directorySize(dir),
        core: await inspectCore(dir),
        reasons: evidenceReasons(
          archiveBySnapshot.get(snapshotId)
        ),
      };
    })
  );

  const plan = buildPlan(rows);

  const totalBytes = plan.reduce(
    (sum, row) => sum + row.sizeBytes,
    0
  );

  const projectedBytes = plan.reduce(
    (sum, row) => sum + row.projectedBytes,
    0
  );

  printPlan(plan, totalBytes, projectedBytes);

  if (!APPLY) {
    console.log("");
    console.log("DRY RUN ONLY - no snapshot files were modified.");
    return;
  }

  for (const row of plan) {
    if (row.action === "COMPACT_CORE") {
      await compactSnapshot(row.snapshotId);
    }
  }

  const actualBytes = (
    await Promise.all(
      snapshotIds.map((snapshotId) =>
        directorySize(
          path.join(SNAPSHOTS_DIR, snapshotId)
        )
      )
    )
  ).reduce((sum, value) => sum + value, 0);

  console.log("");
  console.log(
    `actual size after apply ${toMiB(actualBytes).toFixed(2)} MiB`
  );
  console.log(
    `actual reduction ....... ${toMiB(
      totalBytes - actualBytes
    ).toFixed(2)} MiB`
  );
}

main().catch((error) => {
  console.error(
    "snapshot-compaction failed:",
    error.message || error
  );
  process.exit(1);
});