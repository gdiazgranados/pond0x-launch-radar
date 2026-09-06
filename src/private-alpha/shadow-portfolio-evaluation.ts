import {
  SHADOW_TOKENS,
  type ShadowPosition,
  type ShadowToken,
} from "./shadow-portfolio"

type PerformanceSlice = {
  positions: number
  closed: number
  wins: number
  netPnlUsd: number
}

export type ShadowPortfolioEvaluation = {
  totalProposals: number
  openedSimulations: number
  closedSimulations: number
  winRatePct: number | null
  grossPnlUsd: number
  netPnlUsd: number
  maximumDrawdownUsd: number
  averageRoundTripSlippagePct: number | null
  byToken: Record<ShadowToken, PerformanceSlice>
  byRuleVersion: Record<string, PerformanceSlice>
  invalidationCount: number
  invalidationReasons: Record<string, number>
  noActionBaselinePnlUsd: 0
  excessVsNoActionUsd: number
}

function emptySlice(): PerformanceSlice {
  return {
    positions: 0,
    closed: 0,
    wins: 0,
    netPnlUsd: 0,
  }
}

function grossPnl(position: ShadowPosition) {
  if (
    position.status !== "CLOSED" ||
    position.exitReferenceUsd === null
  ) {
    return 0
  }

  return (
    ((position.exitReferenceUsd - position.entryReferenceUsd) /
      position.entryReferenceUsd) *
    position.notionalUsd
  )
}

function maximumDrawdown(closed: ReadonlyArray<ShadowPosition>) {
  const ordered = [...closed].sort((left, right) =>
    left.closedAt!.localeCompare(right.closedAt!)
  )
  let cumulative = 0
  let peak = 0
  let maximum = 0

  for (const position of ordered) {
    cumulative += position.realizedPnlUsd!
    peak = Math.max(peak, cumulative)
    maximum = Math.max(maximum, peak - cumulative)
  }

  return maximum
}

function addToSlice(
  slice: PerformanceSlice,
  position: ShadowPosition
) {
  slice.positions += 1

  if (
    position.status === "CLOSED" &&
    position.realizedPnlUsd !== null
  ) {
    slice.closed += 1
    slice.netPnlUsd += position.realizedPnlUsd
    if (position.realizedPnlUsd > 0) slice.wins += 1
  }
}

export function evaluateShadowPortfolio(
  positions: ReadonlyArray<ShadowPosition>
): ShadowPortfolioEvaluation {
  const ids = new Set<string>()
  for (const position of positions) {
    if (ids.has(position.positionId)) {
      throw new Error(`duplicate positionId: ${position.positionId}`)
    }
    ids.add(position.positionId)
  }

  const closed = positions.filter(
    (position) =>
      position.status === "CLOSED" &&
      position.closedAt !== null &&
      position.realizedPnlUsd !== null &&
      position.realizedPnlPct !== null
  )
  const opened = positions.filter(
    (position) => position.openedAt !== null
  )
  const invalidated = positions.filter(
    (position) => position.status === "INVALIDATED"
  )

  const byToken = Object.fromEntries(
    SHADOW_TOKENS.map((token) => [token, emptySlice()])
  ) as Record<ShadowToken, PerformanceSlice>
  const byRuleVersion: Record<string, PerformanceSlice> = {}
  const invalidationReasons: Record<string, number> = {}

  for (const position of positions) {
    addToSlice(byToken[position.tokenId], position)

    const ruleSlice =
      byRuleVersion[position.ruleVersion] ?? emptySlice()
    addToSlice(ruleSlice, position)
    byRuleVersion[position.ruleVersion] = ruleSlice

    if (position.status === "INVALIDATED") {
      const reason =
        position.invalidationReason?.trim() || "UNSPECIFIED"
      invalidationReasons[reason] =
        (invalidationReasons[reason] ?? 0) + 1
    }
  }

  const grossPnlUsd = closed.reduce(
    (total, position) => total + grossPnl(position),
    0
  )
  const netPnlUsd = closed.reduce(
    (total, position) => total + position.realizedPnlUsd!,
    0
  )
  const totalRoundTripSlippage = closed.reduce(
    (total, position) =>
      total +
      position.estimatedEntrySlippagePct +
      position.estimatedExitSlippagePct!,
    0
  )
  const wins = closed.filter(
    (position) => position.realizedPnlUsd! > 0
  ).length

  return {
    totalProposals: positions.length,
    openedSimulations: opened.length,
    closedSimulations: closed.length,
    winRatePct:
      closed.length === 0 ? null : (wins / closed.length) * 100,
    grossPnlUsd,
    netPnlUsd,
    maximumDrawdownUsd: maximumDrawdown(closed),
    averageRoundTripSlippagePct:
      closed.length === 0
        ? null
        : totalRoundTripSlippage / closed.length,
    byToken,
    byRuleVersion,
    invalidationCount: invalidated.length,
    invalidationReasons,
    noActionBaselinePnlUsd: 0,
    excessVsNoActionUsd: netPnlUsd,
  }
}
