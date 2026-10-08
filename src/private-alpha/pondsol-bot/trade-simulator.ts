
import {
  CompoundingLedger,
  recordClosedTrade,
} from "./compounding-ledger"

export type SimulatedTrade = {
  tradeUsd: number
  exitValueUsd: number
  entryFeeUsd: number
  exitFeeUsd: number
  networkCostUsd: number
}

export type SimulationResult = {
  investedUsd: number
  grossExitUsd: number
  totalCostsUsd: number
  netPnlUsd: number
  netReturnPct: number
  profitable: boolean
}

export function simulateClosedTrade(
  trade: SimulatedTrade
): SimulationResult {
  const values = [
    trade.tradeUsd,
    trade.exitValueUsd,
    trade.entryFeeUsd,
    trade.exitFeeUsd,
    trade.networkCostUsd,
  ]

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("INVALID_TRADE_VALUES")
  }

  if (
    trade.tradeUsd <= 0 ||
    trade.exitValueUsd < 0 ||
    trade.entryFeeUsd < 0 ||
    trade.exitFeeUsd < 0 ||
    trade.networkCostUsd < 0
  ) {
    throw new Error("INVALID_TRADE_AMOUNTS")
  }

  const totalCostsUsd =
    trade.entryFeeUsd +
    trade.exitFeeUsd +
    trade.networkCostUsd

  const netPnlUsd =
    trade.exitValueUsd -
    trade.tradeUsd -
    totalCostsUsd

  return {
    investedUsd: trade.tradeUsd,
    grossExitUsd: trade.exitValueUsd,
    totalCostsUsd,
    netPnlUsd,
    netReturnPct: (netPnlUsd / trade.tradeUsd) * 100,
    profitable: netPnlUsd > 0,
  }
}

export function settleSimulatedTrade(
  ledger: CompoundingLedger,
  trade: SimulatedTrade
): {
  result: SimulationResult
  ledger: CompoundingLedger
} {
  const result = simulateClosedTrade(trade)

  return {
    result,
    ledger: recordClosedTrade(ledger, result.netPnlUsd),
  }
}
