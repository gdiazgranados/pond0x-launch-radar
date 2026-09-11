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

export type Pond0xUnsignedOrderCapture = {
  schemaVersion: 1
  status: "CAPTURED" | "BLOCKED"
  capturedAt: string
  transactionBase64: string | null
  requestId: string | null
  taker: string
  inputMint: string
  outputMint: string
  inputAmountBaseUnits: string
  referralAccount: string
  referralFeeBps: number
  watchedAccounts: ReadonlyArray<string>
  wireInspection: SolanaWireTransactionInspection | null
  blockingReasons: ReadonlyArray<string>
  signingEnabled: false
  transactionSubmitted: false
  source: "PONDOX_WATCH_ONLY_UNSIGNED_ORDER"
}

const ORDER_URL = "https://ultra-api.jup.ag/order"

function validAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
}

function blocked(input: {
  taker: string
  inputMint: string
  outputMint: string
  inputAmountBaseUnits: string
  referralAccount: string
  referralFeeBps: number
  reason: string
}): Pond0xUnsignedOrderCapture {
  return {
    schemaVersion: 1,
    status: "BLOCKED",
    capturedAt: new Date().toISOString(),
    transactionBase64: null,
    requestId: null,
    taker: input.taker,
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    inputAmountBaseUnits: input.inputAmountBaseUnits,
    referralAccount: input.referralAccount,
    referralFeeBps: input.referralFeeBps,
    watchedAccounts: [],
    wireInspection: null,
    blockingReasons: [input.reason],
    signingEnabled: false,
    transactionSubmitted: false,
    source: "PONDOX_WATCH_ONLY_UNSIGNED_ORDER",
  }
}

export async function capturePond0xUnsignedOrder(input: {
  taker: string
  inputMint: string
  outputMint: string
  inputAmountBaseUnits: string
  referralAccount: string
  referralFeeBps: number
  fetcher?: FetchLike
}): Promise<Pond0xUnsignedOrderCapture> {
  const invalid =
    !validAddress(input.taker) ||
    !validAddress(input.inputMint) ||
    !validAddress(input.outputMint) ||
    input.inputMint === input.outputMint ||
    !validAddress(input.referralAccount) ||
    !/^[1-9]\d*$/.test(input.inputAmountBaseUnits) ||
    !Number.isSafeInteger(input.referralFeeBps) ||
    input.referralFeeBps < 0 ||
    input.referralFeeBps > 10_000
  if (invalid) {
    return blocked({ ...input, reason: "PONDOX_ORDER_REQUEST_INVALID" })
  }

  const url = new URL(ORDER_URL)
  url.searchParams.set("inputMint", input.inputMint)
  url.searchParams.set("outputMint", input.outputMint)
  url.searchParams.set("amount", input.inputAmountBaseUnits)
  url.searchParams.set("taker", input.taker)
  url.searchParams.set("referralAccount", input.referralAccount)
  url.searchParams.set("referralFee", String(input.referralFeeBps))

  let payload: Record<string, unknown>
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (!response.ok) {
      return blocked({ ...input, reason: "PONDOX_ORDER_HTTP_FAILED" })
    }
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().includes("application/json")) {
      return blocked({ ...input, reason: "PONDOX_ORDER_CONTENT_TYPE_INVALID" })
    }
    const value: unknown = await response.json()
    if (!value || typeof value !== "object") {
      return blocked({ ...input, reason: "PONDOX_ORDER_RESPONSE_INVALID" })
    }
    payload = value as Record<string, unknown>
  } catch {
    return blocked({ ...input, reason: "PONDOX_ORDER_REQUEST_FAILED" })
  }

  const transactionBase64 =
    typeof payload.transaction === "string"
      ? payload.transaction
      : null
  const requestId =
    typeof payload.requestId === "string"
      ? payload.requestId
      : null
  if (!transactionBase64 || !requestId) {
    return blocked({ ...input, reason: "PONDOX_ORDER_TRANSACTION_UNAVAILABLE" })
  }

  const wireInspection = inspectSolanaWireTransaction(transactionBase64)
  const reasons = [...wireInspection.blockingReasons]
  if (wireInspection.feePayer !== input.taker) {
    reasons.push("PONDOX_ORDER_FEE_PAYER_MISMATCH")
  }

  return {
    schemaVersion: 1,
    status: reasons.length === 0 ? "CAPTURED" : "BLOCKED",
    capturedAt: new Date().toISOString(),
    transactionBase64,
    requestId,
    taker: input.taker,
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    inputAmountBaseUnits: input.inputAmountBaseUnits,
    referralAccount: input.referralAccount,
    referralFeeBps: input.referralFeeBps,
    watchedAccounts: [input.taker, input.referralAccount],
    wireInspection,
    blockingReasons: [...new Set(reasons)],
    signingEnabled: false,
    transactionSubmitted: false,
    source: "PONDOX_WATCH_ONLY_UNSIGNED_ORDER",
  }
}
