import {
  classifyPoolLiquidity,
  type LiquidityQuote,
} from "./liquidity-classifier"
import {
  classifyLiquidityIndependence,
} from "./liquidity-independence"
import {
  evaluateQuoteOpportunity,
  type QuoteLeg,
} from "./quote-adapter"
import {
  evaluateTradeGuard,
} from "./trade-guard"
import type { RiskState } from "./risk-controller"
import { PONDSOL_RISK_CONFIG } from "./risk-config"

export type PaperOpportunityInput = {
  entry: QuoteLeg | null
  exit: QuoteLeg | null
  entryLiquidityQuotes: LiquidityQuote[]
  exitLiquidityQuotes: LiquidityQuote[]
  entryPoolIds: unknown
  exitPoolIds: unknown
  nowMs: number
  networkCostUsd: number
  worstCaseLossUsd: number
  state: RiskState
}

export type PaperOpportunityDecision = {
  decision: "PAPER_CANDIDATE" | "NO_TRADE"
  reasons: string[]
  estimatedNetProfitUsd: number | null
  estimatedNetProfitPct: number | null
  tradeAllowed: false
  mode: "SIMULATION"
}

export function evaluatePaperOpportunity(
  input: PaperOpportunityInput
): PaperOpportunityDecision {
  const reasons: string[] = []

  const entryLiquidity = classifyPoolLiquidity(
    input.entryLiquidityQuotes
  )
  const exitLiquidity = classifyPoolLiquidity(
    input.exitLiquidityQuotes
  )

  if (entryLiquidity.classification !== "TWO_WAY_QUOTABLE") {
    reasons.push("ENTRY_LIQUIDITY_UNVERIFIED")
  }

  if (exitLiquidity.classification !== "TWO_WAY_QUOTABLE") {
    reasons.push("EXIT_LIQUIDITY_UNVERIFIED")
  }

  const independence = classifyLiquidityIndependence(
    input.entryPoolIds,
    input.exitPoolIds
  )

  if (independence.classification !== "INDEPENDENT") {
    reasons.push("LIQUIDITY_NOT_INDEPENDENT")
  }

  const quote = evaluateQuoteOpportunity(
    input.entry,
    input.exit,
    input.nowMs,
    input.networkCostUsd,
    PONDSOL_RISK_CONFIG.maxQuoteAgeSeconds
  )

  reasons.push(...quote.reasons)

  if (
    input.entry &&
    quote.estimatedNetProfitPct !== null &&
    quote.quoteAgeSeconds !== null
  ) {
    const risk = evaluateTradeGuard({
      tradeUsd: input.entry.inputAmount,
      estimatedNetProfitPct: quote.estimatedNetProfitPct,
      quoteAgeSeconds: quote.quoteAgeSeconds,
      worstCaseLossUsd: input.worstCaseLossUsd,
      state: input.state,
    })

    reasons.push(...risk.blockingReasons)
  }

  return {
    decision: reasons.length === 0
      ? "PAPER_CANDIDATE"
      : "NO_TRADE",
    reasons: [...new Set(reasons)],
    estimatedNetProfitUsd: quote.estimatedNetProfitUsd,
    estimatedNetProfitPct: quote.estimatedNetProfitPct,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}
