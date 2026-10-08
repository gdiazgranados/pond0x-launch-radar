
import assert from "node:assert/strict"
import test from "node:test"

import {
  createSimulationEngine,
  processSimulatedTrade,
} from "../../../src/private-alpha/pondsol-bot/simulation-engine"

const profitableTrade = {
  tradeUsd: 10,
  exitValueUsd: 10.50,
  entryFeeUsd: 0.05,
  exitFeeUsd: 0.05,
  networkCostUsd: 0.02,
}

const guard = {
  estimatedNetProfitPct: 3.8,
  quoteAgeSeconds: 5,
  worstCaseLossUsd: 1,
}

test("processes a profitable simulated trade", () => {
  const initial = createSimulationEngine()

  const outcome = processSimulatedTrade(
    initial,
    "trade-001",
    profitableTrade,
    guard
  )

  assert.equal(outcome.accepted, true)
  assert.equal(outcome.state.ledger.operatingCapitalCents, 5029)
  assert.equal(outcome.state.ledger.reservedProfitCents, 9)
  assert.equal(outcome.state.dailyPnlCents, 38)
})

test("rejects duplicate trade IDs", () => {
  const initial = createSimulationEngine()

  const first = processSimulatedTrade(
    initial,
    "trade-001",
    profitableTrade,
    guard
  )

  const second = processSimulatedTrade(
    first.state,
    "trade-001",
    profitableTrade,
    guard
  )

  assert.equal(second.accepted, false)
  assert.ok(second.reasons.includes("DUPLICATE_TRADE"))
  assert.equal(second.state.ledger.completedTrades, 1)
})

test("rejects a trade exceeding projected loss limits", () => {
  const initial = createSimulationEngine()

  const outcome = processSimulatedTrade(
    initial,
    "trade-002",
    profitableTrade,
    {
      ...guard,
      worstCaseLossUsd: 3,
    }
  )

  assert.equal(outcome.accepted, false)
  assert.ok(
    outcome.reasons.includes("PROJECTED_DAILY_LOSS_LIMIT")
  )
})


test("records realized losses above the estimate", () => {
  const initial = createSimulationEngine()

  const outcome = processSimulatedTrade(
    initial,
    "trade-003",
    {
      ...profitableTrade,
      exitValueUsd: 8,
    },
    guard
  )

  // Actual losses must be recorded, even when
  // they exceed the original risk estimate.
  assert.equal(outcome.accepted, true)
  assert.deepEqual(outcome.reasons, [])

  // $8 exit - $10 entry - $0.12 costs = -$2.12
  assert.equal(outcome.state.dailyPnlCents, -212)
  assert.equal(
    outcome.state.ledger.totalRealizedPnlCents,
    -212
  )
  assert.equal(
    outcome.state.ledger.operatingCapitalCents,
    4788
  )
  assert.equal(outcome.state.ledger.completedTrades, 1)
  assert.deepEqual(outcome.state.processedTradeIds, [
    "trade-003",
  ])

  // The same trade cannot be recorded twice.
  const duplicate = processSimulatedTrade(
    outcome.state,
    "trade-003",
    {
      ...profitableTrade,
      exitValueUsd: 8,
    },
    guard
  )

  assert.equal(duplicate.accepted, false)
  assert.ok(duplicate.reasons.includes("DUPLICATE_TRADE"))
  assert.deepEqual(duplicate.state, outcome.state)
})

test("blocks new trades when realized losses exhaust daily risk budget", () => {
  const initial = createSimulationEngine()

  // First trade loses $2.12, exceeding its $1 estimate.
  const first = processSimulatedTrade(
    initial,
    "daily-loss-001",
    {
      ...profitableTrade,
      exitValueUsd: 8,
    },
    guard
  )

  assert.equal(first.accepted, true)
  assert.equal(first.state.dailyPnlCents, -212)

  // Remaining daily loss budget: $0.38.
  // A new trade with $1 projected loss must be blocked.
  const second = processSimulatedTrade(
    first.state,
    "daily-loss-002",
    profitableTrade,
    guard
  )

  assert.equal(second.accepted, false)
  assert.ok(
    second.reasons.includes("PROJECTED_DAILY_LOSS_LIMIT")
  )

  // Rejection must not change capital or trade history.
  assert.deepEqual(second.state, first.state)
  assert.equal(second.state.ledger.completedTrades, 1)
})

test("blocks new trades when total loss budget is exhausted", () => {
  const initial = createSimulationEngine()

  // Simulate accumulated losses of $4.50.
  const state = structuredClone(initial)

  state.ledger.operatingCapitalCents = 4550
  state.ledger.totalRealizedPnlCents = -450
  state.dailyPnlCents = 0

  // A new trade risking $1 would exceed
  // the remaining total loss budget of $0.50.
  const outcome = processSimulatedTrade(
    state,
    "total-loss-001",
    profitableTrade,
    guard
  )

  assert.equal(outcome.accepted, false)

  assert.ok(
    outcome.reasons.includes("PROJECTED_TOTAL_LOSS_LIMIT")
  )

  // Rejection must preserve the original state.
  assert.deepEqual(outcome.state, state)
  assert.equal(outcome.state.ledger.completedTrades, 0)
})


test("blocks subsequent trades after an insolvent settlement", () => {
  const initial = createSimulationEngine()

  const outcome = processSimulatedTrade(
    initial,
    "insolvent-001",
    {
      tradeUsd: 10,
      exitValueUsd: 0,
      entryFeeUsd: 20,
      exitFeeUsd: 20,
      networkCostUsd: 15,
    },
    guard
  )

  assert.equal(outcome.accepted, false)
  assert.deepEqual(outcome.reasons, [
    "SIMULATION_CAPITAL_EXCEEDED",
  ])

  assert.deepEqual(outcome.state.ledger, initial.ledger)
  assert.equal(outcome.state.dailyPnlCents, 0)
  assert.deepEqual(outcome.state.processedTradeIds, [])
  assert.equal(
    outcome.state.pendingReconciliationTradeId,
    "insolvent-001"
  )

  const next = processSimulatedTrade(
    outcome.state,
    "trade-after-insolvency",
    profitableTrade,
    guard
  )

  assert.equal(next.accepted, false)
  assert.deepEqual(next.reasons, [
    "SIMULATION_RECONCILIATION_REQUIRED",
  ])
  assert.deepEqual(next.state, outcome.state)
})
