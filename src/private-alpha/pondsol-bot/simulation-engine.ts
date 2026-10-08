
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
  pendingReconciliationTradeId?: string
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
  // Fail closed when a previous settlement requires reconciliation.
  if (state.pendingReconciliationTradeId !== undefined) {
    return reject(state, "SIMULATION_RECONCILIATION_REQUIRED")
  }

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

    return {
      accepted: true,
      reasons: [],
      result: settled.result,
      state: {
        ledger: settled.ledger,
        dailyPnlCents: state.dailyPnlCents + pnlCents,
        processedTradeIds: [...state.processedTradeIds, tradeId],
        pendingReconciliationTradeId:
          state.pendingReconciliationTradeId,
      },
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INSUFFICIENT_OPERATING_CAPITAL"
    ) {
      return {
        accepted: false,
        reasons: ["SIMULATION_CAPITAL_EXCEEDED"],
        state: {
          ...state,
          pendingReconciliationTradeId: tradeId,
        },
      }
    }

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
