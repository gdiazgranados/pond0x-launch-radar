
import assert from "node:assert/strict"
import test from "node:test"

import {
  simulateClosedTrade,
  settleSimulatedTrade,
} from "../../../src/private-alpha/pondsol-bot/trade-simulator"

import {
  createCompoundingLedger,
} from "../../../src/private-alpha/pondsol-bot/compounding-ledger"

test("calculates profitable trade after costs", () => {
  const result = simulateClosedTrade({
    tradeUsd: 10,
    exitValueUsd: 10.50,
    entryFeeUsd: 0.05,
    exitFeeUsd: 0.05,
    networkCostUsd: 0.02,
  })

  assert.ok(Math.abs(result.netPnlUsd - 0.38) < 1e-9)
  assert.ok(Math.abs(result.netReturnPct - 3.8) < 1e-9)
  assert.equal(result.profitable, true)
})

test("calculates losing trade", () => {
  const result = simulateClosedTrade({
    tradeUsd: 10,
    exitValueUsd: 9,
    entryFeeUsd: 0.05,
    exitFeeUsd: 0.05,
    networkCostUsd: 0.02,
  })

  assert.ok(Math.abs(result.netPnlUsd + 1.12) < 1e-9)
  assert.equal(result.profitable, false)
})

test("settles profit into compounding ledger", () => {
  const initial = createCompoundingLedger()

  const settled = settleSimulatedTrade(initial, {
    tradeUsd: 10,
    exitValueUsd: 14.12,
    entryFeeUsd: 0.05,
    exitFeeUsd: 0.05,
    networkCostUsd: 0.02,
  })

  assert.equal(settled.ledger.operatingCapitalCents, 5300)
  assert.equal(settled.ledger.reservedProfitCents, 100)
  assert.equal(settled.ledger.completedTrades, 1)
})

test("rejects invalid trade values", () => {
  assert.throws(
    () => simulateClosedTrade({
      tradeUsd: 10,
      exitValueUsd: Number.NaN,
      entryFeeUsd: 0,
      exitFeeUsd: 0,
      networkCostUsd: 0,
    }),
    /INVALID_TRADE_VALUES/
  )
})
