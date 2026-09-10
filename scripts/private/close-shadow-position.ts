import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import { closeBasisAwareShadowPosition } from "../../src/private-alpha/shadow-close-lifecycle"
import type {
  MarketSnapshot,
  MarketTrends,
} from "../../src/private-alpha/public-market-evidence-adapter"
import type { SizeAwareQuoteObservation } from "../../src/private-alpha/size-aware-quote"

type ObservationEnvelope = {
  snapshot: MarketSnapshot
  trends: MarketTrends
  sizeAwareQuote: SizeAwareQuoteObservation
  windowKey: "1h" | "6h" | "24h"
  maxAgeMinutes: number
}

async function main() {
  const positionId = process.env.SHADOW_POSITION_ID
  if (!positionId?.trim()) {
    throw new Error("SHADOW_POSITION_ID is required")
  }
  const dataDirectory = resolve(
    process.env.SHADOW_DATA_DIR ?? "private-data"
  )
  const inputPath = resolve(
    process.env.SHADOW_EXIT_INPUT ??
      "private-data/shadow-exit-input.json"
  )
  const envelope = JSON.parse(
    await readFile(inputPath, "utf8")
  ) as ObservationEnvelope
  const result = await closeBasisAwareShadowPosition(
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-portfolio.json")
    ),
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-execution-basis.json")
    ),
    {
      positionId,
      closedAt: new Date().toISOString(),
      snapshot: envelope.snapshot,
      trends: envelope.trends,
      sizeAwareQuote: envelope.sizeAwareQuote,
      windowKey: envelope.windowKey,
      maxAgeMinutes: envelope.maxAgeMinutes,
    }
  )

  if (result.status === "BLOCKED") {
    console.log(JSON.stringify({
      simulationOnly: result.simulationOnly,
      positionId: result.position.positionId,
      tokenId: result.position.tokenId,
      status: result.status,
      positionStatus: result.position.status,
      blockingReasons: result.blockingReasons,
      portfolioRevision: result.state.portfolio.revision,
    }, null, 2))
    return
  }

  console.log(JSON.stringify({
    simulationOnly: result.simulationOnly,
    positionId: result.position.positionId,
    tokenId: result.position.tokenId,
    status: result.status,
    closedAt: result.position.closedAt,
    entryReferenceUsd: result.position.entryReferenceUsd,
    exitReferenceUsd: result.position.exitReferenceUsd,
    simulatedTokenUnits: result.executionBasis.simulatedTokenUnits,
    grossExitProceedsUsd: result.grossExitProceedsUsd,
    totalFeesUsd: result.position.estimatedFeesUsd,
    realizedPnlUsd: result.realizedPnlUsd,
    realizedPnlPct: result.position.realizedPnlPct,
    portfolioRevision: result.state.portfolio.revision,
    evaluation: result.state.evaluation,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "shadow close failed"
  )
  process.exitCode = 1
})
