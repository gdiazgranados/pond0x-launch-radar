import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateCostProvenance,
  type CostEvidence,
} from "../../../src/private-alpha/pondsol-bot/cost-provenance-guard"

const NOW = 1_800_000_000_000

function evidence(): CostEvidence[] {
  const item = (
    category: CostEvidence["category"],
    valueUsd: number,
    coverage: CostEvidence["coverage"]
  ): CostEvidence => ({
    category,
    valueUsd,
    source: "synthetic-test",
    observedAtMs: NOW - 1000,
    status: "ESTIMATED",
    coverage,
  })

  return [
    item("ENTRY_SWAP", 0.02, "INCLUDED_IN_QUOTE"),
    item("EXIT_SWAP", 0.03, "INCLUDED_IN_QUOTE"),
    item("NETWORK", 0.01, "ADDITIONAL_COST"),
    item("PRIORITY", 0.02, "ADDITIONAL_COST"),
    item("RENT", 0, "ADDITIONAL_COST"),
  ]
}

test("does not double-count included swap fees", () => {
  const result = evaluateCostProvenance(evidence(), NOW)

  assert.equal(result.usableForInformationalValuation, true)
  assert.equal(result.additionalCostUsd, 0.03)
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.independentlyVerified, false)
  assert.equal(result.decision, "NO_TRADE")
})

test("missing network cost blocks valuation", () => {
  const data = evidence().filter(
    item => item.category !== "NETWORK"
  )

  const result = evaluateCostProvenance(data, NOW)

  assert.equal(result.additionalCostUsd, null)
  assert.ok(result.reasons.includes("NETWORK_NOT_PROVIDED"))
})

test("unknown fee coverage blocks valuation", () => {
  const data = evidence()
  data[0].coverage = "UNKNOWN"

  const result = evaluateCostProvenance(data, NOW)

  assert.equal(result.usableForInformationalValuation, false)
  assert.ok(result.reasons.includes("ENTRY_SWAP_UNKNOWN_COVERAGE"))
})

test("duplicate cost category blocks valuation", () => {
  const data = evidence()
  data.push({ ...data[2] })

  const result = evaluateCostProvenance(data, NOW)

  assert.equal(result.additionalCostUsd, null)
  assert.ok(result.reasons.includes("DUPLICATE_NETWORK"))
})

test("stale evidence blocks valuation", () => {
  const data = evidence()
  data[3].observedAtMs = NOW - 31_000

  const result = evaluateCostProvenance(data, NOW)

  assert.equal(result.additionalCostUsd, null)
  assert.ok(
    result.reasons.includes("PRIORITY_STALE_OR_INVALID_TIME")
  )
})

test("unidentified source blocks valuation", () => {
  const data = evidence()
  data[2].source = ""

  const result = evaluateCostProvenance(data, NOW)

  assert.equal(result.additionalCostUsd, null)
  assert.ok(result.reasons.includes("NETWORK_UNKNOWN_SOURCE"))
})

test("negative fees block valuation", () => {
  const data = evidence()
  data[2].valueUsd = -0.01

  const result = evaluateCostProvenance(data, NOW)

  assert.equal(result.additionalCostUsd, null)
  assert.ok(result.reasons.includes("NETWORK_INVALID_VALUE"))
})

test("zero costs are allowed but never independently verified", () => {
  const data = evidence()

  for (const item of data) {
    item.valueUsd = 0
  }

  const result = evaluateCostProvenance(data, NOW)

  assert.equal(result.additionalCostUsd, 0)
  assert.equal(result.independentlyVerified, false)
  assert.equal(result.tradeAllowed, false)
})

test("missing status blocks valuation", () => {
  const data = evidence()
  data[2].status = "MISSING"

  const result = evaluateCostProvenance(data, NOW)

  assert.equal(result.additionalCostUsd, null)
  assert.ok(result.reasons.includes("NETWORK_MISSING"))
})

test("invalid clock blocks valuation", () => {
  const result = evaluateCostProvenance(evidence(), NaN)

  assert.equal(result.additionalCostUsd, null)
  assert.ok(result.reasons.includes("INVALID_CLOCK"))
})
