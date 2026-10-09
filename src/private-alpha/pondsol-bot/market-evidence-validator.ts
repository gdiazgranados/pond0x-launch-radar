import { PONDSOL_RISK_CONFIG } from "./risk-config"

export type EvidenceStatus =
  | "OBSERVED"
  | "ESTIMATED"
  | "MISSING"
  | "STALE"

export type MarketEvidence = {
  value: number | null
  source: string | null
  observedAtMs: number | null
  status: EvidenceStatus
}

export type PondsolMarketEvidence = {
  solPriceUsd: MarketEvidence
  entryFeeUsd: MarketEvidence
  exitFeeUsd: MarketEvidence
  networkCostUsd: MarketEvidence
}

export type ValidatedMarketEvidence = {
  usableForValuation: boolean
  verifiedForOpportunity: false
  reasons: string[]
  values: {
    solPriceUsd: number
    entryFeeUsd: number
    exitFeeUsd: number
    networkCostUsd: number
  } | null
  tradeAllowed: false
  mode: "SIMULATION"
}

const MAX_AGE_MS =
  PONDSOL_RISK_CONFIG.maxQuoteAgeSeconds * 1000

function validateEvidence(
  name: string,
  evidence: MarketEvidence,
  nowMs: number,
  requirePositive: boolean,
  reasons: string[]
): number | null {
  if (!evidence || evidence.status === "MISSING") {
    reasons.push(`${name}_MISSING`)
    return null
  }

  if (evidence.status === "STALE") {
    reasons.push(`${name}_STALE`)
    return null
  }

  if (
    evidence.status !== "OBSERVED" &&
    evidence.status !== "ESTIMATED"
  ) {
    reasons.push(`${name}_INVALID_STATUS`)
    return null
  }

  if (
    typeof evidence.source !== "string" ||
    !evidence.source.trim()
  ) {
    reasons.push(`${name}_SOURCE_MISSING`)
    return null
  }

  const timestamp = evidence.observedAtMs

  if (
    typeof timestamp !== "number" ||
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0 ||
    timestamp > nowMs
  ) {
    reasons.push(`${name}_INVALID_TIMESTAMP`)
    return null
  }

  if (nowMs - timestamp > MAX_AGE_MS) {
    reasons.push(`${name}_STALE`)
    return null
  }

  const value = evidence.value

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (requirePositive ? value <= 0 : value < 0)
  ) {
    reasons.push(`${name}_INVALID_VALUE`)
    return null
  }

  return value
}

export function validatePondsolMarketEvidence(
  evidence: PondsolMarketEvidence,
  nowMs: number
): ValidatedMarketEvidence {
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) {
    throw new Error("INVALID_MARKET_EVIDENCE_CLOCK")
  }

  const reasons: string[] = []

  const solPriceUsd = validateEvidence(
    "SOL_PRICE",
    evidence.solPriceUsd,
    nowMs,
    true,
    reasons
  )

  const entryFeeUsd = validateEvidence(
    "ENTRY_FEE",
    evidence.entryFeeUsd,
    nowMs,
    false,
    reasons
  )

  const exitFeeUsd = validateEvidence(
    "EXIT_FEE",
    evidence.exitFeeUsd,
    nowMs,
    false,
    reasons
  )

  const networkCostUsd = validateEvidence(
    "NETWORK_COST",
    evidence.networkCostUsd,
    nowMs,
    false,
    reasons
  )

  const usableForValuation = reasons.length === 0

  return {
    usableForValuation,
    verifiedForOpportunity: false,
    reasons,
    values:
      usableForValuation &&
      solPriceUsd !== null &&
      entryFeeUsd !== null &&
      exitFeeUsd !== null &&
      networkCostUsd !== null
        ? {
            solPriceUsd,
            entryFeeUsd,
            exitFeeUsd,
            networkCostUsd,
          }
        : null,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}
