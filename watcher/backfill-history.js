const fs = require("fs-extra");
const path = require("path");

async function main() {
  const historyPath = path.join(process.cwd(), "..", "public", "data", "history.json");

  const exists = await fs.pathExists(historyPath);
  if (!exists) {
    throw new Error(`No existe: ${historyPath}`);
  }

  const history = await fs.readJson(historyPath);

  const fixed = history.map((item) => {
    const totalFiles = item.totalFiles ?? 66;
    const added = item.added ?? 0;
    const changed = item.changed ?? 0;
    const movementCount = item.movementCount ?? (added + changed);

    const addedPct =
      item.addedPct ?? (totalFiles > 0 ? Number(((added / totalFiles) * 100).toFixed(2)) : 0);

    const changedPct =
      item.changedPct ??
      (totalFiles > 0 ? Number(((changed / totalFiles) * 100).toFixed(2)) : 0);

    const movementPct =
      item.movementPct ??
      (totalFiles > 0 ? Number(((movementCount / totalFiles) * 100).toFixed(2)) : 0);

    const summary =
      item.summary ??
      (movementCount === 0
        ? `No se detectaron cambios en ${totalFiles} archivos analizados.`
        : `${movementCount} de ${totalFiles} archivos muestran movimiento (${movementPct}%). ${added} nuevos (${addedPct}%) y ${changed} modificados (${changedPct}%).${
            item.signals?.length ? ` Señales: ${item.signals.join(", ")}.` : " Sin señales relevantes."
          }`);

    return {
      ...item,
      totalFiles,
      movementCount,
      addedPct,
      changedPct,
      movementPct,
      summary,
    };
  });

  await fs.writeJson(historyPath, fixed, { spaces: 2 });
  console.log("History actualizado:", historyPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});