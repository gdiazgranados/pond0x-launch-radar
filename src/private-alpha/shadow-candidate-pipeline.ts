import {
  adaptPublicMarketEvidence,
  type MarketSnapshot,
  type MarketTrends,
} from "./public-market-evidence-adapter"
import {
  createShadowProposal,
  evidenceBlockingReasons,
  type ShadowPosition,
  type ShadowToken,
} from "./shadow-portfolio"
import type { SizeAwareQuoteObservation } from "./size-aware-quote"

export type ShadowCandidateInput = {
  snapshot: MarketSnapshot
  trends: MarketTrends
  tokenId: ShadowToken
  windowKey: "1h" | "6h" | "24h"
  now: Date
  maxAgeMinutes: number
  sizeAwareQuote: SizeAwareQuoteObservation
  positionId: string
  ruleVersion: string
  operatorNote: string | null
}

export type ShadowCandidateResult =
  | {
      status: "PROPOSED"
      simulationOnly: true
      proposal: ShadowPosition
      blockingReasons: ReadonlyArray<never>
    }
  | {
      status: "BLOCKED"
      simulationOnly: true
      proposal: null
      blockingReasons: ReadonlyArray<string>
    }

function finitePositive(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0
}

function finiteNonNegative(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0
}

export function buildShadowCandidate(
  input: ShadowCandidateInput
): ShadowCandidateResult {
  const adapted = adaptPublicMarketEvidence(
    input.snapshot,
    input.trends,
    input.tokenId,
    input.windowKey,
    {
      now: input.now,
      maxAgeMinutes: input.maxAgeMinutes,
      sizeAwareQuote: input.sizeAwareQuote,
    }
  )
  const quote = input.sizeAwareQuote
  const reasons = evidenceBlockingReasons(adapted.evidence)

  if (!finitePositive(adapted.currentReferenceUsd)) {
    reasons.push("CURRENT_REFERENCE_UNAVAILABLE")
  }
  if (quote.status !== "MEASURED") {
    reasons.push("SIZE_AWARE_QUOTE_UNAVAILABLE")
  }
  if (quote.tokenId !== adapted.tokenId) {
    reasons.push("QUOTE_TOKEN_MISMATCH")
  }
  if (quote.chain !== adapted.chain) {
    reasons.push("QUOTE_CHAIN_MISMATCH")
  }
  if (
    quote.referencePairAddress !==
    adapted.evidence.currentPairAddress
  ) {
    reasons.push("QUOTE_PAIR_MISMATCH")
  }
  if (!finiteNonNegative(quote.estimatedEntryPriceImpactPct)) {
    reasons.push("ENTRY_PRICE_IMPACT_UNAVAILABLE")
  }
  if (!finiteNonNegative(quote.estimatedEntryFeeUsd)) {
    reasons.push("ENTRY_FEE_UNAVAILABLE")
  }
  for (const reason of quote.blockingReasons) {
    reasons.push(`QUOTE:${reason}`)
  }

  const blockingReasons = [...new Set(reasons)]
  if (blockingReasons.length > 0) {
    return {
      status: "BLOCKED",
      simulationOnly: true,
      proposal: null,
      blockingReasons,
    }
  }

  return {
    status: "PROPOSED",
    simulationOnly: true,
    proposal: createShadowProposal({
      positionId: input.positionId,
      tokenId: adapted.tokenId,
      chain: adapted.chain,
      entryReferenceUsd: adapted.currentReferenceUsd!,
      notionalUsd: quote.requestedNotionalUsd,
      estimatedEntrySlippagePct:
        quote.estimatedEntryPriceImpactPct!,
      estimatedFeesUsd: quote.estimatedEntryFeeUsd!,
      evidence: adapted.evidence,
      ruleVersion: input.ruleVersion,
      operatorNote: input.operatorNote,
    }),
    blockingReasons: [],
  }
}
