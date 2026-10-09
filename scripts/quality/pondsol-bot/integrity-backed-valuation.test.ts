import assert from "node:assert/strict"
import test from "node:test"
import {
  evaluateIntegrityBackedValuation,
  type IntegrityBackedValuationInput,
} from "../../../src/private-alpha/pondsol-bot/integrity-backed-valuation"

const NOW = 1_800_000_000_000

const A = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const B = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

const ENTRY = "jupiter:synthetic-entry"
const EXIT = "jupiter:synthetic-exit"

function baseFixture(): Omit<IntegrityBackedValuationInput, "cycleId" | "boundEvidence"> {
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


function fixture(): IntegrityBackedValuationInput {
  const base = baseFixture()
  return {
    ...base,
    cycleId: "synthetic-cycle-001",
    boundEvidence: [
      { kind: "SOL_PRICE", cycleId: "synthetic-cycle-001", observedAtMs: NOW - 3500, routeId: null, source: "synthetic-sol-price" },
      ...base.costs.map((cost, i) => ({
        kind: cost.category,
        cycleId: "synthetic-cycle-001",
        observedAtMs: i === 0 ? NOW - 3500 : i === 1 ? NOW - 2200 : NOW - 2800,
        routeId: i === 0 ? ENTRY : i === 1 ? EXIT : null,
        source: cost.source ?? "",
      })),
    ],
    costs: base.costs.map((cost, i) => ({
      ...cost,
      observedAtMs: i === 0 ? NOW - 3500 : i === 1 ? NOW - 2200 : NOW - 2800,
    })),
  }
}

function checkBlocked(input: IntegrityBackedValuationInput, reason: string) {
  const result = evaluateIntegrityBackedValuation(input)
  assert.equal(result.valuation, null)
  assert.ok(result.reasons.includes(reason), JSON.stringify(result.reasons))
  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.mode, "SIMULATION")
  assert.equal(result.integrityIndependentlyVerified, false)
}

test("accepts matching synthetic bindings for informational valuation", () => {
  const result = evaluateIntegrityBackedValuation(fixture())
  assert.ok(result.valuation)
  assert.equal(result.integrityStructurallyConsistent, true)
  assert.equal(result.identityStructurallyConsistent, true)
  assert.equal(result.integrityIndependentlyVerified, false)
  assert.equal(result.evidenceVerified, false)
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.decision, "NO_TRADE")
})

test("rejects mixed cycle identities", () => {
  const x = fixture()
  x.boundEvidence[2].cycleId = "another-cycle"
  checkBlocked(x, "CROSS_CYCLE_EVIDENCE")
})

test("rejects mismatched SOL price source", () => {
  const x = fixture()
  x.solPriceUsd.source = "different-price-feed"
  checkBlocked(x, "SOL_PRICE_BINDING_MISMATCH")
})

test("rejects mismatched SOL price timestamp", () => {
  const x = fixture()
  x.solPriceUsd.observedAtMs = NOW - 3400
  checkBlocked(x, "SOL_PRICE_BINDING_MISMATCH")
})

test("rejects mismatched cost source", () => {
  const x = fixture()
  x.costs[2].source = "different-cost-feed"
  checkBlocked(x, "NETWORK_BINDING_MISMATCH")
})

test("rejects mismatched cost timestamp", () => {
  const x = fixture()
  x.costs[3].observedAtMs = NOW - 2700
  checkBlocked(x, "PRIORITY_BINDING_MISMATCH")
})

test("rejects duplicate cost categories", () => {
  const x = fixture()
  x.costs = [...x.costs, { ...x.costs[0] }]
  checkBlocked(x, "COST_BINDING_COUNT_MISMATCH")
})

test("rejects missing cost categories", () => {
  const x = fixture()
  x.costs = x.costs.slice(0, -1)
  checkBlocked(x, "COST_BINDING_COUNT_MISMATCH")
})

test("rejects wrong entry route binding", () => {
  const x = fixture()
  x.boundEvidence[1].routeId = EXIT
  checkBlocked(x, "ENTRY_ROUTE_MISMATCH")
})

test("rejects mismatch between bound route and cost identity", () => {
  const x = fixture()
  x.identities[2].quoteRouteId = ENTRY
  checkBlocked(x, "NETWORK_IDENTITY_ROUTE_MISMATCH")
})

test("rejects overlapping cost component identities", () => {
  const x = fixture()
  x.identities[3].componentIds = ["component-2"]
  checkBlocked(x, "OVERLAPPING_COST_COMPONENT")
})

test("rejects unproven additional-cost disjointness", () => {
  const x = fixture()
  x.additionalCostsDisjoint = false
  checkBlocked(x, "ADDITIONAL_COST_OVERLAP_UNRESOLVED")
})

test("rejects evidence outside the entry quote window", () => {
  const x = fixture()
  x.boundEvidence[1].observedAtMs = NOW - 2200
  checkBlocked(x, "ENTRY_EVIDENCE_OUTSIDE_LEG")
})

test("rejects overlapping liquidity pools", () => {
  const x = fixture()
  x.cycle.exit.observation.poolIds = [A]
  checkBlocked(x, "LIQUIDITY_NOT_STRUCTURALLY_INDEPENDENT")
})

test("rejects stale roundtrip", () => {
  const x = fixture()
  x.nowMs = NOW + 40000
  checkBlocked(x, "INVALID_CYCLE_TIMELINE")
})

test("positive synthetic valuation never authorizes execution", () => {
  const x = fixture()
  x.cycle.exit.observation.quote.outputAmountBaseUnits = "11000000"
  x.cycle.exit.observation.quote.outputAmount = 0.011
  const result = evaluateIntegrityBackedValuation(x)
  assert.ok(result.valuation)
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.mode, "SIMULATION")
  assert.equal(result.integrityIndependentlyVerified, false)
})
