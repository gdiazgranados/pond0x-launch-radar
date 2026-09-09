import test from "node:test"
import assert from "node:assert/strict"
import {
  buildWpondRoundTripRequest,
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

function snapshot() {
  return {
    generatedAt: "2026-09-09T14:33:08.415Z",
    status: "PARTIAL",
    scoreNeutral: true,
    tokens: [{
      symbol: "wPOND",
      chain: "solana",
      address: WPOND_MINT,
      status: "OBSERVED",
      primaryMarket: {
        pairAddress: "wpond-raydium-pair",
        priceNative: 1.052e-9,
        priceUsd: 1.09e-7,
        liquidityUsd: 52_729.9,
        volume: { h24: 18_010.54 },
        quoteToken: {
          address: WRAPPED_SOL_MINT,
          symbol: "SOL",
        },
      },
    }],
  }
}

test("builds a $10 wPOND quote using verified three-decimal units", () => {
  const request = buildWpondRoundTripRequest(snapshot(), {
    observedAt: "2026-09-09T14:34:00Z",
    requestedNotionalUsd: 10,
    targetDecimals: 3,
    estimatedFeeLamportsPerLeg: 10_000,
  })

  assert.equal(request.tokenId, "wPOND")
  assert.equal(request.targetDecimals, 3)
  assert.equal(request.quoteDecimals, 9)
  assert.equal(request.referencePairAddress, "wpond-raydium-pair")
  assert.equal(request.targetToken, WPOND_MINT)
  assert.equal(request.quoteToken, WRAPPED_SOL_MINT)
  assert.ok(BigInt(request.quoteAmountBaseUnits) > 0n)
  assert.ok(Math.abs(
    Number(request.quoteAmountBaseUnits) / 1e9 *
      request.quoteTokenPriceUsd - 10
  ) < 0.000001)
})

test("fails closed when on-chain wPOND decimals change", () => {
  assert.throws(
    () => buildWpondRoundTripRequest(snapshot(), {
      observedAt: "2026-09-09T14:34:00Z",
      requestedNotionalUsd: 10,
      targetDecimals: 9,
      estimatedFeeLamportsPerLeg: 10_000,
    }),
    /unexpected on-chain wPOND decimals/
  )
})
