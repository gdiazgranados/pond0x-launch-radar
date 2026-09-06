import test from "node:test"
import assert from "node:assert/strict"
import { buildSizeAwareQuote } from "../../src/private-alpha/size-aware-quote"

function input() {
  return {
    tokenId: "PAPER" as const,
    chain: "SOLANA" as const,
    observedAt: "2026-09-06T01:00:00Z",
    referencePairAddress: "pair-1",
    requestedNotionalUsd: 100,
    referencePriceUsd: 1,
    buy: {
      routeId: "buy-route",
      inputAmount: 100,
      outputAmount: 90,
      estimatedFeeUsd: 1,
    },
    sell: {
      routeId: "sell-route",
      inputAmount: 90,
      outputAmount: 81,
      estimatedFeeUsd: 0.5,
    },
  }
}

test("normalizes a complete hypothetical round-trip quote", () => {
  const quote = buildSizeAwareQuote(input())

  assert.equal(quote.status, "MEASURED")
  assert.ok(
    Math.abs(quote.effectiveEntryPriceUsd! - 100 / 90) < 1e-9
  )
  assert.equal(quote.effectiveExitPriceUsd, 0.9)
  assert.ok(
    Math.abs(quote.estimatedEntryPriceImpactPct! - 100 / 9) <
      1e-9
  )
  assert.ok(
    Math.abs(quote.estimatedExitPriceImpactPct! - 10) < 1e-9
  )
  assert.equal(quote.estimatedRoundTripLossPct, 19)
  assert.equal(quote.estimatedFeesUsd, 1.5)
  assert.deepEqual(quote.blockingReasons, [])
})

test("keeps missing quote legs explicitly unavailable", () => {
  const quote = buildSizeAwareQuote({
    ...input(),
    buy: null,
    sell: null,
  })

  assert.equal(quote.status, "UNAVAILABLE")
  assert.deepEqual(quote.blockingReasons, [
    "BUY_QUOTE_UNAVAILABLE",
    "SELL_QUOTE_UNAVAILABLE",
  ])
  assert.equal(quote.estimatedEntryPriceImpactPct, null)
})

test("rejects a sell quote for a different token amount", () => {
  const value = input()
  value.sell.inputAmount = 80

  const quote = buildSizeAwareQuote(value)

  assert.equal(quote.status, "UNAVAILABLE")
  assert.ok(
    quote.blockingReasons.includes(
      "ROUND_TRIP_TOKEN_AMOUNT_MISMATCH"
    )
  )
})

test("pins token-chain identity and validates quote invariants", () => {
  const quote = buildSizeAwareQuote({
    ...input(),
    chain: "ETHEREUM",
  })

  assert.equal(quote.status, "UNAVAILABLE")
  assert.equal(quote.chain, "SOLANA")
  assert.ok(
    quote.blockingReasons.includes("TOKEN_CHAIN_MISMATCH")
  )
  assert.throws(
    () =>
      buildSizeAwareQuote({
        ...input(),
        requestedNotionalUsd: 0,
      }),
    /requestedNotionalUsd/
  )
})
