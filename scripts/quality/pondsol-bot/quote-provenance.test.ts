import assert from "node:assert/strict"
import test from "node:test"

import {
  verifyQuoteProvenance,
} from "../../../src/private-alpha/pondsol-bot/quote-provenance"

const RAYDIUM = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const METEORA = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

const quote = {
  routeId: "jupiter:Raydium",
  inputAsset: "USD",
  outputAsset: "pondSOL",
  inputAmount: 10,
  outputAmount: 100,
  quotedAtMs: 1000,
  estimatedFeeUsd: 0.01,
}

test("matching reported pools pass consistency check", () => {
  const result = verifyQuoteProvenance({
    quote,
    reportedPoolIds: [RAYDIUM],
    expectedPoolIds: [RAYDIUM],
  })

  assert.equal(result.verified, true)
  assert.equal(result.tradeAllowed, false)
})

test("mismatched pools are rejected", () => {
  const result = verifyQuoteProvenance({
    quote,
    reportedPoolIds: [RAYDIUM],
    expectedPoolIds: [METEORA],
  })

  assert.equal(result.verified, false)
  assert.ok(result.reasons.includes("POOL_PROVENANCE_MISMATCH"))
})

test("missing pool identifiers are rejected", () => {
  const result = verifyQuoteProvenance({
    quote,
    reportedPoolIds: [],
    expectedPoolIds: [RAYDIUM],
  })

  assert.equal(result.verified, false)
})

test("multi-hop routes require exact pool-set matching", () => {
  const result = verifyQuoteProvenance({
    quote,
    reportedPoolIds: [RAYDIUM, METEORA],
    expectedPoolIds: [RAYDIUM],
  })

  assert.equal(result.verified, false)
})

test("pool ordering does not affect consistency", () => {
  const result = verifyQuoteProvenance({
    quote,
    reportedPoolIds: [RAYDIUM, METEORA],
    expectedPoolIds: [METEORA, RAYDIUM],
  })

  assert.equal(result.verified, true)
})

test("duplicate pool identifiers are rejected", () => {
  const result = verifyQuoteProvenance({
    quote,
    reportedPoolIds: [RAYDIUM, RAYDIUM],
    expectedPoolIds: [RAYDIUM],
  })

  assert.equal(result.verified, false)
})

test("invalid quote identity is rejected", () => {
  const result = verifyQuoteProvenance({
    quote: { ...quote, routeId: "" },
    reportedPoolIds: [RAYDIUM],
    expectedPoolIds: [RAYDIUM],
  })

  assert.equal(result.verified, false)
})
