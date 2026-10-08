
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createPositionEngine,
  synchronizeTradingDay,
  enterSimulatedPosition,
  exitSimulatedPosition,
} from "../../../src/private-alpha/pondsol-bot/position-engine"

import {
  createDailyRiskClock,
} from "../../../src/private-alpha/pondsol-bot/daily-risk-clock"

const DAY_ONE = new Date("2026-10-07T20:00:00Z")
const DAY_TWO = new Date("2026-10-08T01:00:00Z")

test("initializes the UTC clock without changing capital", () => {
  const original = createPositionEngine()
  const updated = synchronizeTradingDay(original, DAY_ONE)

  assert.equal(updated.dailyRiskClock?.tradingDayUtc, "2026-10-07")
  assert.equal(updated.dailyPnlCents, 0)
  assert.deepEqual(updated.ledger, original.ledger)
})

test("preserves daily losses during the same UTC day", () => {
  const engine = {
    ...createPositionEngine(),
    dailyPnlCents: -200,
    dailyRiskClock: createDailyRiskClock(DAY_ONE, -200),
  }

  const updated = synchronizeTradingDay(
    engine,
    new Date("2026-10-07T23:00:00Z")
  )

  assert.equal(updated.dailyPnlCents, -200)
})

test("resets daily PnL when the UTC day changes", () => {
  const engine = {
    ...createPositionEngine(),
    dailyPnlCents: -200,
    dailyRiskClock: createDailyRiskClock(DAY_ONE, -200),
  }

  const updated = synchronizeTradingDay(engine, DAY_TWO)

  assert.equal(updated.dailyPnlCents, 0)
  assert.equal(updated.dailyRiskClock?.tradingDayUtc, "2026-10-08")
  assert.equal(updated.ledger.totalRealizedPnlCents, 0)
})

test("preserves an open position across UTC midnight", () => {
  const original = createPositionEngine()

  const engine = {
    ...original,
    positions: {
      ...original.positions,
      openPosition: {
        tradeId: "overnight-001",
        investedCents: 1000,
        openedAtUtc: "2026-10-07T23:50:00Z",
      },
    },
    dailyRiskClock: createDailyRiskClock(DAY_ONE),
  }

  const updated = synchronizeTradingDay(engine, DAY_TWO)

  assert.deepEqual(
    updated.positions.openPosition,
    engine.positions.openPosition
  )
})

test("rejects missing clock when losses exist", () => {
  const engine = {
    ...createPositionEngine(),
    dailyPnlCents: -100,
  }

  assert.throws(
    () => synchronizeTradingDay(engine, DAY_ONE),
    /MISSING_DAILY_RISK_CLOCK/
  )
})

test("rejects mismatched clock and daily PnL", () => {
  const engine = {
    ...createPositionEngine(),
    dailyPnlCents: -200,
    dailyRiskClock: createDailyRiskClock(DAY_ONE, -100),
  }

  assert.throws(
    () => synchronizeTradingDay(engine, DAY_ONE),
    /DAILY_PNL_CLOCK_MISMATCH/
  )
})

test("rejects backwards UTC dates", () => {
  const engine = {
    ...createPositionEngine(),
    dailyRiskClock: createDailyRiskClock(DAY_TWO),
  }

  assert.throws(
    () => synchronizeTradingDay(engine, DAY_ONE),
    /TRADING_CLOCK_MOVED_BACKWARDS/
  )
})

test("records overnight losses on the UTC closing day", () => {
  const entered = enterSimulatedPosition(
    createPositionEngine(),
    "overnight-loss-001",
    10,
    {
      estimatedNetProfitPct: 2,
      quoteAgeSeconds: 5,
      worstCaseLossUsd: 1,
    },
    "2026-10-07T23:50:00Z"
  )

  const closed = exitSimulatedPosition(
    entered,
    "overnight-loss-001",
    {
      exitValueUsd: 9,
      entryFeeUsd: 0,
      exitFeeUsd: 0,
      networkCostUsd: 0,
    },
    "2026-10-08T00:10:00Z"
  )

  assert.equal(
    closed.dailyRiskClock?.tradingDayUtc,
    "2026-10-08"
  )
  assert.equal(closed.dailyPnlCents, -100)
  assert.equal(closed.dailyRiskClock?.dailyPnlCents, -100)
  assert.equal(closed.ledger.totalRealizedPnlCents, -100)
})

test("preserves the closing-day loss after synchronization", () => {
  const entered = enterSimulatedPosition(
    createPositionEngine(),
    "overnight-loss-002",
    10,
    {
      estimatedNetProfitPct: 2,
      quoteAgeSeconds: 5,
      worstCaseLossUsd: 1,
    },
    "2026-10-07T23:50:00Z"
  )

  const closed = exitSimulatedPosition(
    entered,
    "overnight-loss-002",
    {
      exitValueUsd: 9,
      entryFeeUsd: 0,
      exitFeeUsd: 0,
      networkCostUsd: 0,
    },
    "2026-10-08T00:10:00Z"
  )

  const restored = synchronizeTradingDay(
    closed,
    new Date("2026-10-08T12:00:00Z")
  )

  assert.equal(restored.dailyPnlCents, -100)
  assert.equal(restored.dailyRiskClock?.dailyPnlCents, -100)
})

test("rejects closing a position before its opening time", () => {
  const entered = enterSimulatedPosition(
    createPositionEngine(),
    "invalid-close-001",
    10,
    {
      estimatedNetProfitPct: 2,
      quoteAgeSeconds: 5,
      worstCaseLossUsd: 1,
    },
    "2026-10-07T20:00:00Z"
  )

  assert.throws(
    () =>
      exitSimulatedPosition(
        entered,
        "invalid-close-001",
        {
          exitValueUsd: 9,
          entryFeeUsd: 0,
          exitFeeUsd: 0,
          networkCostUsd: 0,
        },
        "2026-10-07T19:00:00Z"
      ),
    /CLOSE_BEFORE_OPEN/
  )
})
