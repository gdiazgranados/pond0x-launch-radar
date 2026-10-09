import {
  evaluateCostProvenance,
  type CostEvidence,
  type CostCategory,
} from "./cost-provenance-guard"
import {
  evaluateEvidenceBackedUsdValuation,
  type EvidenceBackedValuationResult,
} from "./evidence-backed-usd-valuation"
import type { MarketEvidence } from "./market-evidence-validator"
import type { TimedPondsolRoundTrip } from "./timed-pondsol-roundtrip"

export type ProvenanceValuationInput = {
  cycle: TimedPondsolRoundTrip
  solPriceUsd: MarketEvidence
  costs: readonly CostEvidence[]
  additionalCostsDisjoint: boolean
  nowMs: number
}

export type ProvenanceValuationResult = EvidenceBackedValuationResult & {
  costsIndependentlyVerified: false
}

function blocked(reasons: string[]): ProvenanceValuationResult {
  return {
    decision: "NO_TRADE",
    valuation: null,
    reasons,
    evidenceVerified: false,
    costsIndependentlyVerified: false,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}

const categories: readonly CostCategory[] = [
  "ENTRY_SWAP", "EXIT_SWAP", "NETWORK", "PRIORITY", "RENT",
]

export function evaluateProvenanceBackedValuation(
  input: ProvenanceValuationInput
): ProvenanceValuationResult {
  try {
    if (!input || !input.cycle || !Array.isArray(input.costs)) {
      return blocked(["INVALID_INPUT"])
    }

    if (input.additionalCostsDisjoint !== true) {
      return blocked(["ADDITIONAL_COST_OVERLAP_UNRESOLVED"])
    }

    const exitAt = input.cycle.exit?.responseReceivedAtMs

    if (!Number.isSafeInteger(exitAt) || exitAt <= 0) {
      return blocked(["INVALID_EXIT_TIMESTAMP"])
    }

    const costResult = evaluateCostProvenance(
      input.costs, input.nowMs
    )

    if (
      !costResult.usableForInformationalValuation ||
      costResult.additionalCostUsd === null
    ) {
      return blocked(costResult.reasons)
    }

    if (
      input.costs.some(
        cost =>
          cost.observedAtMs === null ||
          cost.observedAtMs > exitAt
      )
    ) {
      return blocked(["COST_EVIDENCE_AFTER_EXIT_QUOTE"])
    }

    if (!input.solPriceUsd) {
      return blocked(["SOL_PRICE_MISSING"])
    }

    const costs = new Map<CostCategory, CostEvidence>()

    for (const item of input.costs) {
      if (!categories.includes(item.category)) {
        return blocked(["UNKNOWN_COST_CATEGORY"])
      }
      costs.set(item.category, item)
    }

    const entry = costs.get("ENTRY_SWAP")!
    const exit = costs.get("EXIT_SWAP")!

    // Included fees are already reflected in quoted amounts.
    // Only additional costs are passed to the USD valuation.
    const additional = (cost: CostEvidence): number =>
      cost.coverage === "ADDITIONAL_COST"
        ? cost.valueUsd!
        : 0

    const entryFeeUsd = additional(entry)
    const exitFeeUsd = additional(exit)

    const networkCostUsd =
      additional(costs.get("NETWORK")!) +
      additional(costs.get("PRIORITY")!) +
      additional(costs.get("RENT")!)

    if (!Number.isFinite(networkCostUsd)) {
      return blocked(["INVALID_ADDITIONAL_COST_TOTAL"])
    }

    // The legacy validator accepts OBSERVED/ESTIMATED,
    // not DERIVED. We preserve the original source status
    // only in the cost guard; the legacy adapter receives
    // ESTIMATED for non-observed costs.
    const legacyStatus = (
      cost: CostEvidence
    ): "OBSERVED" | "ESTIMATED" =>
      cost.status === "OBSERVED" ? "OBSERVED" : "ESTIMATED"

    const marketCost = (
      value: number,
      contributing: CostEvidence[]
    ): MarketEvidence => ({
      value,
      source: contributing.map(x => x.source).join(" + "),
      observedAtMs: Math.max(
        ...contributing.map(x => x.observedAtMs!)
      ),
      status: contributing.every(x => x.status === "OBSERVED")
        ? "OBSERVED"
        : "ESTIMATED",
    })

    const result = evaluateEvidenceBackedUsdValuation({
      cycle: input.cycle,
      evidence: {
        solPriceUsd: input.solPriceUsd,
        entryFeeUsd: {
          value: entryFeeUsd,
          source: entry.source,
          observedAtMs: entry.observedAtMs,
          status: legacyStatus(entry),
        },
        exitFeeUsd: {
          value: exitFeeUsd,
          source: exit.source,
          observedAtMs: exit.observedAtMs,
          status: legacyStatus(exit),
        },
        networkCostUsd: marketCost(networkCostUsd, [
          costs.get("NETWORK")!,
          costs.get("PRIORITY")!,
          costs.get("RENT")!,
        ]),
      },
      nowMs: input.nowMs,
    })

    return {
      ...result,
      costsIndependentlyVerified: false,
      tradeAllowed: false,
      decision: "NO_TRADE",
      mode: "SIMULATION",
    }
  } catch {
    return blocked(["PROVENANCE_VALUATION_REJECTED"])
  }
}
