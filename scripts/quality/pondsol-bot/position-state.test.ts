
import assert from "node:assert/strict"
import test from "node:test"

import {
  createPositionState,
  openPosition,
  closePosition,
} from "../../../src/private-alpha/pondsol-bot/position-state"

const position = {
  tradeId: "pondsol-001",
  investedCents: 1000,
  openedAtUtc: "2026-10-07T20:00:00Z",
}

test("starts without an open position", () => {
  const state = createPositionState()

  assert.equal(state.openPosition, null)
  assert.deepEqual(state.closedTradeIds, [])
})

test("opens a simulated position", () => {
  const state = openPosition(
    createPositionState(),
    position
  )

  assert.equal(state.openPosition?.tradeId, "pondsol-001")
  assert.equal(state.openPosition?.investedCents, 1000)
})

test("blocks a second open position", () => {
  const state = openPosition(
    createPositionState(),
    position
  )

  assert.throws(
    () => openPosition(state, {
      ...position,
      tradeId: "pondsol-002",
    }),
    /POSITION_ALREADY_OPEN/
  )
})

test("closes the correct position", () => {
  const opened = openPosition(
    createPositionState(),
    position
  )

  const closed = closePosition(opened, "pondsol-001")

  assert.equal(closed.openPosition, null)
  assert.deepEqual(
    closed.closedTradeIds,
    ["pondsol-001"]
  )
})

test("blocks closing the wrong position", () => {
  const opened = openPosition(
    createPositionState(),
    position
  )

  assert.throws(
    () => closePosition(opened, "pondsol-999"),
    /POSITION_NOT_FOUND/
  )
})

test("prevents reopening a closed trade ID", () => {
  const opened = openPosition(
    createPositionState(),
    position
  )

  const closed = closePosition(opened, "pondsol-001")

  assert.throws(
    () => openPosition(closed, position),
    /INVALID_OR_DUPLICATE_TRADE_ID/
  )
})

test("rejects invalid position amounts", () => {
  assert.throws(
    () => openPosition(createPositionState(), {
      ...position,
      investedCents: -100,
    }),
    /INVALID_POSITION_SIZE/
  )
})
