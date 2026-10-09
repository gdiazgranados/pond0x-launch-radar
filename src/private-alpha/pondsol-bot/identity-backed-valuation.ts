import {
  evaluateCostIdentity,
  type IdentifiedCost,
} from "./cost-identity-guard"

import {
  evaluateProvenanceBackedValuation,
  type ProvenanceValuationInput,
  type ProvenanceValuationResult,
} from "./provenance-backed-valuation"

import type { CostCategory } from "./cost-provenance-guard"

export type IdentityBackedValuationInput =
  ProvenanceValuationInput & {
    identities: readonly IdentifiedCost[]
  }

export type IdentityBackedValuationResult =
  ProvenanceValuationResult & {
    identityStructurallyConsistent: boolean
    identityIndependentlyVerified: false
  }

function blocked(
  reasons: string[]
): IdentityBackedValuationResult {
  return {
    decision: "NO_TRADE",
    valuation: null,
    reasons: [...new Set(reasons)],
    evidenceVerified: false,
    costsIndependentlyVerified: false,
    identityStructurallyConsistent: false,
    identityIndependentlyVerified: false,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}

export function evaluateIdentityBackedValuation(
  input: IdentityBackedValuationInput
): IdentityBackedValuationResult {
  try {
    if (
      !input ||
      !input.cycle ||
      !input.cycle.entry ||
      !input.cycle.exit ||
      !Array.isArray(input.costs) ||
      !Array.isArray(input.identities)
    ) {
      return blocked(["INVALID_IDENTITY_VALUATION_INPUT"])
    }

    const entryRoute =
      input.cycle.entry.observation?.quote?.routeId

    const exitRoute =
      input.cycle.exit.observation?.quote?.routeId

    if (
      typeof entryRoute !== "string" ||
      typeof exitRoute !== "string"
    ) {
      return blocked(["MISSING_QUOTE_ROUTE_ID"])
    }

    const identity = evaluateCostIdentity(
      input.identities,
      entryRoute,
      exitRoute
    )

    if (!identity.structurallyConsistent) {
      return blocked(identity.reasons)
    }

    const costs = new Map<CostCategory, {
      source: string | null
      coverage: string
    }>()

    for (const cost of input.costs) {
      if (!cost || costs.has(cost.category)) {
        return blocked(["DUPLICATE_OR_INVALID_COST_EVIDENCE"])
      }

      costs.set(cost.category, {
        source: cost.source,
        coverage: cost.coverage,
      })
    }

    if (costs.size !== input.identities.length) {
      return blocked(["COST_IDENTITY_COUNT_MISMATCH"])
    }

    for (const item of input.identities) {
      const matching = costs.get(item.category)

      if (!matching) {
        return blocked(["COST_IDENTITY_CATEGORY_MISMATCH"])
      }

      if (matching.source !== item.source) {
        return blocked(["COST_IDENTITY_SOURCE_MISMATCH"])
      }

      if (matching.coverage !== item.coverage) {
        return blocked(["COST_IDENTITY_COVERAGE_MISMATCH"])
      }
    }

    if (input.additionalCostsDisjoint !== true) {
      return blocked(["ADDITIONAL_COST_OVERLAP_UNRESOLVED"])
    }

    const result = evaluateProvenanceBackedValuation(input)

    return {
      ...result,
      identityStructurallyConsistent: true,
      identityIndependentlyVerified: false,
      costsIndependentlyVerified: false,
      evidenceVerified: false,
      decision: "NO_TRADE",
      tradeAllowed: false,
      mode: "SIMULATION",
    }
  } catch {
    return blocked(["IDENTITY_VALUATION_REJECTED"])
  }
}
