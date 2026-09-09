import test from "node:test"
import assert from "node:assert/strict"
import type {
  JupiterQuoteRequest,
  ReadOnlyQuoteLeg,
} from "../../src/private-alpha/read-only-quote-clients"
import type { ShadowExecutionBasis } from "../../src/private-alpha/shadow-execution-basis"
import { observeWpondExactExit } from "../../src/private-alpha/wpond-exit-quote"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

function snapshot() {
  return {
    generatedAt: "2026-09-09T17:40:00Z",
    status: "PARTIAL",
    scoreNeutral: true,
    tokens: [{
      symbol: "wPOND",
      chain: "solana",
      address: WPOND_MINT,
      status: "OBSERVED",
      primaryMarket: {
        pairAddress: "raydium-pool",
        priceNative: 1e-9,
        priceUsd: 1e-7,
        quoteToken: {
          address: WRAPPED_SOL_MINT,
          symbol: "SOL",
        },
      },
    }],
  }
}

function basis(): ShadowExecutionBasis {
  return {
    positionId: "wpond-shadow-1",
    tokenId: "wPOND",
    chain: "SOLANA",
    observedAt: "2026-09-09T15:40:00Z",
    referencePairAddress: "raydium-pool",
    requestedNotionalUsd: 10,
    simulatedTokenUnits: 90_000_000,
    simulatedTokenAmountBaseUnits: "90000000000",
    tokenDecimals: 3,
    effectiveEntryPriceUsd: 10 / 90_000_000,
    estimatedEntryFeeUsd: 0.001,
    buyRouteId: "jupiter:Raydium CLMM",
    source: "EXECUTABLE_BUY_QUOTE",
  }
}

function exitLeg(
  venueIds: ReadonlyArray<string> = ["raydium-pool"]
): ReadOnlyQuoteLeg {
  return {
    routeId: "jupiter:Raydium CLMM",
    venueIds,
    inputAmountBaseUnits: "90000000000",
    outputAmountBaseUnits: "98000000",
    inputAmount: 90_000_000,
    outputAmount: 0.098,
    estimatedFeeUsd: 0.001,
  }
}

test("quotes the exact raw units stored in execution basis", async () => {
  let request: JupiterQuoteRequest | null = null
  const observation = await observeWpondExactExit(
    snapshot(),
    basis(),
    {
      observedAt: "2026-09-09T17:40:30Z",
      estimatedFeeLamports: 10_000,
    },
    async (value) => {
      request = value
      return exitLeg()
    }
  )

  assert.equal(request?.inputAmountBaseUnits, "90000000000")
  assert.equal(request?.inputToken, WPOND_MINT)
  assert.equal(request?.outputToken, WRAPPED_SOL_MINT)
  assert.equal(observation.status, "MEASURED")
  assert.equal(
    observation.entryTokenAmountBaseUnits,
    "90000000000"
  )
  assert.equal(observation.entryTokenDecimals, 3)
  assert.equal(observation.sellRouteId, "jupiter:Raydium CLMM")
})

test("blocks an exit routed outside the original pool", async () => {
  const observation = await observeWpondExactExit(
    snapshot(),
    basis(),
    {
      observedAt: "2026-09-09T17:40:30Z",
      estimatedFeeLamports: 10_000,
    },
    async () => exitLeg(["replacement-pool"])
  )

  assert.equal(observation.status, "UNAVAILABLE")
  assert.deepEqual(
    observation.blockingReasons,
    ["SELL_QUOTE_UNAVAILABLE"]
  )
})

test("fails before quoting when the primary pool changed", async () => {
  const changed = snapshot()
  changed.tokens[0].primaryMarket.pairAddress = "replacement-pool"
  let calls = 0

  await assert.rejects(
    observeWpondExactExit(
      changed,
      basis(),
      {
        observedAt: "2026-09-09T17:40:30Z",
        estimatedFeeLamports: 10_000,
      },
      async () => {
        calls += 1
        return exitLeg()
      }
    ),
    /execution basis pool is no longer primary/
  )
  assert.equal(calls, 0)
})
