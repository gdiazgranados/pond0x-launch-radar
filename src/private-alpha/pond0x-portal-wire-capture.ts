import { isAddress } from "@solana/kit"
import {
  inspectSolanaWireTransaction,
  type SolanaWireTransactionInspection,
} from "./solana-wire-transaction-inspector"

export type Pond0xPortalWireCapture = {
  schemaVersion: 1
  status: "CAPTURED" | "BLOCKED"
  capturedAt: string
  portalUrl: string
  responseUrl: string
  expectedWallet: string
  requestId: string | null
  transactionBase64: string | null
  wireSha256: string | null
  wireInspection:
    SolanaWireTransactionInspection | null
  blockingReasons: ReadonlyArray<string>
  executionAuthorized: false
  signingEnabled: false
  transactionSubmitted: false
  source: "PONDOX_PORTAL_INTERCEPTED_WIRE"
}

function record(
  value: unknown
): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null
}

export function capturePond0xPortalWire(input: {
  capturedAt: string
  portalUrl: string
  responseUrl: string
  expectedWallet: string
  payload: unknown
}): Pond0xPortalWireCapture {
  const reasons: string[] = []
  const payload = record(input.payload)
  let portalUrl: URL | null = null
  let responseUrl: URL | null = null

  try {
    portalUrl = new URL(input.portalUrl)
  } catch {
    portalUrl = null
  }

  try {
    responseUrl = new URL(input.responseUrl)
  } catch {
    responseUrl = null
  }

  if (!Number.isFinite(Date.parse(input.capturedAt))) {
    reasons.push(
      "PONDOX_PORTAL_WIRE_TIMESTAMP_INVALID"
    )
  }

  if (
    portalUrl?.origin !== "https://www.pond0x.com"
  ) {
    reasons.push(
      "PONDOX_PORTAL_WIRE_PORTAL_ORIGIN_INVALID"
    )
  }

  if (
    responseUrl?.protocol !== "https:" ||
    responseUrl.hostname !== "ultra-api.jup.ag" ||
    responseUrl.pathname !== "/order"
  ) {
    reasons.push(
      "PONDOX_PORTAL_WIRE_RESPONSE_ORIGIN_INVALID"
    )
  }

  if (
    !isAddress(input.expectedWallet) ||
    responseUrl?.searchParams.get("taker") !==
      input.expectedWallet
  ) {
    reasons.push(
      "PONDOX_PORTAL_WIRE_TAKER_MISMATCH"
    )
  }

  const transactionBase64 =
    typeof payload?.transaction === "string" &&
    payload.transaction.length > 0
      ? payload.transaction
      : null

  const requestId =
    typeof payload?.requestId === "string" &&
    payload.requestId.trim().length > 0 &&
    payload.requestId.length <= 256
      ? payload.requestId
      : null

  if (payload === null) {
    reasons.push(
      "PONDOX_PORTAL_WIRE_RESPONSE_INVALID"
    )
  }

  if (transactionBase64 === null) {
    reasons.push(
      "PONDOX_PORTAL_WIRE_TRANSACTION_UNAVAILABLE"
    )
  }

  if (requestId === null) {
    reasons.push(
      "PONDOX_PORTAL_WIRE_REQUEST_ID_INVALID"
    )
  }

  let wireInspection:
    SolanaWireTransactionInspection | null = null

  if (transactionBase64 !== null) {
    wireInspection = inspectSolanaWireTransaction(
      transactionBase64
    )
    reasons.push(
      ...wireInspection.blockingReasons
    )

    if (
      wireInspection.feePayer !==
        input.expectedWallet ||
      wireInspection.requiredSigners.length !== 1 ||
      wireInspection.requiredSigners[0] !==
        input.expectedWallet
    ) {
      reasons.push(
        "PONDOX_PORTAL_WIRE_SIGNER_MISMATCH"
      )
    }
  }

  return {
    schemaVersion: 1,
    status:
      reasons.length === 0 ? "CAPTURED" : "BLOCKED",
    capturedAt: input.capturedAt,
    portalUrl: input.portalUrl,
    responseUrl: input.responseUrl,
    expectedWallet: input.expectedWallet,
    requestId,
    transactionBase64,
    wireSha256:
      wireInspection?.wireSha256 ?? null,
    wireInspection,
    blockingReasons: [...new Set(reasons)],
    executionAuthorized: false,
    signingEnabled: false,
    transactionSubmitted: false,
    source: "PONDOX_PORTAL_INTERCEPTED_WIRE",
  }
}