export const SHADOW_TOKENS = ["PNDC", "PORK", "wPOND", "PAPER"] as const

export type ShadowToken = (typeof SHADOW_TOKENS)[number]
export type ShadowChain = "ETHEREUM" | "SOLANA"
export type ShadowPositionStatus =
  | "PROPOSED"
  | "OPEN"
  | "CLOSED"
  | "INVALIDATED"

export type MarketEvidence = {
  observedAt: string
  baselineObservedAt: string
  currentPairAddress: string
  baselinePairAddress: string
  marketContinuity: "SAME_PAIR" | "POOL_CHANGED" | "UNKNOWN"
  currentLiquidityUsd: number | null
  rollingVolumeUsd: number | null
  requestedLookbackHours: number
  actualLookbackHours: number | null
  sourceFresh: boolean
  anomalies: ReadonlyArray<{
    code: string
    blocking: boolean
  }>
  estimatedPriceImpactPct: number | null
}

export type ShadowPosition = {
  positionId: string
  tokenId: ShadowToken
  chain: ShadowChain
  side: "LONG"
  status: ShadowPositionStatus
  openedAt: string | null
  closedAt: string | null
  entryReferenceUsd: number
  exitReferenceUsd: number | null
  notionalUsd: number
  estimatedEntrySlippagePct: number
  estimatedExitSlippagePct: number | null
  estimatedFeesUsd: number
  realizedPnlUsd: number | null
  realizedPnlPct: number | null
  maxAdverseExcursionPct: number
  maxFavorableExcursionPct: number
  evidenceRefs: ReadonlyArray<MarketEvidence>
  ruleVersion: string
  invalidationReason: string | null
  operatorNote: string | null
}

export type ProposalInput = Pick<
  ShadowPosition,
  | "positionId"
  | "tokenId"
  | "chain"
  | "entryReferenceUsd"
  | "notionalUsd"
  | "estimatedEntrySlippagePct"
  | "estimatedFeesUsd"
  | "ruleVersion"
  | "operatorNote"
> & {
  evidence: MarketEvidence
}

const TOKEN_CHAIN: Record<ShadowToken, ShadowChain> = {
  PNDC: "ETHEREUM",
  PORK: "ETHEREUM",
  wPOND: "SOLANA",
  PAPER: "SOLANA",
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function finiteNonNegative(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0
}

function validTimestamp(value: string) {
  return Number.isFinite(Date.parse(value))
}

export function evidenceBlockingReasons(evidence: MarketEvidence) {
  const reasons: string[] = []

  if (!validTimestamp(evidence.observedAt)) reasons.push("INVALID_CURRENT_TIMESTAMP")
  if (!validTimestamp(evidence.baselineObservedAt)) reasons.push("INVALID_BASELINE_TIMESTAMP")
  if (!evidence.sourceFresh) reasons.push("STALE_SOURCE")
  if (evidence.marketContinuity !== "SAME_PAIR") reasons.push("PAIR_NOT_COMPARABLE")
  if (
    !evidence.currentPairAddress ||
    evidence.currentPairAddress !== evidence.baselinePairAddress
  ) {
    reasons.push("PAIR_ADDRESS_MISMATCH")
  }
  if (!finitePositive(evidence.currentLiquidityUsd ?? 0)) {
    reasons.push("EXECUTABLE_LIQUIDITY_UNAVAILABLE")
  }
  if (!finiteNonNegative(evidence.rollingVolumeUsd)) {
    reasons.push("ROLLING_VOLUME_UNAVAILABLE")
  }
  if (!finitePositive(evidence.requestedLookbackHours)) {
    reasons.push("INVALID_REQUESTED_LOOKBACK")
  }
  if (!finitePositive(evidence.actualLookbackHours ?? 0)) {
    reasons.push("LOOKBACK_UNAVAILABLE")
  }
  if (!finiteNonNegative(evidence.estimatedPriceImpactPct)) {
    reasons.push("PRICE_IMPACT_UNAVAILABLE")
  }

  for (const anomaly of evidence.anomalies) {
    if (anomaly.blocking) reasons.push(`ANOMALY:${anomaly.code}`)
  }

  return [...new Set(reasons)]
}

export function createShadowProposal(input: ProposalInput): ShadowPosition {
  if (!input.positionId.trim()) throw new Error("positionId is required")
  if (!input.ruleVersion.trim()) throw new Error("ruleVersion is required")
  if (TOKEN_CHAIN[input.tokenId] !== input.chain) {
    throw new Error("token and chain do not match")
  }
  if (!finitePositive(input.entryReferenceUsd)) {
    throw new Error("entryReferenceUsd must be positive")
  }
  if (!finitePositive(input.notionalUsd)) {
    throw new Error("notionalUsd must be positive")
  }
  if (!finiteNonNegative(input.estimatedEntrySlippagePct)) {
    throw new Error("estimatedEntrySlippagePct must be non-negative")
  }
  if (!finiteNonNegative(input.estimatedFeesUsd)) {
    throw new Error("estimatedFeesUsd must be non-negative")
  }

  return {
    positionId: input.positionId,
    tokenId: input.tokenId,
    chain: input.chain,
    side: "LONG",
    status: "PROPOSED",
    openedAt: null,
    closedAt: null,
    entryReferenceUsd: input.entryReferenceUsd,
    exitReferenceUsd: null,
    notionalUsd: input.notionalUsd,
    estimatedEntrySlippagePct: input.estimatedEntrySlippagePct,
    estimatedExitSlippagePct: null,
    estimatedFeesUsd: input.estimatedFeesUsd,
    realizedPnlUsd: null,
    realizedPnlPct: null,
    maxAdverseExcursionPct: 0,
    maxFavorableExcursionPct: 0,
    evidenceRefs: [structuredClone(input.evidence)],
    ruleVersion: input.ruleVersion,
    invalidationReason: null,
    operatorNote: input.operatorNote,
  }
}

export function openShadowPosition(
  proposal: ShadowPosition,
  openedAt: string
): ShadowPosition {
  if (proposal.status !== "PROPOSED") {
    throw new Error("only a proposed position can be opened")
  }
  if (!validTimestamp(openedAt)) throw new Error("openedAt must be valid")

  const reasons = evidenceBlockingReasons(proposal.evidenceRefs[0])
  if (reasons.length > 0) {
    throw new Error(`proposal evidence is blocked: ${reasons.join(",")}`)
  }

  return {
    ...proposal,
    status: "OPEN",
    openedAt,
  }
}

export function invalidateShadowPosition(
  position: ShadowPosition,
  reason: string
): ShadowPosition {
  if (position.status === "CLOSED" || position.status === "INVALIDATED") {
    throw new Error("terminal position cannot be invalidated")
  }
  if (!reason.trim()) throw new Error("invalidation reason is required")

  return {
    ...position,
    status: "INVALIDATED",
    invalidationReason: reason.trim(),
  }
}

export type ClosePositionInput = {
  closedAt: string
  exitReferenceUsd: number
  estimatedExitSlippagePct: number
  additionalFeesUsd: number
  evidence: MarketEvidence
}

export function observeShadowPrice(
  position: ShadowPosition,
  referenceUsd: number
): ShadowPosition {
  if (position.status !== "OPEN") {
    throw new Error("only an open position can observe price")
  }
  if (!finitePositive(referenceUsd)) {
    throw new Error("referenceUsd must be positive")
  }

  const changePct =
    ((referenceUsd - position.entryReferenceUsd) /
      position.entryReferenceUsd) *
    100

  return {
    ...position,
    maxAdverseExcursionPct: Math.max(
      position.maxAdverseExcursionPct,
      Math.max(0, -changePct)
    ),
    maxFavorableExcursionPct: Math.max(
      position.maxFavorableExcursionPct,
      Math.max(0, changePct)
    ),
  }
}

export function closeShadowPosition(
  position: ShadowPosition,
  input: ClosePositionInput
): ShadowPosition {
  if (position.status !== "OPEN" || !position.openedAt) {
    throw new Error("only an open position can be closed")
  }
  if (
    !validTimestamp(input.closedAt) ||
    Date.parse(input.closedAt) < Date.parse(position.openedAt)
  ) {
    throw new Error("closedAt must be valid and after openedAt")
  }
  if (!finitePositive(input.exitReferenceUsd)) {
    throw new Error("exitReferenceUsd must be positive")
  }
  if (!finiteNonNegative(input.estimatedExitSlippagePct)) {
    throw new Error("estimatedExitSlippagePct must be non-negative")
  }
  if (!finiteNonNegative(input.additionalFeesUsd)) {
    throw new Error("additionalFeesUsd must be non-negative")
  }

  const reasons = evidenceBlockingReasons(input.evidence)
  const entryPair = position.evidenceRefs[0]?.currentPairAddress
  if (input.evidence.currentPairAddress !== entryPair) {
    reasons.push("ENTRY_EXIT_PAIR_MISMATCH")
  }
  if (reasons.length > 0) {
    throw new Error(`exit evidence is blocked: ${[...new Set(reasons)].join(",")}`)
  }

  const grossPnlUsd =
    ((input.exitReferenceUsd - position.entryReferenceUsd) /
      position.entryReferenceUsd) *
    position.notionalUsd
  const slippageUsd =
    (position.notionalUsd *
      (position.estimatedEntrySlippagePct +
        input.estimatedExitSlippagePct)) /
    100
  const totalFeesUsd =
    position.estimatedFeesUsd + input.additionalFeesUsd
  const realizedPnlUsd = grossPnlUsd - slippageUsd - totalFeesUsd

  return {
    ...position,
    status: "CLOSED",
    closedAt: input.closedAt,
    exitReferenceUsd: input.exitReferenceUsd,
    estimatedExitSlippagePct: input.estimatedExitSlippagePct,
    estimatedFeesUsd: totalFeesUsd,
    realizedPnlUsd,
    realizedPnlPct: (realizedPnlUsd / position.notionalUsd) * 100,
    evidenceRefs: [
      ...position.evidenceRefs,
      structuredClone(input.evidence),
    ],
  }
}
