"use strict";

const fs = require("fs-extra");
const path = require("path");

const {
  readJsonOptional,
} = require("./lib/runtime-data");

const {
  selectSnapshotRetention,
} = require("./lib/snapshot-policy");

const ROOT = path.join(__dirname, "..");

const runtimeArg = process.argv.find((arg) =>
  arg.startsWith("--runtime=")
);

const APPLY = process.argv.includes("--apply");
const PRODUCTION = process.argv.includes("--production");

if (runtimeArg && PRODUCTION) {
  throw new Error(
    "Use either --runtime=... or --production, not both."
  );
}

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

const ARCHIVE_FILE = path.join(
  DATA_DIR,
  "historical-evidence-archive.json"
);

const POLICY_FILE = path.join(
  DATA_DIR,
  "snapshot-retention-policy.json"
);

const KEEP_COUNT = 10;

async function snapshotIds() {
  if (!(await fs.pathExists(SNAPSHOTS_DIR))) {
    return [];
  }

  return (await fs.readdir(
    SNAPSHOTS_DIR,
    { withFileTypes: true }
  ))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  if (APPLY && !runtimeRoot && !PRODUCTION) {
    throw new Error(
      "--apply requires --runtime=... or --production"
    );
  }

  const ids = await snapshotIds();

  if (ids.length <= KEEP_COUNT) {
    console.log(
      `Nothing to prune. Total snapshots: ${ids.length}`
    );
    return;
  }

  const [archive, policy] = await Promise.all([
    readJsonOptional(
      ARCHIVE_FILE,
      { entries: [] }
    ),
    readJsonOptional(
      POLICY_FILE,
      {}
    ),
  ]);

  const currentId =
    policy?.snapshot?.dataSnapshotId ||
    ids.at(-1) ||
    null;

  const selection =
    selectSnapshotRetention({
      snapshotIds: ids,
      archiveEntries: archive?.entries,
      currentId,
      keepCount: KEEP_COUNT,
    });

  console.log(
    `Snapshot Prune v2 - ${APPLY ? "APPLY" : "DRY RUN"}`
  );

  console.log(
    `snapshots=${ids.length} keep=${selection.keep.size} delete=${selection.deleteCandidates.length}`
  );

  console.log(
    `current=${currentId || "none"} quietBaseline=${selection.newestQuietBaseline || "none"}`
  );

  for (const snapshotId of selection.deleteCandidates) {
    console.log(`DELETE ${snapshotId}`);
  }

  if (!APPLY) {
    console.log(
      "DRY RUN ONLY - no snapshots were deleted."
    );
    return;
  }

  for (const snapshotId of selection.deleteCandidates) {
    await fs.remove(
      path.join(SNAPSHOTS_DIR, snapshotId)
    );
  }

  console.log(
    `Prune complete. Kept ${selection.keep.size}/${KEEP_COUNT} snapshots.`
  );
}

main().catch((error) => {
  console.error(
    "Error pruning snapshots:",
    error.message || error
  );
  process.exit(1);
});