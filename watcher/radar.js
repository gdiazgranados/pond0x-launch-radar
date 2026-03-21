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
  const lower = String(text || "").toLowerCase();
  const hits = [];

  for (const signal of KEY_SIGNALS) {
    if (lower.includes(signal)) {
      hits.push(signal);
    }
  }

  return [...new Set(hits)];
}

async function loadLatestSnapshots() {
  const snapshotsDir = path.join(process.cwd(), "snapshots");

  if (!(await fs.pathExists(snapshotsDir))) {
    throw new Error(`No existe el directorio de snapshots: ${snapshotsDir}`);
  }

  const dirs = (await fs.readdir(snapshotsDir))
    .map((d) => path.join(snapshotsDir, d))
    .filter((p) => fs.statSync(p).isDirectory())
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
  const assetsDir = path.join(dir, "assets");

  if (!(await fs.pathExists(assetsDir))) {
    return files;
  }

  async function walk(currentDir) {
    const items = await fs.readdir(currentDir);

    for (const item of items) {
      const full = path.join(currentDir, item);
      const stat = await fs.stat(full);

      if (stat.isDirectory()) {
        await walk(full);
      } else {
        files.push(full);
      }
    }
  }

  await walk(assetsDir);
  return files;
}

async function readFileSafe(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  const { oldDir, newDir } = await loadLatestSnapshots();

  const oldFiles = await readAssets(oldDir);
  const newFiles = await readAssets(newDir);

  const oldMap = new Map(oldFiles.map((f) => [path.basename(f), f]));
  const newMap = new Map(newFiles.map((f) => [path.basename(f), f]));

  let added = 0;
  let changed = 0;
  const allSignals = new Set();

  for (const [name, newFile] of newMap.entries()) {
    if (!oldMap.has(name)) {
      added++;
      const content = await readFileSafe(newFile);
      scoreSignals(content).forEach((s) => allSignals.add(s));
    } else {
      const oldContent = await readFileSafe(oldMap.get(name));
      const newContent = await readFileSafe(newFile);

      if (oldContent !== newContent) {
        changed++;
        scoreSignals(newContent).forEach((s) => allSignals.add(s));
      }
    }
  }

  const totalFiles = newFiles.length;
  const movementCount = added + changed;
  const movementPct =
    totalFiles > 0 ? Number(((movementCount / totalFiles) * 100).toFixed(2)) : 0;
  const addedPct =
    totalFiles > 0 ? Number(((added / totalFiles) * 100).toFixed(2)) : 0;
  const changedPct =
    totalFiles > 0 ? Number(((changed / totalFiles) * 100).toFixed(2)) : 0;

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

  const signals = [...allSignals];
  // 🧠 SIGNAL GROUPING
const SIGNAL_GROUPS = {
  AUTH: ["verify", "account", "login"],
  REWARDS: ["claim", "reward", "airdrop"],
  CHAIN: ["ethereum", "solana", "connect"],
  SYSTEM: ["enabled", "disabled", "portal", "launch"]
};

// Detect groups
const detectedGroups = [];

for (const [group, keywords] of Object.entries(SIGNAL_GROUPS)) {
  if (signals.some((s) => keywords.includes(s))) {
    detectedGroups.push(group);
  }
}

// 🧠 INSIGHT ENGINE
let insight = "No significant activity detected";
let confidence = 0.2;

if (movementPct > 30 && signals.includes("claim")) {
  insight = "Strong indicators of claim or reward activation";
  confidence = 0.9;
} else if (movementPct > 20 && detectedGroups.includes("AUTH")) {
  insight = "Authentication-related changes detected, possible gated feature";
  confidence = 0.75;
} else if (movementPct > 20 && detectedGroups.includes("CHAIN")) {
  insight = "Blockchain connection flow evolving (wallet or network activity)";
  confidence = 0.7;
} else if (movementPct > 10) {
  insight = "Moderate frontend activity detected";
  confidence = 0.55;
}

  const summary =
    movementCount === 0
      ? `No se detectaron cambios en ${totalFiles} archivos analizados.`
      : `${movementCount} de ${totalFiles} archivos muestran movimiento (${movementPct}%). ${added} nuevos (${addedPct}%) y ${changed} modificados (${changedPct}%).${
          signals.length ? ` Señales: ${signals.join(", ")}.` : " Sin señales relevantes."
        }`;

  const note =
  level === "VERY HIGH"
    ? "Señales fuertes de activación o pre-launch."
    : level === "HIGH"
    ? "Cambios importantes en frontend y signals relevantes."
    : level === "MEDIUM"
    ? "Actividad de desarrollo visible."
    : "Sin señales fuertes por ahora.";

const result = {
  id: path.basename(newDir),
  totalFiles,
  added,
  changed,
  movementCount,
  movementPct,
  addedPct,
  changedPct,
  signals,
  score,
  level,
  insight,
  confidence,
  tags: detectedGroups,
  summary,
  note,
  generatedAt: new Date().toISOString()
};

  const outputDir = path.join(process.cwd(), "output");
  const outputFile = path.join(outputDir, "latest.json");

  await fs.ensureDir(outputDir);
  await fs.writeJson(outputFile, result, { spaces: 2 });

  console.log("Archivo generado:");
  console.log(outputFile);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});