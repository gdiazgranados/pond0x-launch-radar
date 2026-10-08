import type { PondSolRpcResult } from "./pondsol-mint-rpc-reader"
import { verifyPondSolIdentity } from "./pondsol-token-identity"

export const PONDSOL_RPC_FRESHNESS = Object.freeze({
  maxObservationAgeMs: 30_000,
  maxSlotLag: 32,
} as const)

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>

export type RpcFreshnessResult = {
  accepted: boolean
  reason: string
  referenceSlot: number | null
  slotLag: number | null
  observationAgeMs: number | null
}

export async function checkPondSolRpcFreshness(
  observation: PondSolRpcResult,
  rpcUrl = "https://api.mainnet-beta.solana.com",
  fetcher: FetchLike = fetch,
  clock: () => number = Date.now
): Promise<RpcFreshnessResult> {
  const reject = (reason: string): RpcFreshnessResult => ({
    accepted: false,
    reason,
    referenceSlot: null,
    slotLag: null,
    observationAgeMs: null,
  })

  if (
    !observation.verified ||
    !observation.observation ||
    observation.observedAtMs === null
  ) {
    return reject("UNVERIFIED_MINT")
  }

  if (!verifyPondSolIdentity(observation.observation).verified) {
    return reject("MINT_IDENTITY_MISMATCH")
  }

  const mintSlot = observation.observation.finalizedSlot
  const observedAtMs = observation.observedAtMs
  const nowMs = clock()

  if (
    !Number.isSafeInteger(mintSlot) ||
    mintSlot <= 0 ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(observedAtMs)
  ) {
    return reject("INVALID_OBSERVATION")
  }

  const ageMs = nowMs - observedAtMs

  if (
    ageMs < 0 ||
    ageMs > PONDSOL_RPC_FRESHNESS.maxObservationAgeMs
  ) {
    return reject("STALE_OBSERVATION")
  }

  let url: URL

  try {
    url = new URL(rpcUrl)
    if (url.protocol !== "https:" || url.username || url.password) {
      return reject("INVALID_RPC_URL")
    }
  } catch {
    return reject("INVALID_RPC_URL")
  }

  async function rpc(method: string): Promise<unknown> {
    const response = await fetcher(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: method === "getSlot"
          ? [{ commitment: "finalized" }]
          : [],
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error("RPC_HTTP_ERROR")
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("RPC_NON_JSON")
    }

    const payload: unknown = await response.json()

    if (!payload || typeof payload !== "object") {
      throw new Error("RPC_INVALID_RESPONSE")
    }

    const record = payload as Record<string, unknown>

    if (
      record.jsonrpc !== "2.0" ||
      record.id !== 1 ||
      record.error !== undefined ||
      !Object.prototype.hasOwnProperty.call(record, "result")
    ) {
      throw new Error("RPC_INVALID_RESPONSE")
    }

    return record.result
  }

  try {
    const referenceSlot = await rpc("getSlot")

    if (
      !Number.isSafeInteger(referenceSlot) ||
      (referenceSlot as number) <= 0
    ) {
      return reject("INVALID_REFERENCE_SLOT")
    }

    const slotLag = (referenceSlot as number) - mintSlot

    if (
      slotLag < 0 ||
      slotLag > PONDSOL_RPC_FRESHNESS.maxSlotLag
    ) {
      return reject("SLOT_LAG_EXCEEDED")
    }

    const health = await rpc("getHealth")

    if (health !== "ok") {
      return reject("RPC_UNHEALTHY")
    }

    const finalAgeMs = clock() - observedAtMs

    if (
      finalAgeMs < 0 ||
      finalAgeMs > PONDSOL_RPC_FRESHNESS.maxObservationAgeMs
    ) {
      return reject("STALE_OBSERVATION")
    }

    return {
      accepted: true,
      reason: "RPC_FRESHNESS_ACCEPTED",
      referenceSlot: referenceSlot as number,
      slotLag,
      observationAgeMs: finalAgeMs,
    }
  } catch {
    return reject("RPC_FRESHNESS_CHECK_FAILED")
  }
}