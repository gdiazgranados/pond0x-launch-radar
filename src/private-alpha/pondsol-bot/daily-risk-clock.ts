export type DailyRiskClock = {
  tradingDayUtc: string
  dailyPnlCents: number
}

export function getTradingDayUtc(now: Date): string {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("INVALID_TRADING_DATE")
  }

  return now.toISOString().slice(0, 10)
}

export function createDailyRiskClock(
  now: Date,
  dailyPnlCents = 0
): DailyRiskClock {
  if (!Number.isSafeInteger(dailyPnlCents)) {
    throw new Error("INVALID_DAILY_PNL")
  }

  return {
    tradingDayUtc: getTradingDayUtc(now),
    dailyPnlCents,
  }
}

export function advanceDailyRiskClock(
  clock: DailyRiskClock,
  now: Date
): DailyRiskClock {
  const currentDay = getTradingDayUtc(now)

  if (currentDay < clock.tradingDayUtc) {
    throw new Error("TRADING_CLOCK_MOVED_BACKWARDS")
  }

  if (currentDay === clock.tradingDayUtc) {
    return { ...clock }
  }

  return {
    tradingDayUtc: currentDay,
    dailyPnlCents: 0,
  }
}