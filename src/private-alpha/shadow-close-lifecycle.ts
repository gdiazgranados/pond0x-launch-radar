import {
  adaptPublicMarketEvidence,
  type MarketSnapshot,
  type MarketTrends,
} from "./public-market-evidence-adapter"
import {
  loadShadowExecutionBasis,
  type PrivateShadowExecutionBasisStore,
} from "./shadow-execution-basis"
import {
  evidenceBlockingReasons,
  observeShadowPrice,
} from "./shadow-portfolio"
import type { PrivateShadowPortfolioStore } from "./shadow-portfolio-repository"
import {
  loadShadowSimulationState,
  persistShadowSimulationTransition,
} from "./shadow-simulation-coordinator"
import type { SizeAwareQuoteObservation } from "./size-aware-quote"

export type CloseShadowPositionInput = {
  positionId: string
  closedAt: string
  snapshot: MarketSnapshot
  trends: MarketTrends
  sizeAwareQuote: SizeAwareQuoteObservation
  windowKey: "1h" | "6h" | "24h"
  maxAgeMinutes: number
}

export async function closeBasisAwareShadowPosition(
  portfolioStore: PrivateShadowPortfolioStore,
  executionBasisStore: PrivateShadowExecutionBasisStore,
  input: CloseShadowPositionInput
) {
  if (!input.positionId.trim()) {
    throw new Error("positionId is required")
  }
  if (!Number.isFinite(Date.parse(input.closedAt))) {
    throw new Error("closedAt must be a valid timestamp")
  }

  const [state, basisLedger] = await Promise.all([
    loadShadowSimulationState(portfolioStore),
    loadShadowExecutionBasis(executionBasisStore),
  ])
  const position = state.portfolio.positions.find(
    (item) => item.positionId === input.positionId
  )
  if (!position) throw new Error("shadow position not found")
  if (position.status !== "OPEN" || !position.openedAt) {
    throw new Error("shadow position is not open")
  }

  const basis = basisLedger.records.find(
    (item) => item.positionId === input.positionId
  )
  if (!basis) {
    return {
      simulationOnly: true as const,
      status: "BLOCKED" as const,
      blockingReasons: ["LEGACY_EXECUTION_BASIS_UNAVAILABLE"] as const,
      position,
      state,
    }
  }

  const adapted = adaptPublicMarketEvidence(
    input.snapshot,
    input.trends,
    position.tokenId,
    input.windowKey,
    {
      now: new Date(input.closedAt),
      maxAgeMinutes: input.maxAgeMinutes,
      sizeAwareQuote: input.sizeAwareQuote,
    }
  )
  const quote = input.sizeAwareQuote
  const reasons = evidenceBlockingReasons(adapted.evidence)

  if (adapted.currentReferenceUsd === null) {
    reasons.push("CURRENT_REFERENCE_UNAVAILABLE")
  }
  if (Date.parse(input.closedAt) < Date.parse(position.openedAt)) {
    reasons.push("EXIT_PRECEDES_ENTRY")
  }
  if (
    basis.tokenId !== position.tokenId ||
    basis.chain !== position.chain ||
    basis.requestedNotionalUsd !== position.notionalUsd
  ) {
    reasons.push("EXECUTION_BASIS_IDENTITY_MISMATCH")
  }
  if (
    basis.referencePairAddress !==
      position.evidenceRefs[0]?.currentPairAddress ||
    adapted.evidence.currentPairAddress !== basis.referencePairAddress ||
    quote.referencePairAddress !== basis.referencePairAddress
  ) {
    reasons.push("ENTRY_EXIT_PAIR_MISMATCH")
  }
  if (
    quote.status !== "MEASURED" ||
    quote.tokenId !== position.tokenId ||
    quote.chain !== position.chain
  ) {
    reasons.push("EXECUTABLE_EXIT_QUOTE_UNAVAILABLE")
  }
  if (
    quote.effectiveExitPriceUsd === null ||
    !Number.isFinite(quote.effectiveExitPriceUsd) ||
    quote.effectiveExitPriceUsd <= 0
  ) {
    reasons.push("EFFECTIVE_EXIT_PRICE_UNAVAILABLE")
  }
  if (
    quote.estimatedExitFeeUsd === null ||
    !Number.isFinite(quote.estimatedExitFeeUsd) ||
    quote.estimatedExitFeeUsd < 0
  ) {
    reasons.push("EXIT_FEE_UNAVAILABLE")
  }
  if (
    quote.estimatedExitPriceImpactPct === null ||
    !Number.isFinite(quote.estimatedExitPriceImpactPct) ||
    quote.estimatedExitPriceImpactPct < 0
  ) {
    reasons.push("EXIT_PRICE_IMPACT_UNAVAILABLE")
  }
  for (const reason of quote.blockingReasons) {
    reasons.push(`QUOTE:${reason}`)
  }

  const blockingReasons = [...new Set(reasons)]
  if (blockingReasons.length > 0) {
    return {
      simulationOnly: true as const,
      status: "BLOCKED" as const,
      blockingReasons,
      position,
      state,
    }
  }

  const observed = observeShadowPrice(
    position,
    adapted.currentReferenceUsd!
  )
  const grossExitProceedsUsd =
    basis.simulatedTokenUnits * quote.effectiveExitPriceUsd!
  const totalFeesUsd =
    basis.estimatedEntryFeeUsd + quote.estimatedExitFeeUsd!
  const realizedPnlUsd =
    grossExitProceedsUsd - basis.requestedNotionalUsd - totalFeesUsd
  const closed = {
    ...observed,
    status: "CLOSED" as const,
    closedAt: input.closedAt,
    exitReferenceUsd: adapted.currentReferenceUsd!,
    estimatedExitSlippagePct: quote.estimatedExitPriceImpactPct!,
    estimatedFeesUsd: totalFeesUsd,
    realizedPnlUsd,
    realizedPnlPct:
      (realizedPnlUsd / basis.requestedNotionalUsd) * 100,
    evidenceRefs: [
      ...observed.evidenceRefs,
      structuredClone(adapted.evidence),
    ],
  }
  const next = await persistShadowSimulationTransition(
    portfolioStore,
    closed,
    {
      updatedAt: input.closedAt,
      expectedRevision: state.portfolio.revision,
    }
  )

  return {
    simulationOnly: true as const,
    status: "CLOSED" as const,
    blockingReasons: [] as const,
    position: closed,
    executionBasis: basis,
    grossExitProceedsUsd,
    realizedPnlUsd,
    state: next,
  }
}
