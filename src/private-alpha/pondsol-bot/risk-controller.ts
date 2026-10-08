
import { PONDSOL_RISK_CONFIG as CONFIG } from "./risk-config"

export type RiskState = {
  availableCapitalUsd: number
  dailyPnlUsd: number
  totalPnlUsd: number
  openPositions: number
}

export type RiskDecision = {
  allowed: boolean
  blockingReasons: string[]
}

export function evaluateTradeRisk(
  tradeUsd: number,
  estimatedNetProfitPct: number,
  quoteAgeSeconds: number,
  state: RiskState
): RiskDecision {
  const reasons: string[] = []

  // Validate trade size
  if (
    !Number.isFinite(tradeUsd) ||
    tradeUsd <= 0 ||
    tradeUsd > CONFIG.maxTradeUsd
  ) {
    reasons.push("INVALID_TRADE_SIZE")
  }

  // Verify available capital
  if (
    !Number.isFinite(state.availableCapitalUsd) ||
    state.availableCapitalUsd < 0 ||
    tradeUsd > state.availableCapitalUsd
  ) {
    reasons.push("INSUFFICIENT_CAPITAL")
  }

  // Check daily loss limit
  if (
    !Number.isFinite(state.dailyPnlUsd) ||
    state.dailyPnlUsd <= -CONFIG.maxDailyLossUsd
  ) {
    reasons.push("DAILY_LOSS_LIMIT")
  }

  // Check total loss limit
  if (
    !Number.isFinite(state.totalPnlUsd) ||
    state.totalPnlUsd <= -CONFIG.maxTotalLossUsd
  ) {
    reasons.push("TOTAL_LOSS_LIMIT")
  }

  // Allow only one open position
  if (
    !Number.isInteger(state.openPositions) ||
    state.openPositions < 0 ||
    state.openPositions >= CONFIG.maxOpenPositions
  ) {
    reasons.push("MAX_OPEN_POSITIONS")
  }

  // Require minimum estimated net profitability
  if (
    !Number.isFinite(estimatedNetProfitPct) ||
    estimatedNetProfitPct < CONFIG.minEstimatedNetProfitPct
  ) {
    reasons.push("INSUFFICIENT_ESTIMATED_PROFIT")
  }

  // Reject outdated quotes
  if (
    !Number.isFinite(quoteAgeSeconds) ||
    quoteAgeSeconds < 0 ||
    quoteAgeSeconds > CONFIG.maxQuoteAgeSeconds
  ) {
    reasons.push("STALE_QUOTE")
  }

  return {
    allowed: reasons.length === 0,
    blockingReasons: reasons,
  }
}
