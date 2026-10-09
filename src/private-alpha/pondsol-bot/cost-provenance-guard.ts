export type CostEvidenceStatus =
  | "OBSERVED"
  | "DERIVED"
  | "ESTIMATED"
  | "MISSING"

export type CostCoverage =
  | "INCLUDED_IN_QUOTE"
  | "ADDITIONAL_COST"
  | "UNKNOWN"

export type CostCategory =
  | "ENTRY_SWAP"
  | "EXIT_SWAP"
  | "NETWORK"
  | "PRIORITY"
  | "RENT"

export type CostEvidence = {
  category: CostCategory
  valueUsd: number | null
  source: string | null
  observedAtMs: number | null
  status: CostEvidenceStatus
  coverage: CostCoverage
}

export type CostProvenanceResult = {
  usableForInformationalValuation: boolean
  independentlyVerified: false
  additionalCostUsd: number | null
  reasons: string[]
  decision: "NO_TRADE"
  tradeAllowed: false
  mode: "SIMULATION"
}

const REQUIRED_CATEGORIES: readonly CostCategory[] = [
  "ENTRY_SWAP",
  "EXIT_SWAP",
  "NETWORK",
  "PRIORITY",
  "RENT",
]

export function evaluateCostProvenance(
  evidence: readonly CostEvidence[],
  nowMs: number,
  maxAgeMs = 30_000
): CostProvenanceResult {
  const reasons: string[] = []

  const blocked = (): CostProvenanceResult => ({
    usableForInformationalValuation: false,
    independentlyVerified: false,
    additionalCostUsd: null,
    reasons: [...new Set(reasons)],
    decision: "NO_TRADE",
    tradeAllowed: false,
    mode: "SIMULATION",
  })

  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0 ||
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs <= 0
  ) {
    reasons.push("INVALID_CLOCK")
    return blocked()
  }

  if (!Array.isArray(evidence)) {
    reasons.push("INVALID_EVIDENCE")
    return blocked()
  }

  const seen = new Set<CostCategory>()
  let total = 0

  for (const item of evidence) {
    if (!item || !REQUIRED_CATEGORIES.includes(item.category)) {
      reasons.push("UNKNOWN_COST_CATEGORY")
      continue
    }

    if (seen.has(item.category)) {
      reasons.push(`DUPLICATE_${item.category}`)
      continue
    }

    seen.add(item.category)

    if (item.status === "MISSING") {
      reasons.push(`${item.category}_MISSING`)
      continue
    }

    if (
      item.status !== "OBSERVED" &&
      item.status !== "DERIVED" &&
      item.status !== "ESTIMATED"
    ) {
      reasons.push(`${item.category}_INVALID_STATUS`)
      continue
    }

    if (
      typeof item.valueUsd !== "number" ||
      !Number.isFinite(item.valueUsd) ||
      item.valueUsd < 0
    ) {
      reasons.push(`${item.category}_INVALID_VALUE`)
      continue
    }

    if (
      typeof item.source !== "string" ||
      item.source.trim().length === 0
    ) {
      reasons.push(`${item.category}_UNKNOWN_SOURCE`)
      continue
    }

    if (
      !Number.isSafeInteger(item.observedAtMs) ||
      item.observedAtMs === null ||
      item.observedAtMs <= 0 ||
      item.observedAtMs > nowMs ||
      nowMs - item.observedAtMs > maxAgeMs
    ) {
      reasons.push(`${item.category}_STALE_OR_INVALID_TIME`)
      continue
    }

    if (item.coverage === "UNKNOWN") {
      reasons.push(`${item.category}_UNKNOWN_COVERAGE`)
      continue
    }

    if (
      item.coverage !== "INCLUDED_IN_QUOTE" &&
      item.coverage !== "ADDITIONAL_COST"
    ) {
      reasons.push(`${item.category}_INVALID_COVERAGE`)
      continue
    }

    if (item.coverage === "ADDITIONAL_COST") {
      total += item.valueUsd

      if (!Number.isFinite(total)) {
        reasons.push("INVALID_COST_TOTAL")
      }
    }
  }

  for (const category of REQUIRED_CATEGORIES) {
    if (!seen.has(category)) {
      reasons.push(`${category}_NOT_PROVIDED`)
    }
  }

  if (reasons.length > 0) {
    return blocked()
  }

  return {
    usableForInformationalValuation: true,
    independentlyVerified: false,
    additionalCostUsd: total,
    reasons: ["INFORMATIONAL_COST_ACCOUNTING_ONLY"],
    decision: "NO_TRADE",
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}
