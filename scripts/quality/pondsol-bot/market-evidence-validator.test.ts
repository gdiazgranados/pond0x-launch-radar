import assert from "node:assert/strict"
import test from "node:test"

import {
  validatePondsolMarketEvidence,
  type MarketEvidence,
  type PondsolMarketEvidence,
} from "../../../src/private-alpha/pondsol-bot/market-evidence-validator"

const NOW = 1_800_000_000_000

function item(
  value: number | null,
  status: MarketEvidence["status"] = "OBSERVED",
  source: string | null = "synthetic-test",
  observedAtMs: number | null = NOW - 1000
): MarketEvidence {
  return { value, status, source, observedAtMs }
}

function valid(): PondsolMarketEvidence {
  return {
    solPriceUsd: item(200),
    entryFeeUsd: item(0.01, "ESTIMATED"),
    exitFeeUsd: item(0.01, "ESTIMATED"),
    networkCostUsd: item(0.01, "ESTIMATED"),
  }
}

test("accepts fresh evidence for informational valuation only", () => {
  const result = validatePondsolMarketEvidence(valid(), NOW)

  assert.equal(result.usableForValuation, true)
  assert.equal(result.verifiedForOpportunity, false)
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.values?.solPriceUsd, 200)
})

test("rejects missing SOL price", () => {
  const evidence = valid()
  evidence.solPriceUsd = item(null, "MISSING")

  const result = validatePondsolMarketEvidence(evidence, NOW)

  assert.equal(result.usableForValuation, false)
  assert.ok(result.reasons.includes("SOL_PRICE_MISSING"))
  assert.equal(result.values, null)
})

test("rejects stale prices", () => {
  const evidence = valid()
  evidence.solPriceUsd.observedAtMs = NOW - 31000

  const result = validatePondsolMarketEvidence(evidence, NOW)

  assert.ok(result.reasons.includes("SOL_PRICE_STALE"))
})

test("rejects future timestamps", () => {
  const evidence = valid()
  evidence.entryFeeUsd.observedAtMs = NOW + 1000

  const result = validatePondsolMarketEvidence(evidence, NOW)

  assert.ok(result.reasons.includes("ENTRY_FEE_INVALID_TIMESTAMP"))
})

test("rejects unidentified sources", () => {
  const evidence = valid()
  evidence.exitFeeUsd.source = " "

  const result = validatePondsolMarketEvidence(evidence, NOW)

  assert.ok(result.reasons.includes("EXIT_FEE_SOURCE_MISSING"))
})

test("rejects negative costs", () => {
  const evidence = valid()
  evidence.networkCostUsd.value = -0.01

  const result = validatePondsolMarketEvidence(evidence, NOW)

  assert.ok(result.reasons.includes("NETWORK_COST_INVALID_VALUE"))
})

test("rejects zero SOL price", () => {
  const evidence = valid()
  evidence.solPriceUsd.value = 0

  const result = validatePondsolMarketEvidence(evidence, NOW)

  assert.ok(result.reasons.includes("SOL_PRICE_INVALID_VALUE"))
})

test("rejects explicitly stale costs", () => {
  const evidence = valid()
  evidence.entryFeeUsd.status = "STALE"

  const result = validatePondsolMarketEvidence(evidence, NOW)

  assert.ok(result.reasons.includes("ENTRY_FEE_STALE"))
})

test("accepts zero estimated fees without verifying them", () => {
  const evidence = valid()
  evidence.entryFeeUsd.value = 0

  const result = validatePondsolMarketEvidence(evidence, NOW)

  assert.equal(result.usableForValuation, true)
  assert.equal(result.verifiedForOpportunity, false)
  assert.equal(result.tradeAllowed, false)
})

test("rejects invalid valuation clock", () => {
  assert.throws(
    () => validatePondsolMarketEvidence(valid(), -1),
    /INVALID_MARKET_EVIDENCE_CLOCK/
  )
})
