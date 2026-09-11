import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  simulatePond0xWireTransaction,
} from "../../src/private-alpha/pond0x-rpc-simulation-client"

const inputPath = resolve(
  process.env.PONDOX_UNSIGNED_TRANSACTION_INPUT ??
    "private-data/pond0x-unsigned-transaction.json"
)
const outputPath = resolve(
  process.env.PONDOX_SIMULATION_OUTPUT ??
    "private-data/pond0x-protected-rpc-simulation.json"
)
const dataDirectory = resolve(
  process.env.SHADOW_DATA_DIR ?? "private-data"
)
const rpcUrl =
  process.env.SOLANA_RPC_URL ??
  "https://api.mainnet-beta.solana.com"

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error(
      "unsigned transaction input must be a JSON object"
    )
  }
  return value as Record<string, unknown>
}

function parseInput(value: unknown) {
  const input = record(value)
  const transactionBase64 = input.transactionBase64
  if (
    typeof transactionBase64 !== "string" ||
    transactionBase64.length === 0
  ) {
    throw new Error(
      "transactionBase64 is required in the private input file"
    )
  }
  const watchedAccounts = input.watchedAccounts
  if (
    watchedAccounts !== undefined &&
    (
      !Array.isArray(watchedAccounts) ||
      watchedAccounts.some(
        account => typeof account !== "string"
      )
    )
  ) {
    throw new Error("watchedAccounts must be a string array")
  }

  return {
    transactionBase64,
    watchedAccounts:
      watchedAccounts as string[] | undefined,
  }
}

async function main() {
  const raw = await readFile(inputPath, "utf8")
  const captured = parseInput(JSON.parse(raw))
  const observation = await simulatePond0xWireTransaction({
    rpcUrl,
    transactionBase64: captured.transactionBase64,
    watchedAccounts: captured.watchedAccounts,
  })
  const observedAt = new Date().toISOString()
  const archivePath = resolve(
    dataDirectory,
    "pond0x-protected-rpc-simulations",
    observedAt.replace(/[^0-9A-Za-z]/g, "") + ".json"
  )
  const artifact = {
    observedAt,
    inputPath,
    ...observation,
  }
  const serialized = JSON.stringify(artifact, null, 2)

  await mkdir(dirname(archivePath), { recursive: true })
  await writeFile(archivePath, serialized, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, serialized, {
    encoding: "utf8",
    mode: 0o600,
  })

  console.log(JSON.stringify({
    simulationOnly: true,
    readOnlyRpc: true,
    walletConnected: false,
    signingEnabled: false,
    transactionSubmitted: false,
    status: observation.status,
    simulationSucceeded: observation.simulationSucceeded,
    estimatedNetworkFeeLamports:
      observation.estimatedNetworkFeeLamports,
    unitsConsumed: observation.unitsConsumed,
    watchedAccountCount: observation.postAccounts.length,
    logCount: observation.logs.length,
    blockingReasons: observation.blockingReasons,
    outputPath,
    archivePath,
  }, null, 2))

  if (observation.status !== "SIMULATED") {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "protected Pond0x RPC simulation failed"
  )
  process.exitCode = 1
})
