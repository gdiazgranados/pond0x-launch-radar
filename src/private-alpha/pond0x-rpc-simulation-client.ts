import {
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
} from "@solana/kit"
import {
  inspectSolanaWireTransaction,
} from "./solana-wire-transaction-inspector"
import type {
  SolanaWireTransactionInspection,
} from "./solana-wire-transaction-inspector"

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>

type RpcEnvelope = {
  id?: unknown
  result?: unknown
  error?: unknown
}

export type Pond0xSimulatedAccount = {
  address: string
  lamports: string
  owner: string
  executable: boolean
  dataBase64: string | null
}

export type Pond0xRpcSimulationObservation = {
  schemaVersion: 1
  status: "SIMULATED" | "BLOCKED"
  simulationSucceeded: boolean
  simulationError: string | null
  estimatedNetworkFeeLamports: string | null
  unitsConsumed: number | null
  logs: ReadonlyArray<string>
  postAccounts: ReadonlyArray<Pond0xSimulatedAccount>
  wireInspection: SolanaWireTransactionInspection
  blockingReasons: ReadonlyArray<string>
  signingEnabled: false
  transactionSubmitted: false
  source: "SOLANA_RPC_SIMULATE_TRANSACTION"
}

const MAX_WATCHED_ACCOUNTS = 16
const MAX_LOG_COUNT = 100
const MAX_LOG_LENGTH = 500

function blocked(
  wireInspection: SolanaWireTransactionInspection,
  reasons: ReadonlyArray<string>
): Pond0xRpcSimulationObservation {
  return {
    schemaVersion: 1,
    status: "BLOCKED",
    simulationSucceeded: false,
    simulationError: null,
    estimatedNetworkFeeLamports: null,
    unitsConsumed: null,
    logs: [],
    postAccounts: [],
    wireInspection,
    blockingReasons: [...new Set(reasons)],
    signingEnabled: false,
    transactionSubmitted: false,
    source: "SOLANA_RPC_SIMULATE_TRANSACTION",
  }
}

function validateRpcUrl(value: string) {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password
  ) {
    throw new Error("Solana RPC URL must be credential-free HTTPS")
  }
  return url
}

function validateWatchedAccounts(
  addresses: ReadonlyArray<string>
) {
  if (addresses.length > MAX_WATCHED_ACCOUNTS) {
    throw new Error("too many watched Solana accounts")
  }
  for (const value of addresses) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
      throw new Error("watched Solana account is invalid")
    }
  }
  if (new Set(addresses).size !== addresses.length) {
    throw new Error("watched Solana accounts must be unique")
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null
}

function safeError(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value.slice(0, 500)
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return "unserializable RPC error"
  }
}

function parsePostAccounts(
  value: unknown,
  addresses: ReadonlyArray<string>
): Pond0xSimulatedAccount[] | null {
  if (!Array.isArray(value) || value.length !== addresses.length) {
    return null
  }

  const accounts: Pond0xSimulatedAccount[] = []
  for (let index = 0; index < value.length; index += 1) {
    const account = record(value[index])
    if (!account) return null
    const lamports = account.lamports
    const owner = account.owner
    const executable = account.executable
    const data = account.data
    if (
      !Number.isSafeInteger(lamports) ||
      Number(lamports) < 0 ||
      typeof owner !== "string" ||
      typeof executable !== "boolean"
    ) {
      return null
    }
    const dataBase64 =
      Array.isArray(data) && typeof data[0] === "string"
        ? data[0]
        : null
    accounts.push({
      address: addresses[index],
      lamports: String(lamports),
      owner,
      executable,
      dataBase64,
    })
  }
  return accounts
}

export async function simulatePond0xWireTransaction(input: {
  rpcUrl: string
  transactionBase64: string
  watchedAccounts?: ReadonlyArray<string>
  fetcher?: FetchLike
}): Promise<Pond0xRpcSimulationObservation> {
  const wireInspection = inspectSolanaWireTransaction(
    input.transactionBase64
  )
  if (wireInspection.status !== "DECODED") {
    return blocked(
      wireInspection,
      wireInspection.blockingReasons
    )
  }

  let rpcUrl: URL
  const watchedAccounts = [...(input.watchedAccounts ?? [])]
  try {
    rpcUrl = validateRpcUrl(input.rpcUrl)
    validateWatchedAccounts(watchedAccounts)
  } catch {
    return blocked(wireInspection, [
      "PONDOX_RPC_REQUEST_INVALID",
    ])
  }

  let messageBase64: string
  try {
    const wireBytes = getBase64Encoder().encode(
      input.transactionBase64
    )
    const transaction = getTransactionDecoder().decode(wireBytes)
    messageBase64 = getBase64Decoder().decode(
      transaction.messageBytes
    )
  } catch {
    return blocked(wireInspection, [
      "PONDOX_RPC_MESSAGE_ENCODING_FAILED",
    ])
  }

  const simulationConfig: Record<string, unknown> = {
    encoding: "base64",
    commitment: "confirmed",
    sigVerify: false,
    replaceRecentBlockhash: true,
    innerInstructions: true,
  }
  if (watchedAccounts.length > 0) {
    simulationConfig.accounts = {
      encoding: "base64",
      addresses: watchedAccounts,
    }
  }

  const body = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "simulateTransaction",
      params: [input.transactionBase64, simulationConfig],
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "getFeeForMessage",
      params: [
        messageBase64,
        { commitment: "confirmed" },
      ],
    },
  ]

  let payload: unknown
  try {
    const response = await (input.fetcher ?? fetch)(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (!response.ok) {
      return blocked(wireInspection, [
        "PONDOX_RPC_HTTP_FAILED",
      ])
    }
    const contentType =
      response.headers.get("content-type") ?? ""
    if (
      !contentType.toLowerCase().includes("application/json")
    ) {
      return blocked(wireInspection, [
        "PONDOX_RPC_CONTENT_TYPE_INVALID",
      ])
    }
    payload = await response.json()
  } catch {
    return blocked(wireInspection, [
      "PONDOX_RPC_REQUEST_FAILED",
    ])
  }

  if (!Array.isArray(payload) || payload.length !== 2) {
    return blocked(wireInspection, [
      "PONDOX_RPC_RESPONSE_INVALID",
    ])
  }
  const envelopes = payload
    .map(record)
    .filter((value): value is Record<string, unknown> =>
      value !== null
    )
  const simulationEnvelope = envelopes.find(
    value => value.id === 1
  ) as RpcEnvelope | undefined
  const feeEnvelope = envelopes.find(
    value => value.id === 2
  ) as RpcEnvelope | undefined
  if (
    !simulationEnvelope ||
    !feeEnvelope ||
    simulationEnvelope.error ||
    feeEnvelope.error
  ) {
    return blocked(wireInspection, [
      "PONDOX_RPC_RESPONSE_INVALID",
    ])
  }

  const simulationResult = record(simulationEnvelope.result)
  const simulationValue = record(simulationResult?.value)
  const feeResult = record(feeEnvelope.result)
  const feeValue = feeResult?.value
  if (
    !simulationValue ||
    !Number.isSafeInteger(feeValue) ||
    Number(feeValue) < 0
  ) {
    return blocked(wireInspection, [
      "PONDOX_RPC_RESPONSE_INVALID",
    ])
  }

  const rawLogs = simulationValue.logs
  const logs = Array.isArray(rawLogs)
    ? rawLogs
        .filter((value): value is string =>
          typeof value === "string"
        )
        .slice(0, MAX_LOG_COUNT)
        .map(value => value.slice(0, MAX_LOG_LENGTH))
    : []
  const unitsConsumed =
    Number.isSafeInteger(simulationValue.unitsConsumed) &&
    Number(simulationValue.unitsConsumed) >= 0
      ? Number(simulationValue.unitsConsumed)
      : null
  const postAccounts = watchedAccounts.length === 0
    ? []
    : parsePostAccounts(
        simulationValue.accounts,
        watchedAccounts
      )
  if (postAccounts === null) {
    return blocked(wireInspection, [
      "PONDOX_RPC_ACCOUNT_EVIDENCE_INVALID",
    ])
  }

  const simulationError = safeError(simulationValue.err)
  const simulationSucceeded = simulationError === null
  const reasons = simulationSucceeded
    ? []
    : ["PONDOX_RPC_SIMULATION_FAILED"]

  return {
    schemaVersion: 1,
    status: simulationSucceeded ? "SIMULATED" : "BLOCKED",
    simulationSucceeded,
    simulationError,
    estimatedNetworkFeeLamports: String(feeValue),
    unitsConsumed,
    logs,
    postAccounts,
    wireInspection,
    blockingReasons: reasons,
    signingEnabled: false,
    transactionSubmitted: false,
    source: "SOLANA_RPC_SIMULATE_TRANSACTION",
  }
}
