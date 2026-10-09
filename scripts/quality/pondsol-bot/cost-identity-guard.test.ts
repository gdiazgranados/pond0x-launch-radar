import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateCostIdentity,
  type IdentifiedCost,
} from "../../../src/private-alpha/pondsol-bot/cost-identity-guard"

const ENTRY = "jupiter:synthetic-entry"
const EXIT = "jupiter:synthetic-exit"

function fixture(): IdentifiedCost[] {
  return [
    {
      category: "ENTRY_SWAP",
      chargeId: "entry-fee",
      componentIds: ["entry-swap-component"],
      source: "synthetic",
      coverage: "INCLUDED_IN_QUOTE",
      quoteRouteId: ENTRY,
    },
    {
      category: "EXIT_SWAP",
      chargeId: "exit-fee",
      componentIds: ["exit-swap-component"],
      source: "synthetic",
      coverage: "INCLUDED_IN_QUOTE",
      quoteRouteId: EXIT,
    },
    {
      category: "NETWORK",
      chargeId: "network-fee",
      componentIds: ["base-network-component"],
      source: "synthetic",
      coverage: "ADDITIONAL_COST",
      quoteRouteId: null,
    },
    {
      category: "PRIORITY",
      chargeId: "priority-fee",
      componentIds: ["priority-component"],
      source: "synthetic",
      coverage: "ADDITIONAL_COST",
      quoteRouteId: null,
    },
    {
      category: "RENT",
      chargeId: "rent-fee",
      componentIds: ["rent-component"],
      source: "synthetic",
      coverage: "ADDITIONAL_COST",
      quoteRouteId: null,
    },
  ]
}

test("accepts structurally distinct synthetic components", () => {
  const result = evaluateCostIdentity(fixture(), ENTRY, EXIT)
  assert.equal(result.structurallyConsistent, true)
  assert.equal(result.independentlyVerified, false)
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.decision, "NO_TRADE")
})

test("rejects overlapping network and priority components", () => {
  const costs = fixture()
  costs[3].componentIds = ["base-network-component"]
  const result = evaluateCostIdentity(costs, ENTRY, EXIT)
  assert.ok(result.reasons.includes("OVERLAPPING_COST_COMPONENT"))
  assert.equal(result.structurallyConsistent, false)
})

test("rejects duplicate charge identifiers", () => {
  const costs = fixture()
  costs[3].chargeId = costs[2].chargeId
  const result = evaluateCostIdentity(costs, ENTRY, EXIT)
  assert.ok(result.reasons.includes("DUPLICATE_CHARGE_ID"))
})

test("rejects incorrect swap route", () => {
  const costs = fixture()
  costs[0].quoteRouteId = EXIT
  const result = evaluateCostIdentity(costs, ENTRY, EXIT)
  assert.ok(result.reasons.includes("SWAP_ROUTE_MISMATCH"))
})

test("rejects unknown cost coverage", () => {
  const costs = fixture()
  costs[2].coverage = "UNKNOWN"
  const result = evaluateCostIdentity(costs, ENTRY, EXIT)
  assert.ok(result.reasons.includes("UNKNOWN_COST_COVERAGE"))
})

test("rejects missing cost categories", () => {
  const costs = fixture().slice(0, 4)
  const result = evaluateCostIdentity(costs, ENTRY, EXIT)
  assert.ok(result.reasons.includes("MISSING_COST_CATEGORY"))
})

test("rejects missing component identity", () => {
  const costs = fixture()
  costs[2].componentIds = []
  const result = evaluateCostIdentity(costs, ENTRY, EXIT)
  assert.ok(result.reasons.includes("MISSING_COST_COMPONENTS"))
})

test("rejects duplicate components within a category", () => {
  const costs = fixture()
  costs[2].componentIds = [
    "base-network-component",
    "base-network-component",
  ]
  const result = evaluateCostIdentity(costs, ENTRY, EXIT)
  assert.ok(result.reasons.includes("DUPLICATE_LOCAL_COMPONENT"))
})

test("rejects invalid evaluation routes", () => {
  const result = evaluateCostIdentity(fixture(), ENTRY, ENTRY)
  assert.ok(result.reasons.includes("INVALID_IDENTITY_CONTEXT"))
})

test("never enables trading with valid identities", () => {
  const result = evaluateCostIdentity(fixture(), ENTRY, EXIT)
  assert.equal(result.decision, "NO_TRADE")
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.mode, "SIMULATION")
})
