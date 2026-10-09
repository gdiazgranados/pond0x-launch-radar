import {
  evaluateMarketEvidenceIntegrity,
  type BoundMarketEvidence,
} from "./market-evidence-integrity"

import {
  evaluateIdentityBackedValuation,
  type IdentityBackedValuationInput,
  type IdentityBackedValuationResult,
} from "./identity-backed-valuation"

import type { CostCategory } from "./cost-provenance-guard"

export type IntegrityBackedValuationInput =
  IdentityBackedValuationInput & {
    cycleId: string
    boundEvidence: readonly BoundMarketEvidence[]
  }

export type IntegrityBackedValuationResult =
  IdentityBackedValuationResult & {
    integrityStructurallyConsistent: boolean
    integrityIndependentlyVerified: false
  }

const CATEGORIES: readonly CostCategory[] = [
  "ENTRY_SWAP",
  "EXIT_SWAP",
  "NETWORK",
  "PRIORITY",
  "RENT",
]

function blocked(reasons: string[]): IntegrityBackedValuationResult {
  return {
    decision: "NO_TRADE",
    valuation: null,
    reasons: [...new Set(reasons)],
    evidenceVerified: false,
    costsIndependentlyVerified: false,
    identityStructurallyConsistent: false,
    identityIndependentlyVerified: false,
    integrityStructurallyConsistent: false,
    integrityIndependentlyVerified: false,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}

export function evaluateIntegrityBackedValuation(
  input: IntegrityBackedValuationInput
): IntegrityBackedValuationResult {
  try {
    if (
      !input ||
      !input.cycle ||
      !input.solPriceUsd ||
      !Array.isArray(input.costs) ||
      !Array.isArray(input.identities) ||
      !Array.isArray(input.boundEvidence)
    ) {
      return blocked(["INVALID_INTEGRITY_VALUATION_INPUT"])
    }

    const integrity = evaluateMarketEvidenceIntegrity({
      cycleId: input.cycleId,
      cycle: input.cycle,
      evidence: input.boundEvidence,
      nowMs: input.nowMs,
    })

    if (!integrity.structurallyConsistent) {
      return blocked(integrity.reasons)
    }

    const bound = new Map(
      input.boundEvidence.map(item => [item.kind, item])
    )

    const price = bound.get("SOL_PRICE")

    if (
      !price ||
      price.source !== input.solPriceUsd.source ||
      price.observedAtMs !== input.solPriceUsd.observedAtMs ||
      price.routeId !== null
    ) {
      return blocked(["SOL_PRICE_BINDING_MISMATCH"])
    }

    if (input.costs.length !== CATEGORIES.length) {
      return blocked(["COST_BINDING_COUNT_MISMATCH"])
    }

    for (const category of CATEGORIES) {
      const matches = input.costs.filter(
        item => item?.category === category
      )

      if (matches.length !== 1) {
        return blocked(["COST_BINDING_CATEGORY_MISMATCH"])
      }

      const cost = matches[0]
      const evidence = bound.get(category)

      if (
        !evidence ||
        evidence.source !== cost.source ||
        evidence.observedAtMs !== cost.observedAtMs
      ) {
        return blocked([`${category}_BINDING_MISMATCH`])
      }

      const identity = input.identities.find(
        item => item?.category === category
      )

      if (!identity) {
        return blocked([`${category}_IDENTITY_MISSING`])
      }

      if (evidence.routeId !== identity.quoteRouteId) {
        return blocked([`${category}_IDENTITY_ROUTE_MISMATCH`])
      }
    }

    const valuation = evaluateIdentityBackedValuation(input)

    return {
      ...valuation,
      integrityStructurallyConsistent: true,
      integrityIndependentlyVerified: false,
      identityIndependentlyVerified: false,
      costsIndependentlyVerified: false,
      evidenceVerified: false,
      decision: "NO_TRADE",
      tradeAllowed: false,
      mode: "SIMULATION",
    }
  } catch {
    return blocked(["INTEGRITY_VALUATION_REJECTED"])
  }
}
