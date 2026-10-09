import type {
  CostCategory,
  CostCoverage,
} from "./cost-provenance-guard"

export type IdentifiedCost = {
  category: CostCategory
  chargeId: string
  componentIds: readonly string[]
  source: string
  coverage: CostCoverage
  quoteRouteId: string | null
}

export type CostIdentityResult = {
  structurallyConsistent: boolean
  independentlyVerified: false
  reasons: string[]
  decision: "NO_TRADE"
  tradeAllowed: false
  mode: "SIMULATION"
}

const CATEGORIES: readonly CostCategory[] = [
  "ENTRY_SWAP", "EXIT_SWAP", "NETWORK", "PRIORITY", "RENT",
]

const ID = /^[A-Za-z0-9][A-Za-z0-9:_./-]{0,127}$/

export function evaluateCostIdentity(
  evidence: readonly IdentifiedCost[],
  entryRouteId: string,
  exitRouteId: string
): CostIdentityResult {
  const reasons: string[] = []

  const result = (): CostIdentityResult => ({
    structurallyConsistent: reasons.length === 0,
    independentlyVerified: false,
    reasons: [...new Set(reasons)],
    decision: "NO_TRADE",
    tradeAllowed: false,
    mode: "SIMULATION",
  })

  if (
    !Array.isArray(evidence) ||
    !ID.test(entryRouteId ?? "") ||
    !ID.test(exitRouteId ?? "") ||
    entryRouteId === exitRouteId
  ) {
    reasons.push("INVALID_IDENTITY_CONTEXT")
    return result()
  }

  const seenCategories = new Set<CostCategory>()
  const seenCharges = new Set<string>()
  const seenComponents = new Set<string>()

  for (const item of evidence) {
    if (!item || !CATEGORIES.includes(item.category)) {
      reasons.push("INVALID_COST_CATEGORY")
      continue
    }

    if (seenCategories.has(item.category)) {
      reasons.push("DUPLICATE_COST_CATEGORY")
    }
    seenCategories.add(item.category)

    if (!ID.test(item.chargeId ?? "")) {
      reasons.push("INVALID_CHARGE_ID")
    } else {
      if (seenCharges.has(item.chargeId)) {
        reasons.push("DUPLICATE_CHARGE_ID")
      }
      seenCharges.add(item.chargeId)
    }

    if (
      typeof item.source !== "string" ||
      !item.source.trim()
    ) {
      reasons.push("UNKNOWN_COST_SOURCE")
    }

    if (
      item.coverage !== "INCLUDED_IN_QUOTE" &&
      item.coverage !== "ADDITIONAL_COST"
    ) {
      reasons.push("UNKNOWN_COST_COVERAGE")
    }

    if (
      !Array.isArray(item.componentIds) ||
      item.componentIds.length === 0
    ) {
      reasons.push("MISSING_COST_COMPONENTS")
    } else {
      const local = new Set<string>()

      for (const component of item.componentIds) {
        if (!ID.test(component ?? "")) {
          reasons.push("INVALID_COST_COMPONENT")
          continue
        }

        if (local.has(component)) {
          reasons.push("DUPLICATE_LOCAL_COMPONENT")
        }
        local.add(component)

        if (seenComponents.has(component)) {
          reasons.push("OVERLAPPING_COST_COMPONENT")
        }
        seenComponents.add(component)
      }
    }

    const expectedRoute =
      item.category === "ENTRY_SWAP"
        ? entryRouteId
        : item.category === "EXIT_SWAP"
          ? exitRouteId
          : null

    if (expectedRoute !== null) {
      if (item.quoteRouteId !== expectedRoute) {
        reasons.push("SWAP_ROUTE_MISMATCH")
      }
    } else if (item.quoteRouteId !== null) {
      if (
        item.quoteRouteId !== entryRouteId &&
        item.quoteRouteId !== exitRouteId
      ) {
        reasons.push("UNKNOWN_COST_ROUTE")
      }
    }
  }

  for (const category of CATEGORIES) {
    if (!seenCategories.has(category)) {
      reasons.push("MISSING_COST_CATEGORY")
    }
  }

  return result()
}
