import assert from "node:assert/strict"
import test from "node:test"
import { createCompoundingLedger, recordClosedTrade } from "../../../src/private-alpha/pondsol-bot/compounding-ledger"

test("cent-level profits preserve equity and the 75/25 policy", () => {
  let ledger = createCompoundingLedger()
  for (let i = 0; i < 101; i++) {
    ledger = recordClosedTrade(ledger, 0.01)
    assert.equal(ledger.operatingCapitalCents + ledger.reservedProfitCents, 5000 + ledger.totalRealizedPnlCents)
  }
  assert.equal(ledger.totalRealizedPnlCents, 101)
  assert.equal(ledger.completedTrades, 101)
  assert.equal(ledger.reservedProfitCents, 0) // each 1-cent profit rounds reinvestment to 1 cent
})

test("tampered ledger is rejected before settlement", () => {
  const ledger = { ...createCompoundingLedger(), reservedProfitCents: 1 }
  assert.throws(() => recordClosedTrade(ledger, 1), /INVALID_LEDGER_BALANCE/)
})

test("overflow and unsafe counters fail closed", () => {
  const initial = createCompoundingLedger()
  assert.throws(() => recordClosedTrade(initial, Number.MAX_SAFE_INTEGER), /PNL_OUT_OF_RANGE|LEDGER_OVERFLOW_OR_IMBALANCE/)
  const invalid = { ...initial, completedTrades: Number.MAX_SAFE_INTEGER }
  assert.throws(() => recordClosedTrade(invalid, 1), /LEDGER_OVERFLOW_OR_IMBALANCE/)
})

test("losses after profits preserve reserves and exact equity", () => {
  const profitable = recordClosedTrade(createCompoundingLedger(), 4)
  const loss = recordClosedTrade(profitable, -2)
  assert.equal(loss.reservedProfitCents, 100)
  assert.equal(loss.operatingCapitalCents, 5100)
  assert.equal(loss.totalRealizedPnlCents, 200)
  assert.equal(loss.operatingCapitalCents + loss.reservedProfitCents, 5200)
})
