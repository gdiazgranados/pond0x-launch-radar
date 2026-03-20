const fs = require("fs-extra");
const path = require("path");

const KEY_SIGNALS = [
  "claim",
  "reward",
  "rewards",
  "verify",
  "connect",
  "connect x",
  "ethereum",
  "solana",
  "account",
  "payout",
  "enabled",
  "disabled",
  "launch",
  "portal",
  "airdrop"
];

function scoreSignals(text) {
  const lower = text.toLowerCase();
  let hits = [];

  for (const signal of KEY_SIGNALS) {
    if (lower.includes(signal)) {
      hits.push(signal);
    }
  }

  return [...new Set(hits)];
}

async function loadLatestSnapshots() {
  const snapshotsDir = path.join(process.cwd(), "snapshots");

  const dirs = (await fs.readdir(snapshotsDir))
    .map(d => path.join(snapshotsDir, d))
    .filter(p => fs.statSync(p).isDirectory())
    .sort();

  if (dirs.length < 2) {
    throw new Error("Necesitas al menos 2 snapshots");
  }

  return {
    oldDir: dirs[dirs.length - 2],
    newDir: dirs[dirs.length - 1]
  };
}

async function readAssets(dir) {
  const files = [];

  async function walk(d) {
    const items = await fs.readdir(d);
    for (const item of items) {
      const full = path.join(d, item);
      const stat = await fs.stat(full);
      if (stat.isDirectory()) {
        await walk(full);
      } else {
        files.push(full);
      }
    }
  }

  await walk(path.join(dir, "assets"));
  return files;
}

async function readFileSafe(file) {
  try {
    return (await fs.readFile(file)).toString("utf8");
  } catch {
    return "";
  }
}

async function main() {
  const { oldDir, newDir } = await loadLatestSnapshots();

  const oldFiles = await readAssets(oldDir);
  const newFiles = await readAssets(newDir);

  const oldMap = new Map(oldFiles.map(f => [path.basename(f), f]));
  const newMap = new Map(newFiles.map(f => [path.basename(f), f]));

  let added = 0;
  let changed = 0;
  const allSignals = new Set();

  for (const [name, newFile] of newMap.entries()) {
    if (!oldMap.has(name)) {
      added++;
      const content = await readFileSafe(newFile);
      scoreSignals(content).forEach(s => allSignals.add(s));
    } else {
      const oldContent = await readFileSafe(oldMap.get(name));
      const newContent = await readFileSafe(newFile);

      if (oldContent !== newContent) {
        changed++;
        scoreSignals(newContent).forEach(s => allSignals.add(s));
      }
    }
  }

  let score = 0;
  score += added * 10;
  score += changed * 5;
  score += allSignals.size * 7;

  if (added === 0 && changed === 0) score -= 20;
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  let level = "LOW";
  if (score > 20) level = "MEDIUM";
  if (score > 50) level = "HIGH";
  if (score > 80) level = "VERY HIGH";

  const result = {
    id: path.basename(newDir),
    added,
    changed,
    signals: [...allSignals],
    score,
    level,
    note:
      level === "VERY HIGH"
        ? "Señales fuertes de activación o pre-launch."
        : level === "HIGH"
        ? "Cambios importantes en frontend y signals relevantes."
        : level === "MEDIUM"
        ? "Actividad de desarrollo visible."
        : "Sin señales fuertes por ahora.",
    generatedAt: new Date().toISOString()
  };

  await fs.ensureDir(path.join(process.cwd(), "output"));
  await fs.writeJson(path.join(process.cwd(), "output", "latest.json"), result, { spaces: 2 });

  console.log("Archivo generado:");
  console.log(path.join(process.cwd(), "output", "latest.json"));
  console.log(result);
}

main().catch(console.error);