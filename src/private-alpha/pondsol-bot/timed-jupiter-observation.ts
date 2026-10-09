import { readJupiterQuote } from "../read-only-quote-clients"
import {
  readPondsolJupiterQuote,
  type PondsolJupiterDirection,
  type PondsolJupiterObservation,
} from "./jupiter-pondsol-adapter"
import { PONDSOL_RISK_CONFIG } from "./risk-config"

export type TimedPondsolObservation = {
  observation: PondsolJupiterObservation
  requestStartedAtMs: number
  responseReceivedAtMs: number
  durationMs: number
  tradeAllowed: false
  mode: "SIMULATION"
}

export async function readTimedPondsolJupiterQuote(
  direction: PondsolJupiterDirection,
  inputAmountBaseUnits: string,
  reader: typeof readJupiterQuote = readJupiterQuote,
  clock: () => number = Date.now
): Promise<TimedPondsolObservation> {
  const requestStartedAtMs = clock()

  if (
    !Number.isSafeInteger(requestStartedAtMs) ||
    requestStartedAtMs <= 0
  ) {
    throw new Error("INVALID_QUOTE_OBSERVATION_CLOCK")
  }

  const observation = await readPondsolJupiterQuote(
    direction,
    inputAmountBaseUnits,
    reader
  )

  const responseReceivedAtMs = clock()

  if (
    !Number.isSafeInteger(responseReceivedAtMs) ||
    responseReceivedAtMs < requestStartedAtMs
  ) {
    throw new Error("INVALID_QUOTE_OBSERVATION_CLOCK")
  }

  const durationMs =
    responseReceivedAtMs - requestStartedAtMs

  if (
    durationMs >
    PONDSOL_RISK_CONFIG.maxQuoteAgeSeconds * 1000
  ) {
    throw new Error("QUOTE_RESPONSE_TOO_SLOW")
  }

  return {
    observation,
    requestStartedAtMs,
    responseReceivedAtMs,
    durationMs,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}
