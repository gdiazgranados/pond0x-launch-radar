
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

import {
  advanceDailyRiskClock,
  createDailyRiskClock,
  type DailyRiskClock,
} from "./daily-risk-clock"

export type PositionEngine = {
  ledger: CompoundingLedger
  positions: PositionState
  dailyPnlCents: number
  dailyRiskClock?: DailyRiskClock
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
  const synchronizedEngine = synchronizeTradingDay(
    engine,
    new Date(openedAtUtc)
  )
  const decision = evaluateTradeGuard({
  ...guard,
  tradeUsd,
  state: {
    availableCapitalUsd:
      calculateCapitalSnapshot(
        synchronizedEngine.ledger,
        synchronizedEngine.positions
      ).availableCapitalCents / 100,
    dailyPnlUsd:
      synchronizedEngine.dailyPnlCents / 100,
    totalPnlUsd:
      synchronizedEngine.ledger.totalRealizedPnlCents / 100,
    openPositions:
      synchronizedEngine.positions.openPosition === null
        ? 0
        : 1,
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
    ...synchronizedEngine,
    positions: openPosition(
      synchronizedEngine.positions,
      {
        tradeId,
        investedCents,
        openedAtUtc,
      }
    ),
  }
}


export function exitSimulatedPosition(
  engine: PositionEngine,
  tradeId: string,
  exit: Omit<SimulatedTrade, "tradeUsd">,
  closedAtUtc?: string
): PositionEngine {
  const synchronizedEngine = synchronizeTradingDay(
    engine,
    closedAtUtc
      ? new Date(closedAtUtc)
      : new Date()
  )

  const position = synchronizedEngine.positions.openPosition

  if (!position || position.tradeId !== tradeId) {
    throw new Error("POSITION_NOT_FOUND")
  }

    const closingTime = closedAtUtc
    ? new Date(closedAtUtc)
    : new Date()

  if (!Number.isFinite(closingTime.getTime())) {
    throw new Error("INVALID_CLOSE_TIME")
  }

  if (
    closingTime.getTime() <
    Date.parse(position.openedAtUtc)
  ) {
    throw new Error("CLOSE_BEFORE_OPEN")
  }

  const result = simulateClosedTrade({
    ...exit,
    tradeUsd: position.investedCents / 100,
  })

  const updatedLedger = recordClosedTrade(
    synchronizedEngine.ledger,
    result.netPnlUsd
  )

  const updatedDailyPnlCents =
    synchronizedEngine.dailyPnlCents +
    Math.round(result.netPnlUsd * 100)

  return {
    ...synchronizedEngine,
    ledger: updatedLedger,
    positions: closePosition(
      synchronizedEngine.positions,
      tradeId
    ),
    dailyPnlCents: updatedDailyPnlCents,
    dailyRiskClock: {
      tradingDayUtc:
        synchronizedEngine.dailyRiskClock!.tradingDayUtc,
      dailyPnlCents: updatedDailyPnlCents,
    },
  }
}
export function synchronizeTradingDay(
  engine: PositionEngine,
  now: Date
): PositionEngine {
  const clock = engine.dailyRiskClock

  if (!clock) {
    if (engine.dailyPnlCents !== 0) {
      throw new Error("MISSING_DAILY_RISK_CLOCK")
    }

    const initialClock = createDailyRiskClock(now)

    return {
      ...engine,
      dailyRiskClock: initialClock,
    }
  }

  if (clock.dailyPnlCents !== engine.dailyPnlCents) {
    throw new Error("DAILY_PNL_CLOCK_MISMATCH")
  }

  const updatedClock = advanceDailyRiskClock(clock, now)

  return {
    ...engine,
    dailyPnlCents: updatedClock.dailyPnlCents,
    dailyRiskClock: updatedClock,
  }
}