import assert from "node:assert/strict"
import test from "node:test"
import { isCanonicalUtcTimestamp } from "../../../src/private-alpha/pondsol-bot/utc-timestamp"
import { createPositionEngine, enterSimulatedPosition } from "../../../src/private-alpha/pondsol-bot/position-engine"
import { validatePositionEngine } from "../../../src/private-alpha/pondsol-bot/simulation-persistence"

const guard = { estimatedNetProfitPct: 2, quoteAgeSeconds: 5, worstCaseLossUsd: 1 }

test("rejects impossible calendar dates and timezone offsets", () => {
  for (const value of ["2026-02-30T12:00:00Z", "2026-10-07T24:00:00Z", "2026-10-07T20:00:00+00:00", "2026-10-07T20:00:00.1234Z", "2026-10-07T20:00:60Z"]) {
    assert.equal(isCanonicalUtcTimestamp(value), false, value)
    assert.throws(() => enterSimulatedPosition(createPositionEngine(), "bad", 10, guard, value), /INVALID_UTC_TIMESTAMP/)
  }
})

test("accepts UTC timestamps with zero to three fractional digits", () => {
  for (const value of ["2026-10-07T20:00:00Z", "2026-10-07T20:00:00.1Z", "2026-10-07T20:00:00.12Z", "2026-10-07T20:00:00.123Z"]) {
    assert.equal(isCanonicalUtcTimestamp(value), true, value)
  }
})

test("snapshot validation uses same UTC timestamp rule as position entry", () => {
  const valid = enterSimulatedPosition(createPositionEngine(), "valid", 10, guard, "2026-10-07T20:00:00Z")
  const altered = structuredClone(valid)
  altered.positions.openPosition!.openedAtUtc = "2026-02-30T20:00:00Z"
  assert.throws(() => validatePositionEngine(altered), /INVALID_OPEN_POSITION/)
})
