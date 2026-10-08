
import {
  createCompoundingLedger,
  type CompoundingLedger,
} from "./compounding-ledger"

import {
  evaluateTradeGuard,
  type GuardedTradeRequest,
} from "./trade-guard"

import {
  settleSimulatedTrade,
  type SimulatedTrade,
  type SimulationResult,
} from "./trade-simulator"

export type SimulationEngineState = {
  ledger: CompoundingLedger
  dailyPnlCents: number
  processedTradeIds: string[]
}

export type SimulationOutcome = {
  accepted: boolean
  reasons: string[]
  state: SimulationEngineState
  result?: SimulationResult
}

export function createSimulationEngine(): SimulationEngineState {
  return {
    ledger: createCompoundingLedger(),
    dailyPnlCents: 0,
    processedTradeIds: [],
  }
}

export function processSimulatedTrade(
  state: SimulationEngineState,
  tradeId: string,
  trade: SimulatedTrade,
  guard: Omit<GuardedTradeRequest, "state" | "tradeUsd">
): SimulationOutcome {
  if (!tradeId.trim()) {
    return reject(state, "INVALID_TRADE_ID")
  }

  if (state.processedTradeIds.includes(tradeId)) {
    return reject(state, "DUPLICATE_TRADE")
  }

  // This engine models an already-closed hypothetical trade.
  // It does not execute orders or verify market fills.
  const risk = evaluateTradeGuard({
    ...guard,
    tradeUsd: trade.tradeUsd,
    state: {
      availableCapitalUsd:
        state.ledger.operatingCapitalCents / 100,
      dailyPnlUsd: state.dailyPnlCents / 100,
      totalPnlUsd:
        state.ledger.totalRealizedPnlCents / 100,
      openPositions: 0,
    },
  })

  if (!risk.allowed) {
    return {
      accepted: false,
      reasons: risk.blockingReasons,
      state,
    }
  }

  try {
    const settled = settleSimulatedTrade(state.ledger, trade)
    const pnlCents = Math.round(settled.result.netPnlUsd * 100)

    // Reject outcomes that exceed the configured loss budget.
    if (
      pnlCents < 0 &&
      -pnlCents > Math.round(guard.worstCaseLossUsd * 100)
    ) {
      return reject(state, "LOSS_EXCEEDS_ESTIMATE")
    }

    return {
      accepted: true,
      reasons: [],
      result: settled.result,
      state: {
        ledger: settled.ledger,
        dailyPnlCents: state.dailyPnlCents + pnlCents,
        processedTradeIds: [...state.processedTradeIds, tradeId],
      },
    }
  } catch {
    return reject(state, "SIMULATION_SETTLEMENT_FAILED")
  }
}

function reject(
  state: SimulationEngineState,
  reason: string
): SimulationOutcome {
  return {
    accepted: false,
    reasons: [reason],
    state,
  }
}
