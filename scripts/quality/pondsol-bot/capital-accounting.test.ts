
import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateCapitalSnapshot,
} from "../../../src/private-alpha/pondsol-bot/capital-accounting"

import {
  createCompoundingLedger,
  recordClosedTrade,
} from "../../../src/private-alpha/pondsol-bot/compounding-ledger"

import {
  createPositionState,
  openPosition,
} from "../../../src/private-alpha/pondsol-bot/position-state"

const position = {
  tradeId: "pondsol-001",
  investedCents: 1000,
  openedAtUtc: "2026-10-07T20:00:00Z",
}

test("starts with $50 available", () => {
  const snapshot = calculateCapitalSnapshot(
    createCompoundingLedger(),
    createPositionState()
  )

  assert.equal(snapshot.availableCapitalCents, 5000)
  assert.equal(snapshot.committedCapitalCents, 0)
  assert.equal(snapshot.totalEquityCents, 5000)
})

test("subtracts committed capital from available funds", () => {
  const positions = openPosition(
    createPositionState(),
    position
  )

  const snapshot = calculateCapitalSnapshot(
    createCompoundingLedger(),
    positions
  )

  assert.equal(snapshot.operatingCapitalCents, 5000)
  assert.equal(snapshot.committedCapitalCents, 1000)
  assert.equal(snapshot.availableCapitalCents, 4000)
})

test("keeps profit reserves separate", () => {
  const ledger = recordClosedTrade(
    createCompoundingLedger(),
    4
  )

  const snapshot = calculateCapitalSnapshot(
    ledger,
    createPositionState()
  )

  assert.equal(snapshot.operatingCapitalCents, 5300)
  assert.equal(snapshot.reservedProfitCents, 100)
  assert.equal(snapshot.totalEquityCents, 5400)
})

test("rejects capital overcommitment", () => {
  const positions = openPosition(
    createPositionState(),
    {
      ...position,
      investedCents: 6000,
    }
  )

  assert.throws(
    () => calculateCapitalSnapshot(
      createCompoundingLedger(),
      positions
    ),
    /INVALID_CAPITAL_STATE/
  )
})
