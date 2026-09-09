import type { MarketSnapshot } from "./public-market-evidence-adapter"
import {
  evaluateJupiterRoundTrip,
  type JupiterRoundTripRequest,
} from "./round-trip-quote-evaluator"

export const WPOND_MINT =
  "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq"
export const WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112"

type WpondMarketSnapshot = MarketSnapshot & {
  tokens?: Array<{
    symbol?: string
    chain?: string
    status?: string
    address?: string
    primaryMarket?: {
      pairAddress?: string | null
      priceUsd?: number | null
      priceNative?: number | null
      quoteToken?: {
        address?: string
        symbol?: string
      }
    } | null
  }>
}

function finitePositive(value: unknown, name: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be positive`)
  }
  return number
}

export function buildWpondRoundTripRequest(
  snapshot: WpondMarketSnapshot,
  options: {
    observedAt: string
    requestedNotionalUsd: number
    targetDecimals: number
    estimatedFeeLamportsPerLeg: number
    apiKey?: string
  }
): JupiterRoundTripRequest {
  const token = snapshot.tokens?.find(
    (candidate) => candidate.symbol === "wPOND"
  )
  const market = token?.primaryMarket

  if (
    token?.status !== "OBSERVED" ||
    token.chain?.toLowerCase() !== "solana" ||
    token.address !== WPOND_MINT
  ) {
    throw new Error("wPOND market identity is unavailable")
  }
  if (
    market?.quoteToken?.address !== WRAPPED_SOL_MINT ||
    market.quoteToken.symbol !== "SOL"
  ) {
    throw new Error("wPOND reference market is not quoted in wrapped SOL")
  }
  if (!market.pairAddress?.trim()) {
    throw new Error("wPOND reference pair is unavailable")
  }
  if (options.targetDecimals !== 3) {
    throw new Error("unexpected on-chain wPOND decimals")
  }
  if (
    !Number.isInteger(options.estimatedFeeLamportsPerLeg) ||
    options.estimatedFeeLamportsPerLeg < 0
  ) {
    throw new Error("estimatedFeeLamportsPerLeg must be non-negative")
  }

  const referencePriceUsd = finitePositive(
    market.priceUsd,
    "wPOND referencePriceUsd"
  )
  const priceNative = finitePositive(
    market.priceNative,
    "wPOND priceNative"
  )
  const requestedNotionalUsd = finitePositive(
    options.requestedNotionalUsd,
    "requestedNotionalUsd"
  )
  const solPriceUsd = referencePriceUsd / priceNative
  const quoteAmountBaseUnits = Math.floor(
    (requestedNotionalUsd / solPriceUsd) * 1e9
  ).toString()
  const estimatedFeeUsd =
    (options.estimatedFeeLamportsPerLeg / 1e9) * solPriceUsd

  if (!/^[1-9]\d*$/.test(quoteAmountBaseUnits)) {
    throw new Error("requested notional is too small for a SOL quote")
  }

  return {
    tokenId: "wPOND",
    chain: "SOLANA",
    observedAt: options.observedAt,
    referencePairAddress: market.pairAddress,
    requestedNotionalUsd,
    referencePriceUsd,
    quoteTokenPriceUsd: solPriceUsd,
    quoteToken: WRAPPED_SOL_MINT,
    targetToken: WPOND_MINT,
    quoteAmountBaseUnits,
    quoteDecimals: 9,
    targetDecimals: options.targetDecimals,
    buyEstimatedFeeUsd: estimatedFeeUsd,
    sellEstimatedFeeUsd: estimatedFeeUsd,
    apiKey: options.apiKey,
  }
}

export async function observeWpondRoundTrip(
  snapshot: WpondMarketSnapshot,
  options: Parameters<typeof buildWpondRoundTripRequest>[1]
) {
  return evaluateJupiterRoundTrip(
    buildWpondRoundTripRequest(snapshot, options)
  )
}
