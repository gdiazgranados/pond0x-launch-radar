
import {
  evaluateTradeRisk,
  type RiskState,
  type RiskDecision,
} from "./risk-controller"

import { PONDSOL_RISK_CONFIG as CONFIG } from "./risk-config"

export type GuardedTradeRequest = {
  tradeUsd: number
  estimatedNetProfitPct: number
  quoteAgeSeconds: number
  worstCaseLossUsd: number
  state: RiskState
}

export function evaluateTradeGuard(
  request: GuardedTradeRequest
): RiskDecision {
  const base = evaluateTradeRisk(
    request.tradeUsd,
    request.estimatedNetProfitPct,
    request.quoteAgeSeconds,
    request.state
  )

  const reasons = [...base.blockingReasons]

  const loss = request.worstCaseLossUsd

  if (
    !Number.isFinite(loss) ||
    loss < 0 ||
    loss > request.tradeUsd
  ) {
    reasons.push("INVALID_WORST_CASE_LOSS")
  } else {
    const projectedDailyPnl =
      request.state.dailyPnlUsd - loss

    const projectedTotalPnl =
      request.state.totalPnlUsd - loss

    if (projectedDailyPnl < -CONFIG.maxDailyLossUsd) {
      reasons.push("PROJECTED_DAILY_LOSS_LIMIT")
    }

    if (projectedTotalPnl < -CONFIG.maxTotalLossUsd) {
      reasons.push("PROJECTED_TOTAL_LOSS_LIMIT")
    }
  }

  return {
    allowed: reasons.length === 0,
    blockingReasons: [...new Set(reasons)],
  }
}
