
import assert from "node:assert/strict"
import test from "node:test"

import {
  createPositionEngine,
  enterSimulatedPosition,
  exitSimulatedPosition,
} from "../../../src/private-alpha/pondsol-bot/position-engine"

const guard = {
  estimatedNetProfitPct: 2,
  quoteAgeSeconds: 5,
  worstCaseLossUsd: 1,
}

const openedAt = "2026-10-07T20:00:00Z"

test("opens a position", () => {
  const engine = enterSimulatedPosition(
    createPositionEngine(),
    "trade-001",
    10,
    guard,
    openedAt
  )

  assert.equal(engine.positions.openPosition?.investedCents, 1000)
})

test("blocks a second position", () => {
  const engine = enterSimulatedPosition(
    createPositionEngine(),
    "trade-001",
    10,
    guard,
    openedAt
  )

  assert.throws(
    () => enterSimulatedPosition(
      engine,
      "trade-002",
      10,
      guard,
      openedAt
    ),
    /TRADE_BLOCKED/
  )
})

test("records a profitable close", () => {
  const opened = enterSimulatedPosition(
    createPositionEngine(),
    "trade-001",
    10,
    guard,
    openedAt
  )

  const closed = exitSimulatedPosition(opened, "trade-001", {
    exitValueUsd: 10.50,
    entryFeeUsd: 0.05,
    exitFeeUsd: 0.05,
    networkCostUsd: 0.02,
  })

  assert.equal(closed.positions.openPosition, null)
  assert.equal(closed.ledger.operatingCapitalCents, 5029)
  assert.equal(closed.ledger.reservedProfitCents, 9)
  assert.equal(closed.dailyPnlCents, 38)
})

test("records losses above original estimate", () => {
  const opened = enterSimulatedPosition(
    createPositionEngine(),
    "trade-001",
    10,
    guard,
    openedAt
  )

  const closed = exitSimulatedPosition(opened, "trade-001", {
    exitValueUsd: 8,
    entryFeeUsd: 0.05,
    exitFeeUsd: 0.05,
    networkCostUsd: 0.02,
  })

  assert.equal(closed.ledger.operatingCapitalCents, 4788)
  assert.equal(closed.dailyPnlCents, -212)
  assert.equal(closed.ledger.completedTrades, 1)
})

test("prevents closing the same trade twice", () => {
  const opened = enterSimulatedPosition(
    createPositionEngine(),
    "trade-001",
    10,
    guard,
    openedAt
  )

  const closed = exitSimulatedPosition(opened, "trade-001", {
    exitValueUsd: 10.50,
    entryFeeUsd: 0.05,
    exitFeeUsd: 0.05,
    networkCostUsd: 0.02,
  })

  assert.throws(
    () => exitSimulatedPosition(closed, "trade-001", {
      exitValueUsd: 10.50,
      entryFeeUsd: 0.05,
      exitFeeUsd: 0.05,
      networkCostUsd: 0.02,
    }),
    /POSITION_NOT_FOUND/
  )
})

test("tracks committed capital during an open position", () => {
  const opened = enterSimulatedPosition(
    createPositionEngine(),
    "trade-capital-001",
    10,
    guard,
    openedAt
  )

  const committed =
    opened.positions.openPosition?.investedCents ?? 0

  const available =
    opened.ledger.operatingCapitalCents - committed

  assert.equal(committed, 1000)
  assert.equal(available, 4000)

  const closed = exitSimulatedPosition(
    opened,
    "trade-capital-001",
    {
      exitValueUsd: 10,
      entryFeeUsd: 0,
      exitFeeUsd: 0,
      networkCostUsd: 0,
    }
  )

  assert.equal(closed.positions.openPosition, null)
  assert.equal(closed.ledger.operatingCapitalCents, 5000)
})
