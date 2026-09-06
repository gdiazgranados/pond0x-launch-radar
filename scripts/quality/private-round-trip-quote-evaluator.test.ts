import test from "node:test"
import assert from "node:assert/strict"
import {
  evaluateJupiterRoundTrip,
  evaluateZeroXRoundTrip,
} from "../../src/private-alpha/round-trip-quote-evaluator"
import type {
  JupiterQuoteRequest,
  ReadOnlyQuoteLeg,
  ZeroXPriceRequest,
} from "../../src/private-alpha/read-only-quote-clients"

function leg(
  inputAmountBaseUnits: string,
  outputAmountBaseUnits: string,
  inputAmount: number,
  outputAmount: number,
  routeId: string
): ReadOnlyQuoteLeg {
  return {
    routeId,
    inputAmountBaseUnits,
    outputAmountBaseUnits,
    inputAmount,
    outputAmount,
    estimatedFeeUsd: 0.1,
  }
}

test("Jupiter sells the exact raw amount returned by the buy quote", async () => {
  const requests: JupiterQuoteRequest[] = []
  const reader = async (request: JupiterQuoteRequest) => {
    requests.push(request)
    return requests.length === 1
      ? leg("100000000", "500000000000", 100, 500, "jupiter:buy")
      : leg("500000000000", "95000000", 500, 95, "jupiter:sell")
  }

  const observation = await evaluateJupiterRoundTrip(
    {
      tokenId: "PAPER",
      chain: "SOLANA",
      observedAt: "2026-09-06T12:00:00Z",
      referencePairAddress: "paper-pair",
      requestedNotionalUsd: 100,
      referencePriceUsd: 0.2,
      quoteTokenPriceUsd: 1,
      quoteToken: "USDC-mint",
      targetToken: "PAPER-mint",
      quoteAmountBaseUnits: "100000000",
      quoteDecimals: 6,
      targetDecimals: 9,
      buyEstimatedFeeUsd: 0.1,
      sellEstimatedFeeUsd: 0.1,
    },
    reader
  )

  assert.equal(requests.length, 2)
  assert.equal(
    requests[1].inputAmountBaseUnits,
    "500000000000"
  )
  assert.equal(observation.status, "MEASURED")
  assert.equal(observation.estimatedRoundTripLossPct, 5)
  assert.equal(observation.buyRouteId, "jupiter:buy")
  assert.equal(observation.sellRouteId, "jupiter:sell")
})

test("0x converts native quote amounts to USD and preserves raw tokens", async () => {
  const requests: ZeroXPriceRequest[] = []
  const reader = async (request: ZeroXPriceRequest) => {
    requests.push(request)
    return requests.length === 1
      ? leg(
          "40000000000000000",
          "1000000000000000000",
          0.04,
          1,
          "0x:buy"
        )
      : leg(
          "1000000000000000000",
          "38000000000000000",
          1,
          0.038,
          "0x:sell"
        )
  }

  const observation = await evaluateZeroXRoundTrip(
    {
      tokenId: "PORK",
      chain: "ETHEREUM",
      observedAt: "2026-09-06T12:00:00Z",
      referencePairAddress: "0xpair",
      requestedNotionalUsd: 100,
      referencePriceUsd: 100,
      quoteTokenPriceUsd: 2500,
      quoteToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      targetToken: "0x1111111111111111111111111111111111111111",
      quoteAmountBaseUnits: "40000000000000000",
      quoteDecimals: 18,
      targetDecimals: 18,
      buyEstimatedFeeUsd: 0.1,
      sellEstimatedFeeUsd: 0.1,
      apiKey: "server-only-key",
      takerAddress: "0x0000000000000000000000000000000000000001",
      nativeTokenPriceUsd: 2500,
    },
    reader
  )

  assert.equal(
    requests[1].inputAmountBaseUnits,
    "1000000000000000000"
  )
  assert.equal(observation.status, "MEASURED")
  assert.equal(observation.effectiveEntryPriceUsd, 100)
  assert.equal(observation.effectiveExitPriceUsd, 95)
  assert.equal(observation.estimatedRoundTripLossPct, 5)
})

test("a failed buy closes evaluation without requesting a sell", async () => {
  let calls = 0
  const reader = async () => {
    calls += 1
    throw new Error("provider unavailable")
  }

  const observation = await evaluateJupiterRoundTrip(
    {
      tokenId: "wPOND",
      chain: "SOLANA",
      observedAt: "2026-09-06T12:00:00Z",
      referencePairAddress: "wpond-pair",
      requestedNotionalUsd: 50,
      referencePriceUsd: 0.1,
      quoteTokenPriceUsd: 1,
      quoteToken: "USDC-mint",
      targetToken: "wPOND-mint",
      quoteAmountBaseUnits: "50000000",
      quoteDecimals: 6,
      targetDecimals: 9,
      buyEstimatedFeeUsd: 0,
      sellEstimatedFeeUsd: 0,
    },
    reader
  )

  assert.equal(calls, 1)
  assert.equal(observation.status, "UNAVAILABLE")
  assert.deepEqual(observation.blockingReasons, [
    "BUY_QUOTE_UNAVAILABLE",
    "SELL_QUOTE_UNAVAILABLE",
  ])
})

test("a failed sell preserves the buy route but remains unavailable", async () => {
  let calls = 0
  const reader = async () => {
    calls += 1
    if (calls === 1) {
      return leg(
        "50000000",
        "250000000000",
        50,
        250,
        "jupiter:buy"
      )
    }
    throw new Error("sell unavailable")
  }

  const observation = await evaluateJupiterRoundTrip(
    {
      tokenId: "PAPER",
      chain: "SOLANA",
      observedAt: "2026-09-06T12:00:00Z",
      referencePairAddress: "paper-pair",
      requestedNotionalUsd: 50,
      referencePriceUsd: 0.2,
      quoteTokenPriceUsd: 1,
      quoteToken: "USDC-mint",
      targetToken: "PAPER-mint",
      quoteAmountBaseUnits: "50000000",
      quoteDecimals: 6,
      targetDecimals: 9,
      buyEstimatedFeeUsd: 0,
      sellEstimatedFeeUsd: 0,
    },
    reader
  )

  assert.equal(calls, 2)
  assert.equal(observation.status, "UNAVAILABLE")
  assert.equal(observation.buyRouteId, "jupiter:buy")
  assert.deepEqual(observation.blockingReasons, [
    "SELL_QUOTE_UNAVAILABLE",
  ])
})
