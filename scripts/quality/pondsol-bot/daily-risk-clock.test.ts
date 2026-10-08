import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createDailyRiskClock,
  advanceDailyRiskClock,
  getTradingDayUtc,
} from "../../../src/private-alpha/pondsol-bot/daily-risk-clock"

test("creates a daily risk clock in UTC", () => {
  const clock = createDailyRiskClock(
    new Date("2026-10-07T20:00:00Z")
  )

  assert.equal(clock.tradingDayUtc, "2026-10-07")
  assert.equal(clock.dailyPnlCents, 0)
})

test("preserves losses after restarting on the same day", () => {
  const clock = createDailyRiskClock(
    new Date("2026-10-07T08:00:00Z"),
    -200
  )

  const restored = advanceDailyRiskClock(
    clock,
    new Date("2026-10-07T23:59:00Z")
  )

  assert.equal(restored.dailyPnlCents, -200)
  assert.equal(restored.tradingDayUtc, "2026-10-07")
})

test("resets daily PnL on the next UTC day", () => {
  const clock = createDailyRiskClock(
    new Date("2026-10-07T23:59:00Z"),
    -200
  )

  const advanced = advanceDailyRiskClock(
    clock,
    new Date("2026-10-08T00:01:00Z")
  )

  assert.equal(advanced.dailyPnlCents, 0)
  assert.equal(advanced.tradingDayUtc, "2026-10-08")
})

test("rejects backwards trading dates", () => {
  const clock = createDailyRiskClock(
    new Date("2026-10-08T10:00:00Z"),
    -100
  )

  assert.throws(
    () =>
      advanceDailyRiskClock(
        clock,
        new Date("2026-10-07T10:00:00Z")
      ),
    /TRADING_CLOCK_MOVED_BACKWARDS/
  )
})

test("rejects invalid dates", () => {
  assert.throws(
    () => getTradingDayUtc(new Date("invalid")),
    /INVALID_TRADING_DATE/
  )
})

test("rejects invalid daily PnL", () => {
  assert.throws(
    () =>
      createDailyRiskClock(
        new Date("2026-10-07T10:00:00Z"),
        Number.NaN
      ),
    /INVALID_DAILY_PNL/
  )
})