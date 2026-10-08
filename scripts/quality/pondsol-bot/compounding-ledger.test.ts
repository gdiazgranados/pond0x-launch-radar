
import assert from "node:assert/strict"
import test from "node:test"

import {
  createCompoundingLedger,
  recordClosedTrade,
} from "../../../src/private-alpha/pondsol-bot/compounding-ledger"

test("initial capital is $50", () => {
  const ledger = createCompoundingLedger()

  assert.equal(ledger.operatingCapitalCents, 5000)
  assert.equal(ledger.reservedProfitCents, 0)
})

test("reinvests 75% of realized profit", () => {
  const initial = createCompoundingLedger()
  const result = recordClosedTrade(initial, 4)

  assert.equal(result.operatingCapitalCents, 5300)
  assert.equal(result.reservedProfitCents, 100)
  assert.equal(result.totalRealizedPnlCents, 400)
  assert.equal(result.completedTrades, 1)
})

test("losses reduce operating capital", () => {
  const initial = createCompoundingLedger()
  const result = recordClosedTrade(initial, -2)

  assert.equal(result.operatingCapitalCents, 4800)
  assert.equal(result.reservedProfitCents, 0)
  assert.equal(result.totalRealizedPnlCents, -200)
})

test("invalid profit is rejected", () => {
  const initial = createCompoundingLedger()

  assert.throws(
    () => recordClosedTrade(initial, Number.NaN),
    /INVALID_NET_PNL/
  )
})

test("cannot exceed available operating capital", () => {
  const initial = createCompoundingLedger()

  assert.throws(
    () => recordClosedTrade(initial, -60),
    /INSUFFICIENT_OPERATING_CAPITAL/
  )
})
