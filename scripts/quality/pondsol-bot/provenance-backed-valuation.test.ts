import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateProvenanceBackedValuation,
  type ProvenanceValuationInput,
} from "../../../src/private-alpha/pondsol-bot/provenance-backed-valuation"

const NOW = 1_800_000_000_000
const A = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const B = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

function fixture(): ProvenanceValuationInput {
  const entryQuote = {
    routeId: "jupiter:synthetic-entry",
    venueIds: [A],
    inputAmountBaseUnits: "10000000",
    outputAmountBaseUnits: "6388167",
    inputAmount: 0.01,
    outputAmount: 0.006388167,
    estimatedFeeUsd: 0,
  }
  const exitQuote = {
    routeId: "jupiter:synthetic-exit",
    venueIds: [B],
    inputAmountBaseUnits: "6388167",
    outputAmountBaseUnits: "9800000",
    inputAmount: 0.006388167,
    outputAmount: 0.0098,
    estimatedFeeUsd: 0,
  }

  const cost = (
    category: ProvenanceValuationInput["costs"][number]["category"],
    valueUsd: number,
    coverage: ProvenanceValuationInput["costs"][number]["coverage"]
  ) => ({
    category,
    valueUsd,
    coverage,
    source: "synthetic-test",
    observedAtMs: NOW - 3500,
    status: "ESTIMATED" as const,
  })

  return {
    cycle: {
      entry: {
        observation: {
          direction: "WSOL_TO_PONDSOL",
          quote: entryQuote,
          poolIds: [A],
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
          quote: exitQuote,
          poolIds: [B],
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
    },
    solPriceUsd: {
      value: 200,
      source: "synthetic-sol-price",
      observedAtMs: NOW - 3500,
      status: "ESTIMATED",
    },
    costs: [
      cost("ENTRY_SWAP", 0.02, "INCLUDED_IN_QUOTE"),
      cost("EXIT_SWAP", 0.03, "INCLUDED_IN_QUOTE"),
      cost("NETWORK", 0.01, "ADDITIONAL_COST"),
      cost("PRIORITY", 0.02, "ADDITIONAL_COST"),
      cost("RENT", 0, "ADDITIONAL_COST"),
    ],
    additionalCostsDisjoint: true,
    nowMs: NOW,
  }
}

test("integrates additional costs without double-counting", () => {
  const result = evaluateProvenanceBackedValuation(fixture())

  assert.ok(result.valuation)
  assert.equal(result.valuation?.entry.estimatedFeeUsd, 0)
  assert.equal(result.valuation?.exit.estimatedFeeUsd, 0)
  assert.equal(result.valuation?.networkCostUsd, 0.03)
  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.costsIndependentlyVerified, false)
})

test("blocks unresolved overlapping costs", () => {
  const input = fixture()
  input.additionalCostsDisjoint = false

  const result = evaluateProvenanceBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes(
    "ADDITIONAL_COST_OVERLAP_UNRESOLVED"
  ))
})

test("blocks missing cost evidence", () => {
  const input = fixture()
  input.costs = input.costs.filter(x => x.category !== "PRIORITY")

  const result = evaluateProvenanceBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("PRIORITY_NOT_PROVIDED"))
})

test("blocks duplicate cost categories", () => {
  const input = fixture()
  input.costs = [...input.costs, input.costs[2]]

  const result = evaluateProvenanceBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("DUPLICATE_NETWORK"))
})

test("blocks costs observed after the exit quote", () => {
  const input = fixture()
  input.costs[2].observedAtMs = NOW - 1000

  const result = evaluateProvenanceBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes(
    "COST_EVIDENCE_AFTER_EXIT_QUOTE"
  ))
})

test("blocks shared liquidity", () => {
  const input = fixture()
  input.cycle.liquidityClassification = "SAME_LIQUIDITY"

  const result = evaluateProvenanceBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("CYCLE_NOT_ELIGIBLE"))
})

test("never authorizes trades for positive synthetic round trips", () => {
  const input = fixture()
  input.cycle.exit.observation.quote.outputAmountBaseUnits = "11000000"
  input.cycle.exit.observation.quote.outputAmount = 0.011

  const result = evaluateProvenanceBackedValuation(input)

  assert.ok(result.valuation)
  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.evidenceVerified, false)
})
