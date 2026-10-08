
import {
  createCompoundingLedger,
  recordClosedTrade,
  type CompoundingLedger,
} from "./compounding-ledger"

import {
  createPositionState,
  openPosition,
  closePosition,
  type PositionState,
} from "./position-state"

import {
  evaluateTradeGuard,
  type GuardedTradeRequest,
} from "./trade-guard"

import {
  simulateClosedTrade,
  type SimulatedTrade,
} from "./trade-simulator"

import {
  calculateCapitalSnapshot,
} from "./capital-accounting"

export type PositionEngine = {
  ledger: CompoundingLedger
  positions: PositionState
  dailyPnlCents: number
}

export function createPositionEngine(): PositionEngine {
  return {
    ledger: createCompoundingLedger(),
    positions: createPositionState(),
    dailyPnlCents: 0,
  }
}

export function enterSimulatedPosition(
  engine: PositionEngine,
  tradeId: string,
  tradeUsd: number,
  guard: Omit<GuardedTradeRequest, "state" | "tradeUsd">,
  openedAtUtc: string
): PositionEngine {
  const decision = evaluateTradeGuard({
    ...guard,
    tradeUsd,
    state: {
availableCapitalUsd:
  calculateCapitalSnapshot(
    engine.ledger,
    engine.positions
  ).availableCapitalCents / 100,
      dailyPnlUsd: engine.dailyPnlCents / 100,
      totalPnlUsd:
        engine.ledger.totalRealizedPnlCents / 100,
      openPositions:
        engine.positions.openPosition === null ? 0 : 1,
    },
  })

  if (!decision.allowed) {
    throw new Error(
      `TRADE_BLOCKED:${decision.blockingReasons.join(",")}`
    )
  }

  const investedCents = Math.round(tradeUsd * 100)

  if (
    !Number.isSafeInteger(investedCents) ||
    investedCents <= 0
  ) {
    throw new Error("INVALID_POSITION_PRECISION")
  }

  return {
    ...engine,
    positions: openPosition(engine.positions, {
      tradeId,
      investedCents,
      openedAtUtc,
    }),
  }
}

export function exitSimulatedPosition(
  engine: PositionEngine,
  tradeId: string,
  exit: Omit<SimulatedTrade, "tradeUsd">
): PositionEngine {
  const position = engine.positions.openPosition

  if (!position || position.tradeId !== tradeId) {
    throw new Error("POSITION_NOT_FOUND")
  }

  const result = simulateClosedTrade({
    ...exit,
    tradeUsd: position.investedCents / 100,
  })

  const updatedLedger = recordClosedTrade(
    engine.ledger,
    result.netPnlUsd
  )

  return {
    ledger: updatedLedger,
    positions: closePosition(engine.positions, tradeId),
    dailyPnlCents:
      engine.dailyPnlCents +
      Math.round(result.netPnlUsd * 100),
  }
}
