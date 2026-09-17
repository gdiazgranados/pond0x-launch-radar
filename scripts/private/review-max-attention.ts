import { resolve } from "node:path"

import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import {
  parseMaxAttentionReviewCommand,
  runMaxAttentionReviewCommand,
} from "../../src/private-alpha/max-attention-review-command"

async function main() {
  const dataDirectory = resolve(
    process.env.MAX_TRENDING_DATA_DIR ??
      process.env.SHADOW_DATA_DIR ??
      "private-data"
  )
  const store = new PrivateFileLedgerStore(
    resolve(dataDirectory, "max-attention-inbox.json")
  )
  const command = parseMaxAttentionReviewCommand(
    process.argv.slice(2)
  )
  const result = await runMaxAttentionReviewCommand({
    store,
    command,
  })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => {
  console.error(
    error instanceof Error
      ? error.message
      : "MAX attention review failed"
  )
  process.exitCode = 1
})
