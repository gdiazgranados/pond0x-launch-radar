
import { PONDSOL_RISK_CONFIG as CONFIG } from "./risk-config"

export type CompoundingLedger = {
  operatingCapitalCents: number
  reservedProfitCents: number
  totalRealizedPnlCents: number
  completedTrades: number
}

export function createCompoundingLedger(): CompoundingLedger {
  return {
    operatingCapitalCents: Math.round(CONFIG.initialCapitalUsd * 100),
    reservedProfitCents: 0,
    totalRealizedPnlCents: 0,
    completedTrades: 0,
  }
}

export function recordClosedTrade(
  ledger: CompoundingLedger,
  netPnlUsd: number
): CompoundingLedger {
  if (!Number.isFinite(netPnlUsd)) {
    throw new Error("INVALID_NET_PNL")
  }

  const pnlCents = Math.round(netPnlUsd * 100)

  if (pnlCents === 0 && netPnlUsd !== 0) {
    throw new Error("PNL_BELOW_ACCOUNTING_PRECISION")
  }

  if (!Number.isSafeInteger(pnlCents)) {
    throw new Error("PNL_OUT_OF_RANGE")
  }

  let operatingCapitalCents = ledger.operatingCapitalCents
  let reservedProfitCents = ledger.reservedProfitCents

  if (pnlCents > 0) {
    const reinvestedCents = Math.round(
      pnlCents * CONFIG.reinvestmentRate
    )

    operatingCapitalCents += reinvestedCents
    reservedProfitCents += pnlCents - reinvestedCents
  } else {
    operatingCapitalCents += pnlCents
  }

  if (operatingCapitalCents < 0) {
    throw new Error("INSUFFICIENT_OPERATING_CAPITAL")
  }

  return {
    operatingCapitalCents,
    reservedProfitCents,
    totalRealizedPnlCents:
      ledger.totalRealizedPnlCents + pnlCents,
    completedTrades: ledger.completedTrades + 1,
  }
}
