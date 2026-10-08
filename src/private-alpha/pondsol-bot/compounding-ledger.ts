
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

  const initialCents = Math.round(CONFIG.initialCapitalUsd * 100)
  const existingEquity = ledger.operatingCapitalCents + ledger.reservedProfitCents
  const expectedEquity = initialCents + ledger.totalRealizedPnlCents
  if (
    !Number.isSafeInteger(ledger.operatingCapitalCents) ||
    !Number.isSafeInteger(ledger.reservedProfitCents) ||
    !Number.isSafeInteger(ledger.totalRealizedPnlCents) ||
    !Number.isSafeInteger(ledger.completedTrades) ||
    ledger.operatingCapitalCents < 0 ||
    ledger.reservedProfitCents < 0 ||
    ledger.completedTrades < 0 ||
    !Number.isSafeInteger(existingEquity) ||
    !Number.isSafeInteger(expectedEquity) ||
    existingEquity !== expectedEquity
  ) {
    throw new Error("INVALID_LEDGER_BALANCE")
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

  const totalRealizedPnlCents = ledger.totalRealizedPnlCents + pnlCents
  const completedTrades = ledger.completedTrades + 1
  const equity = operatingCapitalCents + reservedProfitCents
  const expectedNewEquity = initialCents + totalRealizedPnlCents
  if (
    !Number.isSafeInteger(operatingCapitalCents) ||
    !Number.isSafeInteger(reservedProfitCents) ||
    !Number.isSafeInteger(totalRealizedPnlCents) ||
    !Number.isSafeInteger(completedTrades) ||
    !Number.isSafeInteger(equity) ||
    !Number.isSafeInteger(expectedNewEquity) ||
    equity !== expectedNewEquity
  ) {
    throw new Error("LEDGER_OVERFLOW_OR_IMBALANCE")
  }
  return {
    operatingCapitalCents,
    reservedProfitCents,
    totalRealizedPnlCents,
    completedTrades,
  }
}
