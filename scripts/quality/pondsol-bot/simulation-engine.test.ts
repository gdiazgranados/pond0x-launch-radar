
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

test("rejects realized losses above the estimate", () => {
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

  assert.equal(outcome.accepted, false)
  assert.ok(outcome.reasons.includes("LOSS_EXCEEDS_ESTIMATE"))
  assert.equal(outcome.state.ledger.completedTrades, 0)
})
