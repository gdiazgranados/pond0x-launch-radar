import { resolve } from "node:path"

import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import { loadMaxAttentionInboxLedger } from "../../src/private-alpha/max-attention-inbox-repository"
import { loadMaxAttentionJupiterLedger } from "../../src/private-alpha/max-attention-jupiter-repository"
import { loadMaxAttentionOnchainLedger } from "../../src/private-alpha/max-attention-onchain-repository"
import { buildMaxAttentionTopReport } from "../../src/private-alpha/max-attention-top-report"

async function main() {
  const dataDirectory = resolve(
    process.env.MAX_TRENDING_DATA_DIR ??
      process.env.SHADOW_DATA_DIR ??
      "private-data"
  )
  const [inbox, onchain, jupiter] = await Promise.all([
    loadMaxAttentionInboxLedger(
      new PrivateFileLedgerStore(
        resolve(dataDirectory, "max-attention-inbox.json")
      )
    ),
    loadMaxAttentionOnchainLedger(
      new PrivateFileLedgerStore(
        resolve(dataDirectory, "max-attention-onchain.json")
      )
    ),
    loadMaxAttentionJupiterLedger(
      new PrivateFileLedgerStore(
        resolve(dataDirectory, "max-attention-jupiter.json")
      )
    ),
  ])
  const report = buildMaxAttentionTopReport({
    inbox,
    onchain,
    jupiter,
  })
  console.log(JSON.stringify(report, null, 2))
}

main().catch(error => {
  console.error(
    error instanceof Error
      ? error.message
      : "MAX attention Top 10 report failed"
  )
  process.exitCode = 1
})
