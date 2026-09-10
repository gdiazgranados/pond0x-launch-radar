import { resolve } from "node:path"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import { retireLegacyShadowPosition } from "../../src/private-alpha/shadow-legacy-retirement"

async function main() {
  const positionId = process.env.SHADOW_POSITION_ID
  if (!positionId?.trim()) {
    throw new Error("SHADOW_POSITION_ID is required")
  }

  const dataDirectory = resolve(
    process.env.SHADOW_DATA_DIR ?? "private-data"
  )
  const result = await retireLegacyShadowPosition(
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-portfolio.json")
    ),
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-execution-basis.json")
    ),
    {
      positionId,
      retiredAt: new Date().toISOString(),
    }
  )

  console.log(JSON.stringify({
    simulationOnly: result.simulationOnly,
    changed: result.changed,
    positionId: result.position.positionId,
    tokenId: result.position.tokenId,
    status: result.position.status,
    invalidationReason: result.position.invalidationReason,
    retiredAt: result.retiredAt,
    exitReferenceUsd: result.position.exitReferenceUsd,
    realizedPnlUsd: result.position.realizedPnlUsd,
    realizedPnlPct: result.position.realizedPnlPct,
    evidenceCount: result.position.evidenceRefs.length,
    portfolioRevision: result.state.portfolio.revision,
    evaluation: result.state.evaluation,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "legacy shadow retirement failed"
  )
  process.exitCode = 1
})
