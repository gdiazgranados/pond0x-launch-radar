
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"

const [filePath, tradeId, openedAtUtc] = process.argv.slice(2)

if (!filePath || !tradeId || !openedAtUtc) {
  throw new Error("INVALID_WORKER_ARGUMENTS")
}

const modulePath = resolve(
  "src/private-alpha/pondsol-bot/persistent-position-engine.ts"
)

const { PersistentPositionEngine } = await import(
  pathToFileURL(modulePath).href
)

const guard = {
  worstCaseLossUsd: 0.10,
  quoteAgeSeconds: 1,
  estimatedNetProfitPct: 2,
}

try {
  const engine = await PersistentPositionEngine.restore(filePath)

  const state = await engine.enter(
    tradeId,
    10,
    guard,
    openedAtUtc
  )

  console.log(
    JSON.stringify({
      status: "ACCEPTED",
      tradeId: state.positions.openPosition?.tradeId,
    })
  )
} catch (error) {
  console.log(
    JSON.stringify({
      status: "REJECTED",
      error: error instanceof Error
        ? error.message
        : String(error),
    })
  )

  process.exitCode = 2
}
