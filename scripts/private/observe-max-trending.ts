import { resolve } from "node:path"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import {
  coordinateMaxTrendingObservation,
} from "../../src/private-alpha/max-trending-observation-coordinator"

async function main() {
  const dataDirectory = resolve(
    process.env.MAX_TRENDING_DATA_DIR ??
      process.env.SHADOW_DATA_DIR ??
      "private-data"
  )
  const ledgerPath = resolve(
    dataDirectory,
    "max-trending-ledger.json"
  )
  const result = await coordinateMaxTrendingObservation({
    store: new PrivateFileLedgerStore(ledgerPath),
  })

  console.log(JSON.stringify({
    schemaVersion: result.schemaVersion,
    observedAt: result.observedAt,
    status: result.status,
    persisted: result.persisted,
    ledgerRevision: result.ledgerRevision,
    snapshotHash: result.snapshotHash,
    opportunity: result.opportunity,
    event: result.event,
    watchOnly: result.watchOnly,
    approvalGranted: result.approvalGranted,
    transactionRequested: result.transactionRequested,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "MAX trending observation failed"
  )
  process.exitCode = 1
})
