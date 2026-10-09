import type { TimedPondsolRoundTrip } from "./timed-pondsol-roundtrip"
import type { PondsolRoundTripObservation } from "./jupiter-pondsol-roundtrip"
import {
  valuePondsolRoundTripUsd,
  type PondsolUsdValuation,
} from "./pondsol-usd-valuation"

export type TimedUsdValuationInput = {
  cycle: TimedPondsolRoundTrip
  solPriceUsd: number
  priceObservedAtMs: number
  nowMs: number
  entryFeeUsd: number
  exitFeeUsd: number
  networkCostUsd: number
}

export type TimedUsdValuation = PondsolUsdValuation & {
  priceAndCostsVerified: false
  tradeAllowed: false
  mode: "SIMULATION"
}

export function valueTimedPondsolRoundTripUsd(
  input: TimedUsdValuationInput
): TimedUsdValuation {
  const { cycle } = input

  if (
    !cycle ||
    cycle.mode !== "SIMULATION" ||
    cycle.tradeAllowed !== false ||
    cycle.liquidityClassification !== "INDEPENDENT"
  ) {
    throw new Error("TIMED_USD_LIQUIDITY_UNVERIFIED")
  }

  if (
    !cycle.entry ||
    !cycle.exit ||
    cycle.entry.mode !== "SIMULATION" ||
    cycle.exit.mode !== "SIMULATION" ||
    cycle.entry.tradeAllowed !== false ||
    cycle.exit.tradeAllowed !== false
  ) {
    throw new Error("INVALID_TIMED_USD_CYCLE")
  }

  const entryQuote = cycle.entry.observation.quote
  const exitQuote = cycle.exit.observation.quote

  const initialRaw = BigInt(entryQuote.inputAmountBaseUnits)
  const finalRaw = BigInt(exitQuote.outputAmountBaseUnits)

  if (initialRaw <= BigInt(0) || finalRaw <= BigInt(0)) {
    throw new Error("INVALID_TIMED_USD_RAW_AMOUNTS")
  }

  const deltaRaw = finalRaw - initialRaw

  if (
    initialRaw > BigInt(Number.MAX_SAFE_INTEGER) ||
    finalRaw > BigInt(Number.MAX_SAFE_INTEGER) ||
    deltaRaw > BigInt(Number.MAX_SAFE_INTEGER) ||
    deltaRaw < -BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error("UNSAFE_TIMED_USD_RAW_AMOUNTS")
  }

  const grossPnlWsol = Number(deltaRaw) / 1e9
  const grossPnlPct =
    Number(deltaRaw) / Number(initialRaw) * 100

  if (
    !Number.isFinite(grossPnlWsol) ||
    !Number.isFinite(grossPnlPct)
  ) {
    throw new Error("INVALID_TIMED_USD_CALCULATION")
  }

  const observation: PondsolRoundTripObservation = {
    entry: cycle.entry.observation,
    exit: cycle.exit.observation,
    liquidityClassification: cycle.liquidityClassification,
    grossPnlWsol,
    grossPnlPct,
    tradeAllowed: false,
    mode: "SIMULATION",
  }

  const valuation = valuePondsolRoundTripUsd({
    observation,
    solPriceUsd: input.solPriceUsd,
    priceObservedAtMs: input.priceObservedAtMs,
    entryQuotedAtMs: cycle.entry.responseReceivedAtMs,
    exitQuotedAtMs: cycle.exit.responseReceivedAtMs,
    nowMs: input.nowMs,
    entryFeeUsd: input.entryFeeUsd,
    exitFeeUsd: input.exitFeeUsd,
    networkCostUsd: input.networkCostUsd,
  })

  return {
    ...valuation,
    priceAndCostsVerified: false,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}
