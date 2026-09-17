import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_DIAGNOSTIC_INPUT_LAMPORTS,
  WRAPPED_SOL_MINT,
  validateMaxAttentionJupiterRoute,
} from "../../src/private-alpha/max-attention-jupiter-validator"
import type {
  SolanaMintValidation,
} from "../../src/private-alpha/solana-mint-validator"

const MINT = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx"

function onchain(
  overrides: Partial<SolanaMintValidation> = {}
): SolanaMintValidation {
  return {
    schemaVersion: 1,
    observedAt: "2026-09-17T02:30:00.000Z",
    network: "solana",
    mintAddress: MINT,
    status: "VERIFIED_ONCHAIN",
    rpcSlot: 100,
    ownerProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    tokenProgram: "TOKEN",
    executable: false,
    initialized: true,
    decimals: 6,
    supplyRaw: "123456",
    mintAuthority: null,
    freezeAuthority: null,
    accountAge: null,
    accountAgeReason: "UNAVAILABLE_FROM_MINT_ACCOUNT",
    consistency: "MATCHED",
    blockingReasons: [],
    caveats: [],
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "SOLANA_RPC_MINT_VALIDATION",
    ...overrides,
  }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

test("confirms a read-only Jupiter route after verified mint evidence", async () => {
  let requestedUrl = ""
  let requestedInit: RequestInit | undefined
  const result = await validateMaxAttentionJupiterRoute({
    network: "solana",
    contractAddress: MINT,
    onchainValidation: onchain(),
    fetcher: async (url, init) => {
      requestedUrl = String(url)
      requestedInit = init
      return jsonResponse({
        inAmount: DEFAULT_DIAGNOSTIC_INPUT_LAMPORTS,
        outAmount: "2500000",
        routePlan: [{
          swapInfo: {
            label: "Meteora",
            ammKey: "market-address",
          },
        }],
      })
    },
    now: () => new Date("2026-09-17T02:31:00.000Z"),
  })

  const url = new URL(requestedUrl)
  assert.equal(result.status, "ROUTE_AVAILABLE")
  assert.equal(result.quote?.routeId, "jupiter:Meteora")
  assert.equal(result.quote?.outputAmountBaseUnits, "2500000")
  assert.equal(url.origin, "https://lite-api.jup.ag")
  assert.equal(url.pathname, "/swap/v1/quote")
  assert.equal(url.searchParams.get("inputMint"), WRAPPED_SOL_MINT)
  assert.equal(url.searchParams.get("outputMint"), MINT)
  assert.equal(
    url.searchParams.get("amount"),
    DEFAULT_DIAGNOSTIC_INPUT_LAMPORTS
  )
  assert.equal(url.searchParams.get("swapMode"), "ExactIn")
  assert.equal(requestedInit?.method, "GET")
  assert.equal(result.watchOnly, true)
  assert.equal(result.approvalGranted, false)
  assert.equal(result.transactionRequested, false)
})

test("supports a bounded configurable diagnostic size", async () => {
  let amount = ""
  const result = await validateMaxAttentionJupiterRoute({
    network: "solana",
    contractAddress: MINT,
    onchainValidation: onchain(),
    diagnosticInputLamports: "1000000",
    apiKey: "server-key",
    fetcher: async (url, init) => {
      amount = new URL(String(url)).searchParams.get("amount") ?? ""
      assert.equal(
        (init?.headers as Record<string, string>)["x-api-key"],
        "server-key"
      )
      return jsonResponse({
        inAmount: "1000000",
        outAmount: "100",
        routePlan: [],
      })
    },
  })

  assert.equal(result.status, "ROUTE_AVAILABLE")
  assert.equal(amount, "1000000")
  assert.equal(result.quote?.inputAmount, 0.001)
})

test("blocks before Jupiter when direct mint evidence is not verified", async () => {
  let called = false
  const result = await validateMaxAttentionJupiterRoute({
    network: "solana",
    contractAddress: MINT,
    onchainValidation: onchain({
      status: "INCOMPLETE",
      consistency: "NOT_CHECKED",
    }),
    fetcher: async () => {
      called = true
      throw new Error("must not call Jupiter")
    },
  })

  assert.equal(result.status, "BLOCKED")
  assert.equal(called, false)
  assert.deepEqual(result.blockingReasons, [
    "JUPITER_ROUTE_ONCHAIN_EVIDENCE_NOT_VERIFIED",
  ])
})

test("blocks mismatched identity and unsafe diagnostic amounts", async () => {
  let called = false
  const fetcher = async () => {
    called = true
    throw new Error("must not call Jupiter")
  }

  const mismatch = await validateMaxAttentionJupiterRoute({
    network: "solana",
    contractAddress: MINT,
    onchainValidation: onchain({
      mintAddress: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    }),
    fetcher,
  })
  const oversized = await validateMaxAttentionJupiterRoute({
    network: "solana",
    contractAddress: MINT,
    onchainValidation: onchain(),
    diagnosticInputLamports: "1000000001",
    fetcher,
  })
  const wrappedSol = await validateMaxAttentionJupiterRoute({
    network: "solana",
    contractAddress: WRAPPED_SOL_MINT,
    onchainValidation: onchain({ mintAddress: WRAPPED_SOL_MINT }),
    fetcher,
  })

  assert.equal(mismatch.status, "BLOCKED")
  assert.equal(oversized.status, "BLOCKED")
  assert.equal(wrappedSol.status, "BLOCKED")
  assert.equal(called, false)
})

test("records provider failures as unavailable without execution claims", async () => {
  const result = await validateMaxAttentionJupiterRoute({
    network: "solana",
    contractAddress: MINT,
    onchainValidation: onchain(),
    fetcher: async () => jsonResponse({}, 429),
  })

  assert.equal(result.status, "UNAVAILABLE")
  assert.equal(result.quote, null)
  assert.deepEqual(result.blockingReasons, [
    "JUPITER_READ_ONLY_QUOTE_UNAVAILABLE",
  ])
  assert.ok(
    result.caveats.includes(
      "PONDOX_EXECUTION_COSTS_ARE_NOT_INCLUDED"
    )
  )
  assert.equal(result.transactionRequested, false)
})
