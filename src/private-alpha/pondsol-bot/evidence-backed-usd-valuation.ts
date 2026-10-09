import {
  validatePondsolMarketEvidence,
  type PondsolMarketEvidence,
} from "./market-evidence-validator"

import {
  valueTimedPondsolRoundTripUsd,
  type TimedUsdValuation,
} from "./timed-usd-valuation"

import type {
  TimedPondsolRoundTrip,
} from "./timed-pondsol-roundtrip"

export type EvidenceBackedValuationInput = {
  cycle: TimedPondsolRoundTrip
  evidence: PondsolMarketEvidence
  nowMs: number
}

export type EvidenceBackedValuationResult = {
  decision: "NO_TRADE"
  valuation: TimedUsdValuation | null
  reasons: string[]
  evidenceVerified: false
  tradeAllowed: false
  mode: "SIMULATION"
}

export function evaluateEvidenceBackedUsdValuation(
  input: EvidenceBackedValuationInput
): EvidenceBackedValuationResult {
  const blocked = (reasons: string[]): EvidenceBackedValuationResult => ({
    decision: "NO_TRADE",
    valuation: null,
    reasons,
    evidenceVerified: false,
    tradeAllowed: false,
    mode: "SIMULATION",
  })

  const validated = validatePondsolMarketEvidence(
    input.evidence,
    input.nowMs
  )

  if (!validated.usableForValuation || !validated.values) {
    return blocked(validated.reasons)
  }

  const { cycle } = input

  if (
    !cycle ||
    !cycle.entry ||
    !cycle.exit ||
    cycle.mode !== "SIMULATION" ||
    cycle.tradeAllowed !== false ||
    cycle.liquidityClassification !== "INDEPENDENT"
  ) {
    return blocked(["CYCLE_NOT_ELIGIBLE"])
  }

  const entryAt = cycle.entry.responseReceivedAtMs
  const exitAt = cycle.exit.responseReceivedAtMs

  if (
    !Number.isSafeInteger(entryAt) ||
    !Number.isSafeInteger(exitAt) ||
    entryAt <= 0 ||
    exitAt < entryAt ||
    exitAt > input.nowMs
  ) {
    return blocked(["INVALID_CYCLE_TIMELINE"])
  }

  const priceAt = input.evidence.solPriceUsd.observedAtMs

  if (
    priceAt === null ||
    priceAt > exitAt
  ) {
    return blocked(["PRICE_AFTER_EXIT_QUOTE"])
  }

  const feeEvidence = [
    input.evidence.entryFeeUsd,
    input.evidence.exitFeeUsd,
    input.evidence.networkCostUsd,
  ]

  if (
    feeEvidence.some(
      (item) =>
        item.observedAtMs === null ||
        item.observedAtMs > exitAt
    )
  ) {
    return blocked(["COST_EVIDENCE_AFTER_EXIT_QUOTE"])
  }

  try {
    const valuation = valueTimedPondsolRoundTripUsd({
      cycle,
      solPriceUsd: validated.values.solPriceUsd,
      priceObservedAtMs: priceAt,
      nowMs: input.nowMs,
      entryFeeUsd: validated.values.entryFeeUsd,
      exitFeeUsd: validated.values.exitFeeUsd,
      networkCostUsd: validated.values.networkCostUsd,
    })

    return {
      decision: "NO_TRADE",
      valuation,
      reasons: ["INFORMATIONAL_VALUATION_ONLY"],
      evidenceVerified: false,
      tradeAllowed: false,
      mode: "SIMULATION",
    }
  } catch {
    return blocked(["USD_VALUATION_REJECTED"])
  }
}
