import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateMarketEvidenceIntegrity,
  type MarketIntegrityInput,
} from "../../../src/private-alpha/pondsol-bot/market-evidence-integrity"

const NOW = 1800000000000
const A = "jupiter:entry"
const B = "jupiter:exit"

function fixture(): MarketIntegrityInput {
  const cycle = {
    entry: {
      observation: {
        direction: "WSOL_TO_PONDSOL" as const,
        quote: {
          routeId: A,
          venueIds: ["pool-entry"],
          inputAmountBaseUnits: "10000000",
          outputAmountBaseUnits: "6000000",
          inputAmount: 0.01,
          outputAmount: 0.006,
          estimatedFeeUsd: 0,
        },
        poolIds: ["pool-entry"],
        tradeAllowed: false as const,
        mode: "SIMULATION" as const,
      },
      requestStartedAtMs: NOW - 4000,
      responseReceivedAtMs: NOW - 3000,
      durationMs: 1000,
      tradeAllowed: false as const,
      mode: "SIMULATION" as const,
    },
    exit: {
      observation: {
        direction: "PONDSOL_TO_WSOL" as const,
        quote: {
          routeId: B,
          venueIds: ["pool-exit"],
          inputAmountBaseUnits: "6000000",
          outputAmountBaseUnits: "11000000",
          inputAmount: 0.006,
          outputAmount: 0.011,
          estimatedFeeUsd: 0,
        },
        poolIds: ["pool-exit"],
        tradeAllowed: false as const,
        mode: "SIMULATION" as const,
      },
      requestStartedAtMs: NOW - 2500,
      responseReceivedAtMs: NOW - 2000,
      durationMs: 500,
      tradeAllowed: false as const,
      mode: "SIMULATION" as const,
    },
    liquidityClassification: "INDEPENDENT" as const,
    cycleDurationMs: 2000,
    tradeAllowed: false as const,
    mode: "SIMULATION" as const,
  }

  const kinds = [
    "SOL_PRICE",
    "ENTRY_SWAP",
    "EXIT_SWAP",
    "NETWORK",
    "PRIORITY",
    "RENT",
  ] as const

  return {
    cycleId: "synthetic-cycle-001",
    cycle,
    evidence: kinds.map((kind, i) => ({
      kind,
      cycleId: "synthetic-cycle-001",
      observedAtMs:
        kind === "ENTRY_SWAP" ? NOW - 3500 :
        kind === "EXIT_SWAP" ? NOW - 2200 :
        NOW - 2800,
      routeId:
        kind === "ENTRY_SWAP" ? A :
        kind === "EXIT_SWAP" ? B : null,
      source: "synthetic-source-" + i,
    })),
    nowMs: NOW,
  }
}

test("accepts structurally consistent synthetic cycle", () => {
  const result = evaluateMarketEvidenceIntegrity(fixture())
  assert.equal(result.structurallyConsistent, true)
  assert.equal(result.independentlyVerified, false)
  assert.equal(result.tradeAllowed, false)
})

test("rejects evidence from another cycle", () => {
  const input = fixture()
  input.evidence[3].cycleId = "different-cycle"
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("CROSS_CYCLE_EVIDENCE"))
})

test("rejects duplicate evidence", () => {
  const input = fixture()
  input.evidence = [...input.evidence, { ...input.evidence[0] }]
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("DUPLICATE_EVIDENCE_KIND"))
})

test("rejects missing evidence", () => {
  const input = fixture()
  input.evidence = input.evidence.slice(0, -1)
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("MISSING_RENT"))
})

test("rejects evidence outside cycle", () => {
  const input = fixture()
  input.evidence[0].observedAtMs = NOW - 5000
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("EVIDENCE_OUTSIDE_CYCLE"))
})

test("rejects incorrect entry route", () => {
  const input = fixture()
  input.evidence[1].routeId = B
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("ENTRY_ROUTE_MISMATCH"))
})

test("rejects entry evidence outside its quote window", () => {
  const input = fixture()
  input.evidence[1].observedAtMs = NOW - 2200
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("ENTRY_EVIDENCE_OUTSIDE_LEG"))
})

test("rejects inconsistent cycle duration", () => {
  const input = fixture()
  input.cycle.cycleDurationMs = 3000
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("INVALID_CYCLE_TIMELINE"))
})

test("rejects overlapping pools", () => {
  const input = fixture()
  input.cycle.exit.observation.poolIds = ["pool-entry"]
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes(
    "LIQUIDITY_NOT_STRUCTURALLY_INDEPENDENT"
  ))
})

test("rejects mismatched roundtrip amounts", () => {
  const input = fixture()
  input.cycle.exit.observation.quote.inputAmountBaseUnits = "5000000"
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("INVALID_CYCLE_CONTINUITY"))
})

test("rejects stale cycle", () => {
  const input = fixture()
  input.nowMs = NOW + 40000
  const result = evaluateMarketEvidenceIntegrity(input)
  assert.ok(result.reasons.includes("INVALID_CYCLE_TIMELINE"))
})

test("positive synthetic output never authorizes trading", () => {
  const result = evaluateMarketEvidenceIntegrity(fixture())
  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.mode, "SIMULATION")
  assert.equal(result.independentlyVerified, false)
})
