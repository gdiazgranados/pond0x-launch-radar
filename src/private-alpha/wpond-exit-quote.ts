import {
  readJupiterQuote,
  type JupiterQuoteRequest,
  type ReadOnlyQuoteLeg,
} from "./read-only-quote-clients"
import type { ShadowExecutionBasis } from "./shadow-execution-basis"
import { buildSizeAwareQuote } from "./size-aware-quote"
import {
  buildWpondRoundTripRequest,
  type WpondMarketSnapshot,
} from "./wpond-quote-observer"

type QuoteReader = (
  request: JupiterQuoteRequest
) => Promise<ReadOnlyQuoteLeg>

export async function observeWpondExactExit(
  snapshot: WpondMarketSnapshot,
  basis: ShadowExecutionBasis,
  options: {
    observedAt: string
    estimatedFeeLamports: number
    apiKey?: string
  },
  reader: QuoteReader = readJupiterQuote
) {
  if (
    basis.tokenId !== "wPOND" ||
    basis.chain !== "SOLANA" ||
    basis.tokenDecimals !== 3
  ) {
    throw new Error("wPOND execution basis identity is invalid")
  }
  if (!/^[1-9]\d*$/.test(basis.simulatedTokenAmountBaseUnits)) {
    throw new Error("wPOND execution basis raw amount is invalid")
  }

  const context = buildWpondRoundTripRequest(snapshot, {
    observedAt: options.observedAt,
    requestedNotionalUsd: basis.requestedNotionalUsd,
    targetDecimals: basis.tokenDecimals,
    estimatedFeeLamportsPerLeg: options.estimatedFeeLamports,
    apiKey: options.apiKey,
  })
  if (context.referencePairAddress !== basis.referencePairAddress) {
    throw new Error("wPOND execution basis pool is no longer primary")
  }

  const historicalBuy = {
    routeId: basis.buyRouteId,
    inputAmount: basis.requestedNotionalUsd,
    outputAmount: basis.simulatedTokenUnits,
    estimatedFeeUsd: basis.estimatedEntryFeeUsd,
  }
  const observationInput = (
    sell: {
      routeId: string
      inputAmount: number
      outputAmount: number
      estimatedFeeUsd: number
    } | null
  ) => ({
    tokenId: "wPOND" as const,
    chain: "SOLANA" as const,
    observedAt: options.observedAt,
    referencePairAddress: basis.referencePairAddress,
    requestedNotionalUsd: basis.requestedNotionalUsd,
    referencePriceUsd: context.referencePriceUsd,
    buy: historicalBuy,
    sell,
    entryTokenAmountBaseUnits:
      basis.simulatedTokenAmountBaseUnits,
    entryTokenDecimals: basis.tokenDecimals,
  })

  let exit: ReadOnlyQuoteLeg
  try {
    exit = await reader({
      inputToken: context.targetToken,
      outputToken: context.quoteToken,
      inputAmountBaseUnits:
        basis.simulatedTokenAmountBaseUnits,
      inputDecimals: basis.tokenDecimals,
      outputDecimals: context.quoteDecimals,
      estimatedFeeUsd: context.sellEstimatedFeeUsd,
      apiKey: options.apiKey,
    })
  } catch {
    return buildSizeAwareQuote(observationInput(null))
  }

  if (
    exit.inputAmountBaseUnits !==
      basis.simulatedTokenAmountBaseUnits ||
    !exit.venueIds.includes(basis.referencePairAddress)
  ) {
    return buildSizeAwareQuote(observationInput(null))
  }

  return buildSizeAwareQuote(observationInput({
    routeId: exit.routeId,
    inputAmount: exit.inputAmount,
    outputAmount:
      exit.outputAmount * context.quoteTokenPriceUsd,
    estimatedFeeUsd: exit.estimatedFeeUsd,
  }))
}
