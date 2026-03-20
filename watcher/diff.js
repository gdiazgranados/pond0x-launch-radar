const fs = require("fs-extra");
const path = require("path");

async function loadJson(p) {
  return fs.readJson(p);
}

function mapByUrl(items) {
  const m = new Map();
  for (const item of items) m.set(item.url, item);
  return m;
}

async function main() {
  const snapshotsDir = path.join(process.cwd(), "snapshots");

  if (!(await fs.pathExists(snapshotsDir))) {
    console.log("No existe la carpeta snapshots.");
    return;
  }

  const dirs = (await fs.readdir(snapshotsDir))
    .map((name) => path.join(snapshotsDir, name))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort();

  if (dirs.length < 2) {
    console.log("Necesitas al menos 2 snapshots.");
    return;
  }

  const oldDir = dirs[dirs.length - 2];
  const newDir = dirs[dirs.length - 1];

  const oldUrls = await loadJson(path.join(oldDir, "urls.json"));
  const newUrls = await loadJson(path.join(newDir, "urls.json"));

  const oldMap = mapByUrl(oldUrls);
  const newMap = mapByUrl(newUrls);

  const added = [];
  const removed = [];
  const changed = [];

  for (const [url, item] of newMap.entries()) {
    if (!oldMap.has(url)) {
      added.push(item);
    } else {
      const oldItem = oldMap.get(url);
      if (oldItem.sha256 !== item.sha256) {
        changed.push({
          url,
          oldFile: oldItem.file,
          newFile: item.file,
          oldHash: oldItem.sha256,
          newHash: item.sha256,
        });
      }
    }
  }

  for (const [url, item] of oldMap.entries()) {
    if (!newMap.has(url)) {
      removed.push(item);
    }
  }

  console.log("\n=== RELEASE DIFF ===\n");
  console.log(`Anterior: ${path.basename(oldDir)}`);
  console.log(`Nuevo   : ${path.basename(newDir)}\n`);

  console.log(`Archivos nuevos: ${added.length}`);
  for (const a of added) console.log(` + ${a.url}`);

  console.log(`\nArchivos eliminados: ${removed.length}`);
  for (const r of removed) console.log(` - ${r.url}`);

  console.log(`\nArchivos modificados: ${changed.length}`);
  for (const c of changed) console.log(` * ${c.url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});