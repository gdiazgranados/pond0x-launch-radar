const fs = require("fs-extra");
const path = require("path");

const MAX_HISTORY = 50;

async function main() {
  const watcherDir = __dirname;
  const root = path.join(watcherDir, "..");

  const latestPath = path.join(root, "public", "data", "latest.json");
  const historyPath = path.join(root, "public", "data", "history.json");

  if (!(await fs.pathExists(latestPath))) {
    throw new Error(`No existe latest.json en: ${latestPath}`);
  }

  const latest = await fs.readJson(latestPath);

  let history = [];
  if (await fs.pathExists(historyPath)) {
    history = await fs.readJson(historyPath);
    if (!Array.isArray(history)) {
      history = [];
    }
  }

  const totalFiles = latest.totalFiles ?? 0;
  const added = latest.added ?? 0;
  const changed = latest.changed ?? 0;
  const movementCount = latest.movementCount ?? (added + changed);

  const addedPct =
    latest.addedPct ??
    (totalFiles > 0 ? Number(((added / totalFiles) * 100).toFixed(2)) : 0);

  const changedPct =
    latest.changedPct ??
    (totalFiles > 0 ? Number(((changed / totalFiles) * 100).toFixed(2)) : 0);

  const movementPct =
    latest.movementPct ??
    (totalFiles > 0 ? Number(((movementCount / totalFiles) * 100).toFixed(2)) : 0);

  const summary =
    latest.summary ??
    (movementCount === 0
      ? `No se detectaron cambios en ${totalFiles} archivos analizados.`
      : `${movementCount} de ${totalFiles} archivos muestran movimiento (${movementPct}%). ${added} nuevos (${addedPct}%) y ${changed} modificados (${changedPct}%).${
          latest.signals?.length
            ? ` Señales: ${latest.signals.join(", ")}.`
            : " Sin señales relevantes."
        }`);

  const previous = history[0] || null;
  const previousMovementPct = previous?.movementPct ?? 0;
  const trend = Number((movementPct - previousMovementPct).toFixed(2));

  let trendDirection = "FLAT";
  if (trend > 0) trendDirection = "UP";
  if (trend < 0) trendDirection = "DOWN";

  const normalized = {
    ...latest,
    totalFiles,
    movementCount,
    addedPct,
    changedPct,
    movementPct,
    summary,
    significance: latest.significance ?? "NONE",
    rarityScore: latest.rarityScore ?? 0,
    focusAreas: Array.isArray(latest.focusAreas) ? latest.focusAreas : [],
    sensitiveHits: Array.isArray(latest.sensitiveHits) ? latest.sensitiveHits : [],
    changeTypes: Array.isArray(latest.changeTypes) ? latest.changeTypes : [],
    changedFiles: Array.isArray(latest.changedFiles) ? latest.changedFiles : [],
    trend,
    trendDirection,
  };

  history = history.filter((h) => h.id !== normalized.id);
  history.unshift(normalized);
  history = history.slice(0, MAX_HISTORY);

  await fs.ensureDir(path.dirname(historyPath));
  await fs.writeJson(historyPath, history, { spaces: 2 });

  console.log(
    `${normalized.id} | score=${normalized.score} | level=${normalized.level} | significance=${normalized.significance} | trend=${normalized.trend} | focus=${normalized.focusAreas.join(",") || "none"}`
  );
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});