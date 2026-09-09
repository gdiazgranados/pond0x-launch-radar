import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import { markShadowPosition } from "../../src/private-alpha/shadow-mark-to-market"
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
    process.env.SHADOW_OBSERVATION_INPUT ??
      "private-data/shadow-observation-input.json"
  )
  const envelope = JSON.parse(
    await readFile(inputPath, "utf8")
  ) as ObservationEnvelope
  const result = await markShadowPosition(
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-portfolio.json")
    ),
    {
      positionId,
      markedAt: new Date().toISOString(),
      snapshot: envelope.snapshot,
      trends: envelope.trends,
      sizeAwareQuote: envelope.sizeAwareQuote,
      windowKey: envelope.windowKey,
      maxAgeMinutes: envelope.maxAgeMinutes,
    }
  )

  console.log(JSON.stringify({
    simulationOnly: result.simulationOnly,
    positionId: result.position.positionId,
    tokenId: result.position.tokenId,
    status: result.position.status,
    markedAt: result.markedAt,
    entryReferenceUsd: result.position.entryReferenceUsd,
    currentReferenceUsd: result.currentReferenceUsd,
    grossUnrealizedPnlUsd: result.grossUnrealizedPnlUsd,
    estimatedNetLiquidationPnlUsd:
      result.estimatedNetLiquidationPnlUsd,
    maxAdverseExcursionPct:
      result.position.maxAdverseExcursionPct,
    maxFavorableExcursionPct:
      result.position.maxFavorableExcursionPct,
    evidenceCount: result.position.evidenceRefs.length,
    portfolioRevision: result.state.portfolio.revision,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "shadow mark failed"
  )
  process.exitCode = 1
})
