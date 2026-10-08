
import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateTradeGuard,
  type GuardedTradeRequest,
} from "../../../src/private-alpha/pondsol-bot/trade-guard"

function validRequest(): GuardedTradeRequest {
  return {
    tradeUsd: 10,
    estimatedNetProfitPct: 2,
    quoteAgeSeconds: 5,
    worstCaseLossUsd: 1,
    state: {
      availableCapitalUsd: 50,
      dailyPnlUsd: 0,
      totalPnlUsd: 0,
      openPositions: 0,
    },
  }
}

test("accepts a trade within risk limits", () => {
  const result = evaluateTradeGuard(validRequest())
  assert.equal(result.allowed, true)
})

test("blocks projected daily loss", () => {
  const request = validRequest()
  request.state.dailyPnlUsd = -2

  const result = evaluateTradeGuard(request)

  assert.equal(result.allowed, false)
  assert.ok(
    result.blockingReasons.includes(
      "PROJECTED_DAILY_LOSS_LIMIT"
    )
  )
})

test("blocks projected total loss", () => {
  const request = validRequest()
  request.state.totalPnlUsd = -4.50

  const result = evaluateTradeGuard(request)

  assert.equal(result.allowed, false)
  assert.ok(
    result.blockingReasons.includes(
      "PROJECTED_TOTAL_LOSS_LIMIT"
    )
  )
})

test("blocks trades exceeding maximum size", () => {
  const request = validRequest()
  request.tradeUsd = 15

  const result = evaluateTradeGuard(request)

  assert.equal(result.allowed, false)
  assert.ok(
    result.blockingReasons.includes("INVALID_TRADE_SIZE")
  )
})

test("blocks stale quotes", () => {
  const request = validRequest()
  request.quoteAgeSeconds = 40

  const result = evaluateTradeGuard(request)

  assert.equal(result.allowed, false)
  assert.ok(
    result.blockingReasons.includes("STALE_QUOTE")
  )
})

test("blocks invalid loss estimates", () => {
  const request = validRequest()
  request.worstCaseLossUsd = Number.NaN

  const result = evaluateTradeGuard(request)

  assert.equal(result.allowed, false)
  assert.ok(
    result.blockingReasons.includes(
      "INVALID_WORST_CASE_LOSS"
    )
  )
})

test("blocks an existing open position", () => {
  const request = validRequest()
  request.state.openPositions = 1

  const result = evaluateTradeGuard(request)

  assert.equal(result.allowed, false)
  assert.ok(
    result.blockingReasons.includes(
      "MAX_OPEN_POSITIONS"
    )
  )
})
