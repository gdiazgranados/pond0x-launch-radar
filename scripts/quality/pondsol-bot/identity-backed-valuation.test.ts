import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateIdentityBackedValuation,
  type IdentityBackedValuationInput,
} from "../../../src/private-alpha/pondsol-bot/identity-backed-valuation"

const NOW = 1_800_000_000_000

const A = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const B = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

const ENTRY = "jupiter:synthetic-entry"
const EXIT = "jupiter:synthetic-exit"

function fixture(): IdentityBackedValuationInput {
  const categories = [
    "ENTRY_SWAP",
    "EXIT_SWAP",
    "NETWORK",
    "PRIORITY",
    "RENT",
  ] as const

  const coverages = [
    "INCLUDED_IN_QUOTE",
    "INCLUDED_IN_QUOTE",
    "ADDITIONAL_COST",
    "ADDITIONAL_COST",
    "ADDITIONAL_COST",
  ] as const

  const amounts = [0.02, 0.03, 0.01, 0.02, 0]

  const costs = categories.map((category, i) => ({
    category,
    valueUsd: amounts[i],
    source: `synthetic-source-${i}`,
    observedAtMs: NOW - 3500,
    status: "ESTIMATED" as const,
    coverage: coverages[i],
  }))

  const identities = categories.map((category, i) => ({
    category,
    chargeId: `charge-${i}`,
    componentIds: [`component-${i}`],
    source: `synthetic-source-${i}`,
    coverage: coverages[i],
    quoteRouteId:
      i === 0 ? ENTRY :
      i === 1 ? EXIT : null,
  }))

  return {
    cycle: {
      entry: {
        observation: {
          direction: "WSOL_TO_PONDSOL",
          quote: {
            routeId: ENTRY,
            venueIds: [A],
            inputAmountBaseUnits: "10000000",
            outputAmountBaseUnits: "6388167",
            inputAmount: 0.01,
            outputAmount: 0.006388167,
            estimatedFeeUsd: 0,
          },
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
          quote: {
            routeId: EXIT,
            venueIds: [B],
            inputAmountBaseUnits: "6388167",
            outputAmountBaseUnits: "9800000",
            inputAmount: 0.006388167,
            outputAmount: 0.0098,
            estimatedFeeUsd: 0,
          },
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
    costs,
    identities,
    additionalCostsDisjoint: true,
    nowMs: NOW,
  }
}

test("integrates matching identities and cost evidence", () => {
  const result = evaluateIdentityBackedValuation(fixture())

  assert.ok(result.valuation)
  assert.equal(result.identityStructurallyConsistent, true)
  assert.equal(result.valuation?.networkCostUsd, 0.03)
  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.tradeAllowed, false)
})

test("rejects source mismatch", () => {
  const input = fixture()
  input.identities[2].source = "different-source"

  const result = evaluateIdentityBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes(
    "COST_IDENTITY_SOURCE_MISMATCH"
  ))
})

test("rejects coverage mismatch", () => {
  const input = fixture()
  input.identities[2].coverage = "INCLUDED_IN_QUOTE"

  const result = evaluateIdentityBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes(
    "COST_IDENTITY_COVERAGE_MISMATCH"
  ))
})

test("rejects overlapping cost components", () => {
  const input = fixture()
  input.identities[3].componentIds = ["component-2"]

  const result = evaluateIdentityBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes(
    "OVERLAPPING_COST_COMPONENT"
  ))
})

test("rejects incorrect entry route", () => {
  const input = fixture()
  input.identities[0].quoteRouteId = EXIT

  const result = evaluateIdentityBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("SWAP_ROUTE_MISMATCH"))
})

test("rejects missing identities", () => {
  const input = fixture()
  input.identities = input.identities.slice(0, 4)

  const result = evaluateIdentityBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes("MISSING_COST_CATEGORY"))
})

test("rejects unresolved additional-cost overlap", () => {
  const input = fixture()
  input.additionalCostsDisjoint = false

  const result = evaluateIdentityBackedValuation(input)

  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes(
    "ADDITIONAL_COST_OVERLAP_UNRESOLVED"
  ))
})

test("rejects stale cost evidence", () => {
  const input = fixture()
  input.costs[2].observedAtMs = NOW - 40000

  const result = evaluateIdentityBackedValuation(input)

  assert.equal(result.valuation, null)
})

test("rejects shared liquidity", () => {
  const input = fixture()
  input.cycle.liquidityClassification = "SAME_LIQUIDITY"

  const result = evaluateIdentityBackedValuation(input)

  assert.equal(result.valuation, null)
})

test("never authorizes trades on positive synthetic quotes", () => {
  const input = fixture()
  input.cycle.exit.observation.quote.outputAmountBaseUnits = "11000000"
  input.cycle.exit.observation.quote.outputAmount = 0.011

  const result = evaluateIdentityBackedValuation(input)

  assert.ok(result.valuation)
  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.evidenceVerified, false)
  assert.equal(result.identityIndependentlyVerified, false)
})
