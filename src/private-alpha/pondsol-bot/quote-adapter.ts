import { PONDSOL_RISK_CONFIG } from "./risk-config"
export type QuoteLeg = {
  routeId: string
  inputAsset: string
  outputAsset: string
  inputAmount: number
  outputAmount: number
  quotedAtMs: number
  estimatedFeeUsd: number
}

export type QuoteOpportunity = {
  decision: "SIMULATE" | "NO_TRADE"
  reasons: string[]
  estimatedNetProfitUsd: number | null
  estimatedNetProfitPct: number | null
  quoteAgeSeconds: number | null
}

export function evaluateQuoteOpportunity(
  entry: QuoteLeg | null,
  exit: QuoteLeg | null,
  nowMs: number,
  networkCostUsd: number,
  maxQuoteAgeSeconds = 30
): QuoteOpportunity {
  const reject = (reason: string): QuoteOpportunity => ({
    decision: "NO_TRADE",
    reasons: [reason],
    estimatedNetProfitUsd: null,
    estimatedNetProfitPct: null,
    quoteAgeSeconds: null,
  })

  if (!entry || !exit) return reject("MISSING_QUOTE")

  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(networkCostUsd) ||
    networkCostUsd < 0 ||
    !Number.isFinite(maxQuoteAgeSeconds) ||
    maxQuoteAgeSeconds <= 0
  ) return reject("INVALID_EVALUATION_CONTEXT")

  for (const leg of [entry, exit]) {
    if (
      typeof leg.routeId !== "string" ||
      !leg.routeId.trim() ||
      typeof leg.inputAsset !== "string" ||
      !leg.inputAsset.trim() ||
      typeof leg.outputAsset !== "string" ||
      !leg.outputAsset.trim() ||
      !Number.isFinite(leg.inputAmount) ||
      !Number.isFinite(leg.outputAmount) ||
      !Number.isFinite(leg.quotedAtMs) ||
      !Number.isFinite(leg.estimatedFeeUsd) ||
      leg.inputAmount <= 0 ||
      leg.outputAmount <= 0 ||
      leg.estimatedFeeUsd < 0
    ) return reject("INVALID_QUOTE")
  }

  if (
    entry.outputAsset !== exit.inputAsset ||
    entry.inputAsset !== exit.outputAsset
  ) return reject("ROUTE_ASSET_MISMATCH")

  if (
    entry.inputAsset !== "USD" ||
    exit.outputAsset !== "USD"
  ) return reject("UNSUPPORTED_NUMERAIRE")
  if (entry.outputAmount !== exit.inputAmount) {
    return reject("ROUTE_AMOUNT_MISMATCH")
  }

  if (
    entry.quotedAtMs > nowMs ||
    exit.quotedAtMs > nowMs
  ) return reject("FUTURE_QUOTE")
  const ageSeconds = Math.max(
    (nowMs - entry.quotedAtMs) / 1000,
    (nowMs - exit.quotedAtMs) / 1000
  )

  if (
    ageSeconds < 0 ||
    ageSeconds > maxQuoteAgeSeconds
  ) return reject("STALE_QUOTE")

  const totalCosts =
    entry.estimatedFeeUsd +
    exit.estimatedFeeUsd +
    networkCostUsd

  const netProfit =
    exit.outputAmount -
    entry.inputAmount -
    totalCosts

  if (!Number.isFinite(netProfit)) {
    return reject("INVALID_PROFIT_CALCULATION")
  }

  const netPct = netProfit / entry.inputAmount * 100

  if (!Number.isFinite(netPct)) {
    return reject("INVALID_PROFIT_CALCULATION")
  }

  if (netPct < PONDSOL_RISK_CONFIG.minEstimatedNetProfitPct) {
    return {
      decision: "NO_TRADE",
      reasons: ["BELOW_MIN_NET_PROFIT"],
      estimatedNetProfitUsd: netProfit,
      estimatedNetProfitPct: netPct,
      quoteAgeSeconds: ageSeconds,
    }
  }

  return {
    decision: "SIMULATE",
    reasons: [],
    estimatedNetProfitUsd: netProfit,
    estimatedNetProfitPct: netPct,
    quoteAgeSeconds: ageSeconds,
  }
}
