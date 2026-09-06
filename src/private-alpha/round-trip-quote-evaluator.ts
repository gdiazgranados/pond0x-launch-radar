import {
  readJupiterQuote,
  readZeroXPrice,
  type JupiterQuoteRequest,
  type ReadOnlyQuoteLeg,
  type ZeroXPriceRequest,
} from "./read-only-quote-clients"
import {
  buildSizeAwareQuote,
  type QuoteLeg,
  type SizeAwareQuoteObservation,
} from "./size-aware-quote"
import type {
  ShadowChain,
  ShadowToken,
} from "./shadow-portfolio"

type QuoteReader<Request> = (
  request: Request
) => Promise<ReadOnlyQuoteLeg>

type RoundTripBase = {
  tokenId: ShadowToken
  chain: ShadowChain
  observedAt: string
  referencePairAddress: string
  requestedNotionalUsd: number
  referencePriceUsd: number
  quoteTokenPriceUsd: number
  quoteToken: string
  targetToken: string
  quoteAmountBaseUnits: string
  quoteDecimals: number
  targetDecimals: number
  buyEstimatedFeeUsd: number
  sellEstimatedFeeUsd: number
}

export type JupiterRoundTripRequest = RoundTripBase & {
  chain: "SOLANA"
  apiKey?: string
}

export type ZeroXRoundTripRequest = RoundTripBase & {
  chain: "ETHEREUM"
  apiKey: string
  takerAddress: string
  nativeTokenPriceUsd: number
}

function pricedBuy(
  quote: ReadOnlyQuoteLeg,
  quoteTokenPriceUsd: number
): QuoteLeg {
  return {
    routeId: quote.routeId,
    inputAmount: quote.inputAmount * quoteTokenPriceUsd,
    outputAmount: quote.outputAmount,
    estimatedFeeUsd: quote.estimatedFeeUsd,
  }
}

function pricedSell(
  quote: ReadOnlyQuoteLeg,
  quoteTokenPriceUsd: number
): QuoteLeg {
  return {
    routeId: quote.routeId,
    inputAmount: quote.inputAmount,
    outputAmount: quote.outputAmount * quoteTokenPriceUsd,
    estimatedFeeUsd: quote.estimatedFeeUsd,
  }
}

function observationInput(
  input: RoundTripBase,
  buy: QuoteLeg | null,
  sell: QuoteLeg | null
) {
  return {
    tokenId: input.tokenId,
    chain: input.chain,
    observedAt: input.observedAt,
    referencePairAddress: input.referencePairAddress,
    requestedNotionalUsd: input.requestedNotionalUsd,
    referencePriceUsd: input.referencePriceUsd,
    buy,
    sell,
  }
}

function validateQuoteTokenPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("quoteTokenPriceUsd must be positive")
  }
}

export async function evaluateJupiterRoundTrip(
  input: JupiterRoundTripRequest,
  reader: QuoteReader<JupiterQuoteRequest> = readJupiterQuote
): Promise<SizeAwareQuoteObservation> {
  validateQuoteTokenPrice(input.quoteTokenPriceUsd)

  let buy: ReadOnlyQuoteLeg
  try {
    buy = await reader({
      inputToken: input.quoteToken,
      outputToken: input.targetToken,
      inputAmountBaseUnits: input.quoteAmountBaseUnits,
      inputDecimals: input.quoteDecimals,
      outputDecimals: input.targetDecimals,
      estimatedFeeUsd: input.buyEstimatedFeeUsd,
      apiKey: input.apiKey,
    })
  } catch {
    return buildSizeAwareQuote(
      observationInput(input, null, null)
    )
  }

  const pricedEntry = pricedBuy(buy, input.quoteTokenPriceUsd)

  try {
    const sell = await reader({
      inputToken: input.targetToken,
      outputToken: input.quoteToken,
      inputAmountBaseUnits: buy.outputAmountBaseUnits,
      inputDecimals: input.targetDecimals,
      outputDecimals: input.quoteDecimals,
      estimatedFeeUsd: input.sellEstimatedFeeUsd,
      apiKey: input.apiKey,
    })

    return buildSizeAwareQuote(
      observationInput(
        input,
        pricedEntry,
        pricedSell(sell, input.quoteTokenPriceUsd)
      )
    )
  } catch {
    return buildSizeAwareQuote(
      observationInput(input, pricedEntry, null)
    )
  }
}

export async function evaluateZeroXRoundTrip(
  input: ZeroXRoundTripRequest,
  reader: QuoteReader<ZeroXPriceRequest> = readZeroXPrice
): Promise<SizeAwareQuoteObservation> {
  validateQuoteTokenPrice(input.quoteTokenPriceUsd)

  let buy: ReadOnlyQuoteLeg
  try {
    buy = await reader({
      inputToken: input.quoteToken,
      outputToken: input.targetToken,
      inputAmountBaseUnits: input.quoteAmountBaseUnits,
      inputDecimals: input.quoteDecimals,
      outputDecimals: input.targetDecimals,
      estimatedFeeUsd: input.buyEstimatedFeeUsd,
      apiKey: input.apiKey,
      takerAddress: input.takerAddress,
      nativeTokenPriceUsd: input.nativeTokenPriceUsd,
    })
  } catch {
    return buildSizeAwareQuote(
      observationInput(input, null, null)
    )
  }

  const pricedEntry = pricedBuy(buy, input.quoteTokenPriceUsd)

  try {
    const sell = await reader({
      inputToken: input.targetToken,
      outputToken: input.quoteToken,
      inputAmountBaseUnits: buy.outputAmountBaseUnits,
      inputDecimals: input.targetDecimals,
      outputDecimals: input.quoteDecimals,
      estimatedFeeUsd: input.sellEstimatedFeeUsd,
      apiKey: input.apiKey,
      takerAddress: input.takerAddress,
      nativeTokenPriceUsd: input.nativeTokenPriceUsd,
    })

    return buildSizeAwareQuote(
      observationInput(
        input,
        pricedEntry,
        pricedSell(sell, input.quoteTokenPriceUsd)
      )
    )
  } catch {
    return buildSizeAwareQuote(
      observationInput(input, pricedEntry, null)
    )
  }
}
