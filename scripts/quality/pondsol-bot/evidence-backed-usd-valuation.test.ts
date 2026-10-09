import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateEvidenceBackedUsdValuation,
} from "../../../src/private-alpha/pondsol-bot/evidence-backed-usd-valuation"

import type {
  TimedPondsolRoundTrip,
} from "../../../src/private-alpha/pondsol-bot/timed-pondsol-roundtrip"

import type {
  PondsolMarketEvidence,
} from "../../../src/private-alpha/pondsol-bot/market-evidence-validator"

const NOW = 1_800_000_000_000

const POOL_A =
  "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"

const POOL_B =
  "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

function cycle(): TimedPondsolRoundTrip {
  return {
    entry: {
      observation: {
        direction: "WSOL_TO_PONDSOL",
        quote: {
          routeId: "jupiter:synthetic-entry",
          venueIds: [POOL_A],
          inputAmountBaseUnits: "10000000",
          outputAmountBaseUnits: "6388167",
          inputAmount: 0.01,
          outputAmount: 0.006388167,
          estimatedFeeUsd: 0,
        },
        poolIds: [POOL_A],
        tradeAllowed: false,
        mode: "SIMULATION",
      },
      requestStartedAtMs: NOW - 4000,
      responseReceivedAtMs: NOW - 3000,
      durationMs: 1000,
      tradeAllowed: false,
      mode: "SIMULATION",
    },
    exit: {
      observation: {
        direction: "PONDSOL_TO_WSOL",
        quote: {
          routeId: "jupiter:synthetic-exit",
          venueIds: [POOL_B],
          inputAmountBaseUnits: "6388167",
          outputAmountBaseUnits: "9800000",
          inputAmount: 0.006388167,
          outputAmount: 0.0098,
          estimatedFeeUsd: 0,
        },
        poolIds: [POOL_B],
        tradeAllowed: false,
        mode: "SIMULATION",
      },
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

function evidence(): PondsolMarketEvidence {
  const item = (
    value: number,
    status: "OBSERVED" | "ESTIMATED" = "ESTIMATED"
  ) => ({
    value,
    source: "synthetic-test",
    observedAtMs: NOW - 3500,
    status,
  })

  return {
    solPriceUsd: item(200, "OBSERVED"),
    entryFeeUsd: item(0.01),
    exitFeeUsd: item(0.01),
    networkCostUsd: item(0.01),
  }
}

test("returns informational valuation without authorizing trades", () => {
  const result = evaluateEvidenceBackedUsdValuation({
    cycle: cycle(),
    evidence: evidence(),
    nowMs: NOW,
  })

  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.evidenceVerified, false)
  assert.ok(result.valuation)
  assert.equal(result.valuation?.entry.inputAmount, 2)
  assert.equal(result.valuation?.exit.outputAmount, 1.96)
})

test("missing price blocks valuation", () => {
  const data = evidence()
  data.solPriceUsd.status = "MISSING"

  const result = evaluateEvidenceBackedUsdValuation({
    cycle: cycle(),
    evidence: data,
    nowMs: NOW,
  })

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("SOL_PRICE_MISSING"))
})

test("stale costs block valuation", () => {
  const data = evidence()
  data.networkCostUsd.observedAtMs = NOW - 31000

  const result = evaluateEvidenceBackedUsdValuation({
    cycle: cycle(),
    evidence: data,
    nowMs: NOW,
  })

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("NETWORK_COST_STALE"))
})

test("shared liquidity blocks valuation", () => {
  const data = cycle()
  data.liquidityClassification = "SAME_LIQUIDITY"

  const result = evaluateEvidenceBackedUsdValuation({
    cycle: data,
    evidence: evidence(),
    nowMs: NOW,
  })

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("CYCLE_NOT_ELIGIBLE"))
})

test("price observed after exit quote blocks valuation", () => {
  const data = evidence()
  data.solPriceUsd.observedAtMs = NOW - 1000

  const result = evaluateEvidenceBackedUsdValuation({
    cycle: cycle(),
    evidence: data,
    nowMs: NOW,
  })

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("PRICE_AFTER_EXIT_QUOTE"))
})

test("cost evidence after exit quote blocks valuation", () => {
  const data = evidence()
  data.entryFeeUsd.observedAtMs = NOW - 1000

  const result = evaluateEvidenceBackedUsdValuation({
    cycle: cycle(),
    evidence: data,
    nowMs: NOW,
  })

  assert.equal(result.valuation, null)
  assert.ok(
    result.reasons.includes("COST_EVIDENCE_AFTER_EXIT_QUOTE")
  )
})

test("invalid cycle timestamps block valuation", () => {
  const data = cycle()
  data.exit.responseReceivedAtMs = NOW - 5000

  const result = evaluateEvidenceBackedUsdValuation({
    cycle: data,
    evidence: evidence(),
    nowMs: NOW,
  })

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("INVALID_CYCLE_TIMELINE"))
})

test("negative fees block valuation", () => {
  const data = evidence()
  data.exitFeeUsd.value = -0.01

  const result = evaluateEvidenceBackedUsdValuation({
    cycle: cycle(),
    evidence: data,
    nowMs: NOW,
  })

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("EXIT_FEE_INVALID_VALUE"))
})
