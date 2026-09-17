import { resolve } from "node:path"

import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import {
  coordinatePendingMaxAttentionOnchain,
} from "../../src/private-alpha/max-attention-onchain-coordinator"

const DEFAULT_SOLANA_RPC_URL =
  "https://api.mainnet-beta.solana.com"

function validationLimit(value: string | undefined) {
  if (value === undefined || value.trim() === "") return 5
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error(
      "MAX_ATTENTION_VALIDATION_LIMIT must be between 1 and 5"
    )
  }
  return parsed
}

async function main() {
  const dataDirectory = resolve(
    process.env.MAX_TRENDING_DATA_DIR ??
      process.env.SHADOW_DATA_DIR ??
      "private-data"
  )
  const inboxStore = new PrivateFileLedgerStore(
    resolve(dataDirectory, "max-attention-inbox.json")
  )
  const onchainStore = new PrivateFileLedgerStore(
    resolve(dataDirectory, "max-attention-onchain.json")
  )
  const result = await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl:
      process.env.SOLANA_RPC_URL ??
      DEFAULT_SOLANA_RPC_URL,
    maxCandidates: validationLimit(
      process.env.MAX_ATTENTION_VALIDATION_LIMIT
    ),
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => {
  console.error(
    error instanceof Error
      ? error.message
      : "MAX attention on-chain validation failed"
  )
  process.exitCode = 1
})
