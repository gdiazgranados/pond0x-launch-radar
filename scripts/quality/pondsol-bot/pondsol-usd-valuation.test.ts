import assert from "node:assert/strict"
import test from "node:test"

import {
  valuePondsolRoundTripUsd,
} from "../../../src/private-alpha/pondsol-bot/pondsol-usd-valuation"
import type {
  PondsolRoundTripObservation,
} from "../../../src/private-alpha/pondsol-bot/jupiter-pondsol-roundtrip"

const NOW = 1_800_000_000_000
const POOL = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"

function observation(): PondsolRoundTripObservation {
  return {
    entry: {
      direction: "WSOL_TO_PONDSOL",
      quote: {
        routeId: "jupiter:buy",
        venueIds: [POOL],
        inputAmountBaseUnits: "10000000",
        outputAmountBaseUnits: "6388167",
        inputAmount: 0.01,
        outputAmount: 0.006388167,
        estimatedFeeUsd: 0,
      },
      poolIds: [POOL],
      tradeAllowed: false,
      mode: "SIMULATION",
    },
    exit: {
      direction: "PONDSOL_TO_WSOL",
      quote: {
        routeId: "jupiter:sell",
        venueIds: [POOL],
        inputAmountBaseUnits: "6388167",
        outputAmountBaseUnits: "9800000",
        inputAmount: 0.006388167,
        outputAmount: 0.0098,
        estimatedFeeUsd: 0,
      },
      poolIds: [POOL],
      tradeAllowed: false,
      mode: "SIMULATION",
    },
    liquidityClassification: "SAME_LIQUIDITY",
    grossPnlWsol: -0.0002,
    grossPnlPct: -2,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}

function validInput() {
  return {
    observation: observation(),
    solPriceUsd: 200,
    priceObservedAtMs: NOW - 2000,
    entryQuotedAtMs: NOW - 1500,
    exitQuotedAtMs: NOW - 1000,
    nowMs: NOW,
    entryFeeUsd: 0.01,
    exitFeeUsd: 0.01,
    networkCostUsd: 0.01,
  }
}

test("converts WSOL legs into USD without trading", () => {
  const result = valuePondsolRoundTripUsd(validInput())

  assert.equal(result.entry.inputAmount, 2)
  assert.equal(result.exit.outputAmount, 1.96)
  assert.equal(result.entry.outputAmount, result.exit.inputAmount)
  assert.equal(result.tradeAllowed, false)
})

test("rejects missing or invalid SOL price", () => {
  assert.throws(
    () => valuePondsolRoundTripUsd({
      ...validInput(),
      solPriceUsd: 0,
    }),
    /INVALID_USD_VALUATION_CONTEXT/
  )
})

test("rejects stale price", () => {
  assert.throws(
    () => valuePondsolRoundTripUsd({
      ...validInput(),
      priceObservedAtMs: NOW - 31000,
    }),
    /STALE_OR_INVALID_VALUATION_TIMESTAMP/
  )
})

test("rejects stale exit quote", () => {
  assert.throws(
    () => valuePondsolRoundTripUsd({
      ...validInput(),
      exitQuotedAtMs: NOW - 31000,
    }),
    /STALE_OR_INVALID_VALUATION_TIMESTAMP/
  )
})

test("rejects negative costs", () => {
  assert.throws(
    () => valuePondsolRoundTripUsd({
      ...validInput(),
      entryFeeUsd: -1,
    }),
    /INVALID_VALUATION_COST/
  )
})

test("rejects mismatched pondSOL amounts", () => {
  const input = validInput()
  input.observation.exit.quote.inputAmountBaseUnits = "1"

  assert.throws(
    () => valuePondsolRoundTripUsd(input),
    /PONDSOL_VALUATION_AMOUNT_MISMATCH/
  )
})

test("rejects inconsistent timestamps", () => {
  assert.throws(
    () => valuePondsolRoundTripUsd({
      ...validInput(),
      entryQuotedAtMs: NOW - 500,
      exitQuotedAtMs: NOW - 1000,
    }),
    /INCONSISTENT_VALUATION_TIMELINE/
  )
})
