import assert from "node:assert/strict"
import test from "node:test"

import {
  valueTimedPondsolRoundTripUsd,
} from "../../../src/private-alpha/pondsol-bot/timed-usd-valuation"
import type {
  TimedPondsolRoundTrip,
} from "../../../src/private-alpha/pondsol-bot/timed-pondsol-roundtrip"

const NOW = 1_800_000_000_000
const RAYDIUM = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const METEORA = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

function observation(
  direction: "WSOL_TO_PONDSOL" | "PONDSOL_TO_WSOL",
  inputRaw: string,
  outputRaw: string,
  pool: string
) {
  return {
    direction,
    quote: {
      routeId: "jupiter:synthetic",
      venueIds: [pool],
      inputAmountBaseUnits: inputRaw,
      outputAmountBaseUnits: outputRaw,
      inputAmount: Number(inputRaw) / 1e9,
      outputAmount: Number(outputRaw) / 1e9,
      estimatedFeeUsd: 0,
    },
    poolIds: [pool],
    tradeAllowed: false as const,
    mode: "SIMULATION" as const,
  }
}

function cycle(): TimedPondsolRoundTrip {
  return {
    entry: {
      observation: observation(
        "WSOL_TO_PONDSOL", "10000000", "6388167", RAYDIUM
      ),
      requestStartedAtMs: NOW - 4000,
      responseReceivedAtMs: NOW - 3000,
      durationMs: 1000,
      tradeAllowed: false,
      mode: "SIMULATION",
    },
    exit: {
      observation: observation(
        "PONDSOL_TO_WSOL", "6388167", "9800000", METEORA
      ),
      requestStartedAtMs: NOW - 2500,
      responseReceivedAtMs: NOW - 2000,
      durationMs: 500,
      tradeAllowed: false,
      mode: "SIMULATION",
    },
    liquidityClassification: "INDEPENDENT",
    cycleDurationMs: 2000,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}

function validInput() {
  return {
    cycle: cycle(),
    solPriceUsd: 200,
    priceObservedAtMs: NOW - 3500,
    nowMs: NOW,
    entryFeeUsd: 0.01,
    exitFeeUsd: 0.01,
    networkCostUsd: 0.01,
  }
}

test("uses recorded quote timestamps and remains unverified", () => {
  const result = valueTimedPondsolRoundTripUsd(validInput())

  assert.equal(result.entry.quotedAtMs, NOW - 3000)
  assert.equal(result.exit.quotedAtMs, NOW - 2000)
  assert.equal(result.entry.inputAmount, 2)
  assert.equal(result.exit.outputAmount, 1.96)
  assert.equal(result.priceAndCostsVerified, false)
  assert.equal(result.tradeAllowed, false)
})

test("rejects shared liquidity", () => {
  const input = validInput()
  input.cycle.liquidityClassification = "SAME_LIQUIDITY"

  assert.throws(
    () => valueTimedPondsolRoundTripUsd(input),
    /TIMED_USD_LIQUIDITY_UNVERIFIED/
  )
})

test("rejects stale recorded entry", () => {
  const input = validInput()
  input.cycle.entry.responseReceivedAtMs = NOW - 31000

  assert.throws(
    () => valueTimedPondsolRoundTripUsd(input),
    /STALE_OR_INVALID_VALUATION_TIMESTAMP/
  )
})

test("rejects missing price", () => {
  assert.throws(
    () => valueTimedPondsolRoundTripUsd({
      ...validInput(),
      solPriceUsd: 0,
    }),
    /INVALID_USD_VALUATION_CONTEXT/
  )
})

test("rejects unsafe raw amounts", () => {
  const input = validInput()
  input.cycle.entry.observation.quote.inputAmountBaseUnits =
    "9007199254740992"

  assert.throws(
    () => valueTimedPondsolRoundTripUsd(input),
    /UNSAFE_TIMED_USD_RAW_AMOUNTS/
  )
})
