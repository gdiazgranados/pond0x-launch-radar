const fs = require("fs-extra")
const path = require("path")

const KEEP_COUNT = 10

async function main() {
  const snapshotsDir = path.join(process.cwd(), "snapshots")

  if (!(await fs.pathExists(snapshotsDir))) {
    console.log("No snapshots directory found.")
    return
  }

  const dirs = (await fs.readdir(snapshotsDir))
    .map((name) => ({
      name,
      fullPath: path.join(snapshotsDir, name),
    }))
    .filter((entry) => fs.statSync(entry.fullPath).isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))

  if (dirs.length <= KEEP_COUNT) {
    console.log(`Nothing to prune. Total snapshots: ${dirs.length}`)
    return
  }

  const toDelete = dirs.slice(0, dirs.length - KEEP_COUNT)

  for (const entry of toDelete) {
    await fs.remove(entry.fullPath)
    console.log(`Deleted snapshot: ${entry.name}`)
  }

  console.log(`Prune complete. Kept latest ${KEEP_COUNT} snapshots.`)
}

main().catch((err) => {
  console.error("Error pruning snapshots:", err.message || err)
  process.exit(1)
})