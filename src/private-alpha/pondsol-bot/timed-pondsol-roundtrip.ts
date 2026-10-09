import { readJupiterQuote } from "../read-only-quote-clients"
import { classifyLiquidityIndependence } from "./liquidity-independence"
import { PONDSOL_RISK_CONFIG } from "./risk-config"
import {
  readTimedPondsolJupiterQuote,
  type TimedPondsolObservation,
} from "./timed-jupiter-observation"

export type TimedPondsolRoundTrip = {
  entry: TimedPondsolObservation
  exit: TimedPondsolObservation
  liquidityClassification: "INDEPENDENT" | "SAME_LIQUIDITY" | "UNKNOWN"
  cycleDurationMs: number
  tradeAllowed: false
  mode: "SIMULATION"
}

export async function observeTimedPondsolRoundTrip(
  initialWsolRaw: string,
  reader: typeof readJupiterQuote = readJupiterQuote,
  clock: () => number = Date.now
): Promise<TimedPondsolRoundTrip> {
  const entry = await readTimedPondsolJupiterQuote(
    "WSOL_TO_PONDSOL",
    initialWsolRaw,
    reader,
    clock
  )

  const receivedPondsolRaw =
    entry.observation.quote.outputAmountBaseUnits

  const exit = await readTimedPondsolJupiterQuote(
    "PONDSOL_TO_WSOL",
    receivedPondsolRaw,
    reader,
    clock
  )

  if (
    exit.observation.quote.inputAmountBaseUnits !==
    receivedPondsolRaw
  ) {
    throw new Error("TIMED_ROUNDTRIP_AMOUNT_MISMATCH")
  }

  if (
    exit.requestStartedAtMs < entry.responseReceivedAtMs
  ) {
    throw new Error("TIMED_ROUNDTRIP_OVERLAP")
  }

  const cycleDurationMs =
    exit.responseReceivedAtMs - entry.requestStartedAtMs

  if (
    !Number.isSafeInteger(cycleDurationMs) ||
    cycleDurationMs < 0 ||
    cycleDurationMs >
      PONDSOL_RISK_CONFIG.maxQuoteAgeSeconds * 1000
  ) {
    throw new Error("TIMED_ROUNDTRIP_TOO_OLD")
  }

  const liquidity = classifyLiquidityIndependence(
    entry.observation.poolIds,
    exit.observation.poolIds
  )

  return {
    entry,
    exit,
    liquidityClassification: liquidity.classification,
    cycleDurationMs,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}
