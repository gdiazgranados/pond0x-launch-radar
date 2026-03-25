const fs = require("fs-extra");
const path = require("path");

async function copyFile(src, dest) {
  if (!(await fs.pathExists(src))) {
    throw new Error(`No existe archivo fuente: ${src}`);
  }
  await fs.copy(src, dest, { overwrite: true });
  console.log(`Copied: ${path.basename(src)} -> ${path.basename(dest)}`);
}

async function main() {
  const root = path.join(__dirname, "..");
  const dataDir = path.join(root, "public", "data");

  await copyFile(
    path.join(dataDir, "latest.demo.json"),
    path.join(dataDir, "latest.json")
  );

  await copyFile(
    path.join(dataDir, "history.demo.json"),
    path.join(dataDir, "history.json")
  );

  await copyFile(
    path.join(dataDir, "alerts-history.demo.json"),
    path.join(dataDir, "alerts-history.json")
  );
  const now = new Date().toISOString();

  await fs.writeJson(
    path.join(dataDir, "heartbeat.json"),
    {
      source: "demo-mode",
      lastRunAt: now,
      lastSuccessAt: now,
      status: "success",
      scheduleMinutes: 60
    },
    { spaces: 2 }
  );

  console.log("Heartbeat set to fresh (demo mode)");

  console.log("Demo mode activated.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});