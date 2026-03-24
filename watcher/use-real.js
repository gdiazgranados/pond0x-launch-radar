const fs = require("fs-extra");
const path = require("path");

async function copyIfExists(src, dest) {
  if (await fs.pathExists(src)) {
    await fs.copy(src, dest, { overwrite: true });
    console.log(`Copied: ${path.basename(src)} -> ${path.basename(dest)}`);
  } else {
    console.log(`Skipped (not found): ${src}`);
  }
}

async function main() {
  const root = path.join(__dirname, "..");
  const dataDir = path.join(root, "public", "data");

  await copyIfExists(
    path.join(dataDir, "latest.backup.json"),
    path.join(dataDir, "latest.json")
  );

  await copyIfExists(
    path.join(dataDir, "history.backup.json"),
    path.join(dataDir, "history.json")
  );

  await copyIfExists(
    path.join(dataDir, "alerts-history.backup.json"),
    path.join(dataDir, "alerts-history.json")
  );
  await copyIfExists(
  path.join(dataDir, "heartbeat.backup.json"),
  path.join(dataDir, "heartbeat.json")
);

  console.log("Real mode restored from backups.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});