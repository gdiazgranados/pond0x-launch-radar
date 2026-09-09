import {
  adaptPublicMarketEvidence,
  type MarketSnapshot,
  type MarketTrends,
} from "./public-market-evidence-adapter"
import {
  evidenceBlockingReasons,
  observeShadowPrice,
} from "./shadow-portfolio"
import {
  loadShadowSimulationState,
  persistShadowSimulationTransition,
} from "./shadow-simulation-coordinator"
import type { PrivateShadowPortfolioStore } from "./shadow-portfolio-repository"
import type { SizeAwareQuoteObservation } from "./size-aware-quote"

export type MarkShadowPositionInput = {
  positionId: string
  markedAt: string
  snapshot: MarketSnapshot
  trends: MarketTrends
  sizeAwareQuote: SizeAwareQuoteObservation
  windowKey: "1h" | "6h" | "24h"
  maxAgeMinutes: number
}

export async function markShadowPosition(
  portfolioStore: PrivateShadowPortfolioStore,
  input: MarkShadowPositionInput
) {
  if (!input.positionId.trim()) {
    throw new Error("positionId is required")
  }
  if (!Number.isFinite(Date.parse(input.markedAt))) {
    throw new Error("markedAt must be a valid timestamp")
  }

  const state = await loadShadowSimulationState(portfolioStore)
  const position = state.portfolio.positions.find(
    (item) => item.positionId === input.positionId
  )
  if (!position) throw new Error("shadow position not found")
  if (position.status !== "OPEN") {
    throw new Error("shadow position is not open")
  }

  const adapted = adaptPublicMarketEvidence(
    input.snapshot,
    input.trends,
    position.tokenId,
    input.windowKey,
    {
      now: new Date(input.markedAt),
      maxAgeMinutes: input.maxAgeMinutes,
      sizeAwareQuote: input.sizeAwareQuote,
    }
  )
  const reasons = evidenceBlockingReasons(adapted.evidence)
  const entryPair = position.evidenceRefs[0]?.currentPairAddress
  if (adapted.evidence.currentPairAddress !== entryPair) {
    reasons.push("ENTRY_MARK_PAIR_MISMATCH")
  }
  if (adapted.currentReferenceUsd === null) {
    reasons.push("CURRENT_REFERENCE_UNAVAILABLE")
  }
  if (reasons.length > 0) {
    throw new Error(
      `mark evidence is blocked: ${[...new Set(reasons)].join(",")}`
    )
  }

  const observed = observeShadowPrice(
    position,
    adapted.currentReferenceUsd!
  )
  const marked = {
    ...observed,
    evidenceRefs: [
      ...observed.evidenceRefs,
      structuredClone(adapted.evidence),
    ],
  }
  const next = await persistShadowSimulationTransition(
    portfolioStore,
    marked,
    {
      updatedAt: input.markedAt,
      expectedRevision: state.portfolio.revision,
    }
  )

  const grossUnrealizedPnlUsd =
    ((adapted.currentReferenceUsd! - position.entryReferenceUsd) /
      position.entryReferenceUsd) *
    position.notionalUsd
  const entrySlippageUsd =
    position.notionalUsd *
    position.estimatedEntrySlippagePct / 100
  const exitSlippageUsd =
    position.notionalUsd *
    (input.sizeAwareQuote.estimatedExitPriceImpactPct ?? 0) / 100
  const estimatedExitFeeUsd =
    input.sizeAwareQuote.estimatedExitFeeUsd ?? 0

  return {
    simulationOnly: true as const,
    position: marked,
    markedAt: input.markedAt,
    currentReferenceUsd: adapted.currentReferenceUsd,
    grossUnrealizedPnlUsd,
    estimatedNetLiquidationPnlUsd:
      grossUnrealizedPnlUsd -
      entrySlippageUsd -
      exitSlippageUsd -
      position.estimatedFeesUsd -
      estimatedExitFeeUsd,
    state: next,
  }
}
