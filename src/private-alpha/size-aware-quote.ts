import type {
  ShadowChain,
  ShadowToken,
} from "./shadow-portfolio"

export type QuoteLeg = {
  routeId: string
  inputAmount: number
  outputAmount: number
  estimatedFeeUsd: number
}

export type SizeAwareQuoteObservation = {
  status: "MEASURED" | "UNAVAILABLE"
  tokenId: ShadowToken
  chain: ShadowChain
  observedAt: string
  referencePairAddress: string
  requestedNotionalUsd: number
  referencePriceUsd: number
  effectiveEntryPriceUsd: number | null
  effectiveExitPriceUsd: number | null
  estimatedEntryPriceImpactPct: number | null
  estimatedExitPriceImpactPct: number | null
  estimatedRoundTripLossPct: number | null
  estimatedFeesUsd: number | null
  buyRouteId: string | null
  sellRouteId: string | null
  blockingReasons: ReadonlyArray<string>
}

export type SizeAwareQuoteInput = {
  tokenId: ShadowToken
  chain: ShadowChain
  observedAt: string
  referencePairAddress: string
  requestedNotionalUsd: number
  referencePriceUsd: number
  buy: QuoteLeg | null
  sell: QuoteLeg | null
}

const TOKEN_CHAIN: Record<ShadowToken, ShadowChain> = {
  PNDC: "ETHEREUM",
  PORK: "ETHEREUM",
  wPOND: "SOLANA",
  PAPER: "SOLANA",
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0
}

function unavailable(
  input: SizeAwareQuoteInput,
  reasons: string[]
): SizeAwareQuoteObservation {
  return {
    status: "UNAVAILABLE",
    tokenId: input.tokenId,
    chain: TOKEN_CHAIN[input.tokenId],
    observedAt: input.observedAt,
    referencePairAddress: input.referencePairAddress,
    requestedNotionalUsd: input.requestedNotionalUsd,
    referencePriceUsd: input.referencePriceUsd,
    effectiveEntryPriceUsd: null,
    effectiveExitPriceUsd: null,
    estimatedEntryPriceImpactPct: null,
    estimatedExitPriceImpactPct: null,
    estimatedRoundTripLossPct: null,
    estimatedFeesUsd: null,
    buyRouteId: input.buy?.routeId ?? null,
    sellRouteId: input.sell?.routeId ?? null,
    blockingReasons: [...new Set(reasons)],
  }
}

export function buildSizeAwareQuote(
  input: SizeAwareQuoteInput
): SizeAwareQuoteObservation {
  if (!finitePositive(input.requestedNotionalUsd)) {
    throw new Error("requestedNotionalUsd must be positive")
  }
  if (!finitePositive(input.referencePriceUsd)) {
    throw new Error("referencePriceUsd must be positive")
  }

  const reasons: string[] = []
  if (TOKEN_CHAIN[input.tokenId] !== input.chain) {
    reasons.push("TOKEN_CHAIN_MISMATCH")
  }
  if (!Number.isFinite(Date.parse(input.observedAt))) {
    reasons.push("INVALID_OBSERVATION_TIMESTAMP")
  }
  if (!input.referencePairAddress.trim()) {
    reasons.push("REFERENCE_PAIR_UNAVAILABLE")
  }
  if (!input.buy) reasons.push("BUY_QUOTE_UNAVAILABLE")
  if (!input.sell) reasons.push("SELL_QUOTE_UNAVAILABLE")

  if (reasons.length || !input.buy || !input.sell) {
    return unavailable(input, reasons)
  }

  for (const [name, leg] of [
    ["BUY", input.buy],
    ["SELL", input.sell],
  ] as const) {
    if (!leg.routeId.trim()) reasons.push(`${name}_ROUTE_UNAVAILABLE`)
    if (!finitePositive(leg.inputAmount)) {
      reasons.push(`${name}_INPUT_INVALID`)
    }
    if (!finitePositive(leg.outputAmount)) {
      reasons.push(`${name}_OUTPUT_INVALID`)
    }
    if (!finiteNonNegative(leg.estimatedFeeUsd)) {
      reasons.push(`${name}_FEE_INVALID`)
    }
  }

  const inputDifference =
    Math.abs(input.sell.inputAmount - input.buy.outputAmount) /
    input.buy.outputAmount
  if (inputDifference > 0.001) {
    reasons.push("ROUND_TRIP_TOKEN_AMOUNT_MISMATCH")
  }
  if (reasons.length) return unavailable(input, reasons)

  const effectiveEntryPriceUsd =
    input.buy.inputAmount / input.buy.outputAmount
  const effectiveExitPriceUsd =
    input.sell.outputAmount / input.sell.inputAmount
  const entryImpact =
    ((effectiveEntryPriceUsd - input.referencePriceUsd) /
      input.referencePriceUsd) *
    100
  const exitImpact =
    ((input.referencePriceUsd - effectiveExitPriceUsd) /
      input.referencePriceUsd) *
    100

  return {
    status: "MEASURED",
    tokenId: input.tokenId,
    chain: input.chain,
    observedAt: input.observedAt,
    referencePairAddress: input.referencePairAddress,
    requestedNotionalUsd: input.requestedNotionalUsd,
    referencePriceUsd: input.referencePriceUsd,
    effectiveEntryPriceUsd,
    effectiveExitPriceUsd,
    estimatedEntryPriceImpactPct: Math.max(0, entryImpact),
    estimatedExitPriceImpactPct: Math.max(0, exitImpact),
    estimatedRoundTripLossPct:
      ((input.requestedNotionalUsd - input.sell.outputAmount) /
        input.requestedNotionalUsd) *
      100,
    estimatedFeesUsd:
      input.buy.estimatedFeeUsd + input.sell.estimatedFeeUsd,
    buyRouteId: input.buy.routeId,
    sellRouteId: input.sell.routeId,
    blockingReasons: [],
  }
}
