import type { QuoteLeg } from "./quote-adapter"
import type { PondsolRoundTripObservation } from "./jupiter-pondsol-roundtrip"
import { PONDSOL_RISK_CONFIG } from "./risk-config"

export type PondsolUsdValuationInput = {
  observation: PondsolRoundTripObservation
  solPriceUsd: number
  priceObservedAtMs: number
  entryQuotedAtMs: number
  exitQuotedAtMs: number
  nowMs: number
  entryFeeUsd: number
  exitFeeUsd: number
  networkCostUsd: number
}

export type PondsolUsdValuation = {
  entry: QuoteLeg
  exit: QuoteLeg
  networkCostUsd: number
  tradeAllowed: false
  mode: "SIMULATION"
}

function validCost(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function validTimestamp(value: number, nowMs: number): boolean {
  return Number.isSafeInteger(value) &&
    value > 0 &&
    value <= nowMs &&
    (nowMs - value) / 1000 <=
      PONDSOL_RISK_CONFIG.maxQuoteAgeSeconds
}

export function valuePondsolRoundTripUsd(
  input: PondsolUsdValuationInput
): PondsolUsdValuation {
  const {
    observation,
    solPriceUsd,
    priceObservedAtMs,
    entryQuotedAtMs,
    exitQuotedAtMs,
    nowMs,
    entryFeeUsd,
    exitFeeUsd,
    networkCostUsd,
  } = input

  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0 ||
    !Number.isFinite(solPriceUsd) ||
    solPriceUsd <= 0
  ) {
    throw new Error("INVALID_USD_VALUATION_CONTEXT")
  }

  if (
    !validTimestamp(priceObservedAtMs, nowMs) ||
    !validTimestamp(entryQuotedAtMs, nowMs) ||
    !validTimestamp(exitQuotedAtMs, nowMs)
  ) {
    throw new Error("STALE_OR_INVALID_VALUATION_TIMESTAMP")
  }

  if (
    entryQuotedAtMs > exitQuotedAtMs ||
    priceObservedAtMs > exitQuotedAtMs
  ) {
    throw new Error("INCONSISTENT_VALUATION_TIMELINE")
  }

  if (
    !validCost(entryFeeUsd) ||
    !validCost(exitFeeUsd) ||
    !validCost(networkCostUsd)
  ) {
    throw new Error("INVALID_VALUATION_COST")
  }

  if (
    !observation ||
    observation.mode !== "SIMULATION" ||
    observation.tradeAllowed !== false ||
    observation.entry.direction !== "WSOL_TO_PONDSOL" ||
    observation.exit.direction !== "PONDSOL_TO_WSOL"
  ) {
    throw new Error("INVALID_PONDSOL_OBSERVATION")
  }

  const buy = observation.entry.quote
  const sell = observation.exit.quote

  if (
    buy.outputAmountBaseUnits !== sell.inputAmountBaseUnits
  ) {
    throw new Error("PONDSOL_VALUATION_AMOUNT_MISMATCH")
  }

  const entryUsd = buy.inputAmount * solPriceUsd
  const exitUsd = sell.outputAmount * solPriceUsd

  if (
    !Number.isFinite(entryUsd) ||
    !Number.isFinite(exitUsd) ||
    entryUsd <= 0 ||
    exitUsd <= 0
  ) {
    throw new Error("INVALID_PONDSOL_USD_AMOUNT")
  }

  return {
    entry: {
      routeId: buy.routeId,
      inputAsset: "USD",
      outputAsset: "pondSOL",
      inputAmount: entryUsd,
      outputAmount: buy.outputAmount,
      quotedAtMs: entryQuotedAtMs,
      estimatedFeeUsd: entryFeeUsd,
    },
    exit: {
      routeId: sell.routeId,
      inputAsset: "pondSOL",
      outputAsset: "USD",
      inputAmount: sell.inputAmount,
      outputAmount: exitUsd,
      quotedAtMs: exitQuotedAtMs,
      estimatedFeeUsd: exitFeeUsd,
    },
    networkCostUsd,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}
