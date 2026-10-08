import test from "node:test"
import { PONDSOL_TOKEN_IDENTITY } from "../../../src/private-alpha/pondsol-bot/pondsol-token-identity"
import assert from "node:assert/strict"

import {
  checkPondSolRpcFreshness,
} from "../../../src/private-alpha/pondsol-bot/pondsol-rpc-freshness"

import type {
  PondSolRpcResult,
} from "../../../src/private-alpha/pondsol-bot/pondsol-mint-rpc-reader"

const now = Date.now()

function observation(
  slot = 1000,
  observedAtMs = now
): PondSolRpcResult {
  return {
    verified: true,
    reasons: [],
    observedAtMs,
    observation: {
      mint: PONDSOL_TOKEN_IDENTITY.mint,
      ownerProgram: PONDSOL_TOKEN_IDENTITY.tokenProgram,
      decimals: 9,
      accountType: "mint",
      finalizedSlot: slot,
    },
  }
}

function mockFetch(
  slot: unknown = 1010,
  health: unknown = "ok"
) {
  return async (
    _input: string | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = JSON.parse(String(init?.body))
    const result = request.method === "getSlot"
      ? slot
      : health

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    )
  }
}

test("accepts healthy recent slot", async () => {
  const result = await checkPondSolRpcFreshness(
    observation(),
    undefined,
    mockFetch()
  )

  assert.equal(result.accepted, true)
  assert.equal(result.slotLag, 10)
})

test("rejects excessive slot lag", async () => {
  const result = await checkPondSolRpcFreshness(
    observation(),
    undefined,
    mockFetch(1100)
  )

  assert.equal(result.accepted, false)
  assert.equal(result.reason, "SLOT_LAG_EXCEEDED")
})

test("rejects future reference mismatch", async () => {
  const result = await checkPondSolRpcFreshness(
    observation(),
    undefined,
    mockFetch(999)
  )

  assert.equal(result.reason, "SLOT_LAG_EXCEEDED")
})

test("rejects stale observation", async () => {
  const result = await checkPondSolRpcFreshness(
    observation(1000, now - 60_000),
    undefined,
    mockFetch(),
    () => now
  )

  assert.equal(result.reason, "STALE_OBSERVATION")
})

test("rejects unverified mint", async () => {
  const result = await checkPondSolRpcFreshness(
    { ...observation(), verified: false },
    undefined,
    mockFetch()
  )

  assert.equal(result.reason, "UNVERIFIED_MINT")
})

test("rejects unhealthy RPC", async () => {
  const result = await checkPondSolRpcFreshness(
    observation(),
    undefined,
    mockFetch(1010, "behind")
  )

  assert.equal(result.reason, "RPC_UNHEALTHY")
})

test("rejects invalid slot response", async () => {
  const result = await checkPondSolRpcFreshness(
    observation(),
    undefined,
    mockFetch("invalid")
  )

  assert.equal(result.reason, "INVALID_REFERENCE_SLOT")
})

test("rejects insecure RPC URL", async () => {
  const result = await checkPondSolRpcFreshness(
    observation(),
    "http://example.com",
    mockFetch()
  )

  assert.equal(result.reason, "INVALID_RPC_URL")
})

test("fails closed on network exception", async () => {
  const fetcher = async (): Promise<Response> => {
    throw new Error("offline")
  }

  const result = await checkPondSolRpcFreshness(
    observation(),
    undefined,
    fetcher
  )

  assert.equal(result.reason, "RPC_FRESHNESS_CHECK_FAILED")
})

test("rejects forged verified observation", async () => {
  const forged = observation()

  if (!forged.observation) {
    throw new Error("Missing test fixture")
  }

  forged.observation.mint = "forged-mint"

  let calls = 0

  const fetcher = async (): Promise<Response> => {
    calls++
    throw new Error("RPC must not be called")
  }

  const result = await checkPondSolRpcFreshness(
    forged,
    undefined,
    fetcher
  )

  assert.equal(result.accepted, false)
  assert.equal(result.reason, "MINT_IDENTITY_MISMATCH")
  assert.equal(calls, 0)
})