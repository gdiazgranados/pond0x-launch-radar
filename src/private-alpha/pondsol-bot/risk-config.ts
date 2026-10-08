export const PONDSOL_RISK_CONFIG = Object.freeze({
  mode: "SIMULATION" as const,
  liveTradingEnabled: false,

  initialCapitalUsd: 50,
  maxTradeUsd: 10,
  maxDailyLossUsd: 2.50,
  maxTotalLossUsd: 5,

  maxOpenPositions: 1,

  reinvestmentRate: 0.75,
  profitReserveRate: 0.25,

  minEstimatedNetProfitPct: 1,
  maxQuoteAgeSeconds: 30,
})

export type PondsolRiskConfig =
  typeof PONDSOL_RISK_CONFIG

export function validateRiskConfig(
  config: PondsolRiskConfig
): void {
  if (
    config.mode !== "SIMULATION" ||
    config.liveTradingEnabled !== false
  ) {
    throw new Error("LIVE_TRADING_DISABLED")
  }

  if (
    config.initialCapitalUsd <= 0 ||
    config.maxTradeUsd <= 0 ||
    config.maxTradeUsd > config.initialCapitalUsd
  ) {
    throw new Error("INVALID_CAPITAL_LIMITS")
  }

  if (
    config.maxDailyLossUsd <= 0 ||
    config.maxTotalLossUsd <= 0 ||
    config.maxOpenPositions !== 1
  ) {
    throw new Error("INVALID_RISK_LIMITS")
  }

  if (
    config.reinvestmentRate !== 0.75 ||
    config.profitReserveRate !== 0.25 ||
    config.reinvestmentRate +
      config.profitReserveRate !== 1
  ) {
    throw new Error("INVALID_COMPOUNDING_POLICY")
  }

  if (
    config.minEstimatedNetProfitPct <= 0 ||
    config.maxQuoteAgeSeconds <= 0
  ) {
    throw new Error("INVALID_EXECUTION_THRESHOLDS")
  }
}

validateRiskConfig(PONDSOL_RISK_CONFIG)
