import { appendFileSync } from "node:fs"
import { observeSimplePaperOpportunity } from "../../../src/private-alpha/pondsol-bot/simple-paper-monitor"
const solUsd = Number(process.env.PONDSOL_SOL_USD)
const costUsd = Number(process.env.PONDSOL_COST_BUFFER_USD ?? "0.15")
const output = process.env.PONDSOL_LOG_PATH
if (!Number.isFinite(solUsd) || solUsd <= 0 || !Number.isFinite(costUsd) || costUsd < 0 || !output) {
  console.error("Set PONDSOL_SOL_USD (>0), PONDSOL_COST_BUFFER_USD (>=0), and PONDSOL_LOG_PATH")
  process.exitCode = 2
} else {
  const watch = process.argv.includes("--watch")
  const run = async () => {
    let result: Record<string, unknown>
    try {
      result = await observeSimplePaperOpportunity(solUsd, costUsd)
    } catch (e) {
      result = { decision: "NO_TRADE", reasons: ["QUOTE_READ_FAILED"],
        error: e instanceof Error ? e.message : "UNKNOWN_ERROR",
        tradeAllowed: false, mode: "SIMULATION" }
    }
    const row = JSON.stringify({ at: new Date().toISOString(), ...result, solUsdReference: solUsd,
      solUsdIndependentlyVerified: false, costBufferUsd: costUsd, actualFills: 0, realizedPnlUsd: null })
    appendFileSync(output, row + "\n", { encoding: "utf8" })
    console.log(row)
  }
  await run()
  if (watch) {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 300_000))
      await run()
    }
  }
}
