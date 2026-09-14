"use strict";

const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME_ROOT = path.join(ROOT, ".radar-runtime");
const LOCAL_DATA = path.join(RUNTIME_ROOT, "data");
const LOCAL_SNAPSHOTS = path.join(RUNTIME_ROOT, "snapshots");

const STAGE = path.join(ROOT, ".radar-sync-stage");
const STAGE_DATA = path.join(STAGE, "data");
const STAGE_SNAPSHOTS = path.join(STAGE, "snapshots");

const WORKTREE = path.join(os.tmpdir(), "pond0x-radar-data-sync");

function git(args, capture = false) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function snapshotIds(dir) {
  if (!(await exists(dir))) return [];

  return (await fs.readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function cleanupWorktree() {
  try {
    execFileSync(
      "git",
      ["worktree", "remove", WORKTREE, "--force"],
      { cwd: ROOT, stdio: "ignore" }
    );
  } catch {}

  await fs.rm(WORKTREE, { recursive: true, force: true });
}

async function validateState(dataDir, snapshotsDir, label) {
  const latest = await readJson(path.join(dataDir, "latest.json"));
  const snapshots = await snapshotIds(snapshotsDir);
  const newest = snapshots.at(-1) || null;

  if (!latest?.snapshotId) {
    throw new Error(`${label} latest.json has no snapshotId.`);
  }

  if (latest.snapshotId !== newest) {
    throw new Error(
      `${label} state mismatch: latest=${latest.snapshotId} newestSnapshot=${newest}`
    );
  }

  return {
    latest,
    snapshots,
    newest,
  };
}

async function stageRemoteState() {
  const remoteData = path.join(WORKTREE, "data");
  const remoteSnapshots = path.join(WORKTREE, "snapshots");

  if (!(await exists(remoteData))) {
    throw new Error("radar-data/data is missing.");
  }

  if (!(await exists(remoteSnapshots))) {
    throw new Error("radar-data/snapshots is missing.");
  }

  await fs.rm(STAGE, { recursive: true, force: true });
  await fs.mkdir(STAGE, { recursive: true });

  await Promise.all([
    fs.cp(remoteData, STAGE_DATA, { recursive: true, force: true }),
    fs.cp(remoteSnapshots, STAGE_SNAPSHOTS, {
      recursive: true,
      force: true,
    }),
  ]);

  return validateState(
    STAGE_DATA,
    STAGE_SNAPSHOTS,
    "Remote radar-data"
  );
}

async function copyRuntimeData() {
  await fs.mkdir(LOCAL_DATA, { recursive: true });

  for (const name of await fs.readdir(STAGE_DATA)) {
    if (name === "latest.json") continue;

    await fs.cp(
      path.join(STAGE_DATA, name),
      path.join(LOCAL_DATA, name),
      { recursive: true, force: true }
    );
  }
}

async function replaceSnapshotsSafely() {
  const backup = `${LOCAL_SNAPSHOTS}.sync-backup`;

  await fs.rm(backup, { recursive: true, force: true });

  if (await exists(LOCAL_SNAPSHOTS)) {
    await fs.rename(LOCAL_SNAPSHOTS, backup);
  }

  try {
    await fs.rename(STAGE_SNAPSHOTS, LOCAL_SNAPSHOTS);

    await fs.copyFile(
      path.join(STAGE_DATA, "latest.json"),
      path.join(LOCAL_DATA, "latest.json")
    );

    await fs.rm(backup, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(LOCAL_SNAPSHOTS, { recursive: true, force: true });

    if (await exists(backup)) {
      await fs.rename(backup, LOCAL_SNAPSHOTS);
    }

    throw error;
  }
}

async function main() {
  console.log("Radar Production Sync");
  console.log("---------------------");

  await cleanupWorktree();

  git(["fetch", "origin", "radar-data"]);
  git(["worktree", "prune"]);
  git([
    "worktree",
    "add",
    "--detach",
    WORKTREE,
    "origin/radar-data",
  ]);

  await stageRemoteState();
  await copyRuntimeData();
  await replaceSnapshotsSafely();

  const local = await validateState(
    LOCAL_DATA,
    LOCAL_SNAPSHOTS,
    "Local sync"
  );

  const commit = git(
    ["rev-parse", "--short", "origin/radar-data"],
    true
  ).trim();

  console.log("");
  console.log(`radar-data commit ..... ${commit}`);
  console.log(`latest snapshot ....... ${local.latest.snapshotId}`);
  console.log(`local snapshot ........ ${local.newest}`);
  console.log(`snapshots restored .... ${local.snapshots.length}`);
  console.log("");
  console.log("STATE: ALIGNED");
}

main()
  .catch((error) => {
    console.error(
      "Radar sync failed:",
      error.message || error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await fs.rm(STAGE, { recursive: true, force: true });
    await cleanupWorktree();
  });