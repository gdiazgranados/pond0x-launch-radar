const fs = require("fs")
const path = require("path")

const outputDir = path.join(process.cwd(), "public", "data")
const latestPath = path.join(outputDir, "latest.json")
const historyPath = path.join(outputDir, "history.json")

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, "utf8")
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
    return fallback
  }
}

function sameEntry(a, b) {
  return (
    a &&
    b &&
    a.id === b.id &&
    a.generatedAt === b.generatedAt
  )
}

function main() {
  ensureDir(outputDir)

  const latest = readJsonSafe(latestPath, null)
  if (!latest) {
    throw new Error("latest.json not found or invalid")
  }

  const history = readJsonSafe(historyPath, [])
  const normalizedHistory = Array.isArray(history) ? history : []

  const nextHistory = [latest, ...normalizedHistory.filter((item) => !sameEntry(item, latest))]
    .slice(0, 5)

  fs.writeFileSync(historyPath, JSON.stringify(nextHistory, null, 2), "utf8")

  console.log("history.json updated")
  console.log(nextHistory.map((item) => `${item.id} | score=${item.score} | level=${item.level}`).join("\n"))
}

main()