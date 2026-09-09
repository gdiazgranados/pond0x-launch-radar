import { resolve } from "node:path"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import { openAuditedShadowProposal } from "../../src/private-alpha/shadow-position-lifecycle"

async function main() {
  const positionId = process.env.SHADOW_POSITION_ID
  if (!positionId?.trim()) {
    throw new Error("SHADOW_POSITION_ID is required")
  }

  const dataDirectory = resolve(
    process.env.SHADOW_DATA_DIR ?? "private-data"
  )
  const result = await openAuditedShadowProposal(
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-portfolio.json")
    ),
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-decisions.json")
    ),
    {
      positionId,
      confirmedAt: new Date().toISOString(),
    }
  )

  console.log(JSON.stringify({
    simulationOnly: result.simulationOnly,
    positionId: result.position.positionId,
    tokenId: result.position.tokenId,
    status: result.position.status,
    openedAt: result.position.openedAt,
    confirmedAt: result.confirmedAt,
    entryReferenceUsd: result.position.entryReferenceUsd,
    notionalUsd: result.position.notionalUsd,
    portfolioRevision: result.state.portfolio.revision,
    evaluation: result.state.evaluation,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "shadow position open failed"
  )
  process.exitCode = 1
})
