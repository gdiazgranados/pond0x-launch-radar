import { observeTimedPondsolRoundTrip, type TimedPondsolRoundTrip } from "./timed-pondsol-roundtrip"
import { evaluateTradeGuard } from "./trade-guard"
import { PONDSOL_RISK_CONFIG as LIMITS } from "./risk-config"

export type PaperMonitorResult = {
  decision: "PAPER_CANDIDATE" | "NO_TRADE"
  reasons: string[]
  estimatedNetUsd: number | null
  estimatedNetPct: number | null
  tradeUsd: number
  tradeAllowed: false
  mode: "SIMULATION"
  note: "QUOTES_ONLY_NOT_EXECUTED"
}

export function assessPaperRoundTrip(
  cycle: TimedPondsolRoundTrip,
  solUsd: number,
  costBufferUsd: number,
  tradeUsd: number,
  nowMs: number
): PaperMonitorResult {
  const reasons: string[] = []
  const fail = (why: string): PaperMonitorResult => ({
    decision: "NO_TRADE", reasons: [...new Set([...reasons, why])],
    estimatedNetUsd: null, estimatedNetPct: null, tradeUsd,
    tradeAllowed: false, mode: "SIMULATION", note: "QUOTES_ONLY_NOT_EXECUTED",
  })
  if (!Number.isFinite(solUsd) || solUsd <= 0 || !Number.isFinite(costBufferUsd) || costBufferUsd < 0 ||
      !Number.isFinite(tradeUsd) || tradeUsd <= 0 || tradeUsd > LIMITS.maxTradeUsd ||
      !Number.isSafeInteger(nowMs) || nowMs <= 0) return fail("INVALID_MONITOR_INPUT")
  if (!cycle || cycle.mode !== "SIMULATION" || cycle.tradeAllowed !== false ||
      cycle.entry?.mode !== "SIMULATION" || cycle.exit?.mode !== "SIMULATION" ||
      cycle.entry.tradeAllowed !== false || cycle.exit.tradeAllowed !== false) return fail("INVALID_CYCLE")
  const start = cycle.entry.requestStartedAtMs
  const end = cycle.exit.responseReceivedAtMs
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      end < start || end > nowMs || nowMs - start > LIMITS.maxQuoteAgeSeconds * 1000 ||
      cycle.cycleDurationMs !== end - start ||
      cycle.exit.requestStartedAtMs < cycle.entry.responseReceivedAtMs) return fail("STALE_OR_INVALID_CYCLE")
  const entry = cycle.entry.observation
  const exit = cycle.exit.observation
  if (entry?.direction !== "WSOL_TO_PONDSOL" || exit?.direction !== "PONDSOL_TO_WSOL" ||
      entry.quote?.outputAmountBaseUnits !== exit.quote?.inputAmountBaseUnits) return fail("QUOTE_CONTINUITY_FAILURE")
  const first = entry.quote?.inputAmountBaseUnits
  const last = exit.quote?.outputAmountBaseUnits
  if (typeof first !== "string" || typeof last !== "string" || !/^[1-9]\d*$/.test(first) ||
      !/^[1-9]\d*$/.test(last)) return fail("INVALID_QUOTE_AMOUNTS")
  const initial = BigInt(first)
  const impliedTradeUsd = Number(initial) / 1e9 * solUsd
  if (!Number.isFinite(impliedTradeUsd) || Math.abs(impliedTradeUsd - tradeUsd) > Math.max(0.01, tradeUsd * 0.01)) return fail("TRADE_SIZE_QUOTE_MISMATCH")
  const final = BigInt(last)
  const estimatedNetUsd = Number(final - initial) / 1e9 * solUsd - costBufferUsd
  const estimatedNetPct = estimatedNetUsd / tradeUsd * 100
  if (!Number.isFinite(estimatedNetUsd) || !Number.isFinite(estimatedNetPct)) return fail("INVALID_ESTIMATE")
  if (cycle.liquidityClassification !== "INDEPENDENT") reasons.push("LIQUIDITY_NOT_INDEPENDENT")
  // The synthetic two-quote cycle does not establish independently executable fills.
  // The existing risk algorithm is reused only to classify paper candidates.
  const risk = evaluateTradeGuard({
    tradeUsd, estimatedNetProfitPct: estimatedNetPct,
    quoteAgeSeconds: (nowMs - start) / 1000,
    worstCaseLossUsd: tradeUsd,
    state: { availableCapitalUsd: LIMITS.initialCapitalUsd, dailyPnlUsd: 0,
      totalPnlUsd: 0, openPositions: 0 },
  })
  reasons.push(...risk.blockingReasons)
  return {
    decision: reasons.length === 0 ? "PAPER_CANDIDATE" : "NO_TRADE",
    reasons: [...new Set(reasons)], estimatedNetUsd, estimatedNetPct, tradeUsd,
    tradeAllowed: false, mode: "SIMULATION", note: "QUOTES_ONLY_NOT_EXECUTED",
  }
}

export async function observeSimplePaperOpportunity(
  solUsd: number,
  costBufferUsd = 0.15,
  tradeUsd = Math.min(LIMITS.maxTradeUsd, LIMITS.maxDailyLossUsd),
  observer: typeof observeTimedPondsolRoundTrip = observeTimedPondsolRoundTrip,
  now: () => number = Date.now
): Promise<PaperMonitorResult> {
  if (!Number.isFinite(solUsd) || solUsd <= 0 || !Number.isFinite(tradeUsd) ||
      tradeUsd <= 0 || tradeUsd > LIMITS.maxTradeUsd) {
    return { decision: "NO_TRADE", reasons: ["INVALID_MONITOR_INPUT"],
      estimatedNetUsd: null, estimatedNetPct: null, tradeUsd,
      tradeAllowed: false, mode: "SIMULATION", note: "QUOTES_ONLY_NOT_EXECUTED" }
  }
  const raw = Math.floor(tradeUsd / solUsd * 1e9)
  if (!Number.isSafeInteger(raw) || raw <= 0) throw new Error("INVALID_WSOL_SIZE")
  const cycle = await observer(String(raw))
  return assessPaperRoundTrip(cycle, solUsd, costBufferUsd, tradeUsd, now())
}
