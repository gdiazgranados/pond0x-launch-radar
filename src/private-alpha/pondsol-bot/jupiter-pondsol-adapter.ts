import {
  readJupiterQuote,
  type JupiterQuoteRequest,
  type ReadOnlyQuoteLeg,
} from "../read-only-quote-clients"
import { PONDSOL_TOKEN_IDENTITY } from "./pondsol-token-identity"

export const WSOL_MINT =
  "So11111111111111111111111111111111111111112"

export type PondsolJupiterDirection =
  | "WSOL_TO_PONDSOL"
  | "PONDSOL_TO_WSOL"

export type PondsolJupiterObservation = {
  direction: PondsolJupiterDirection
  quote: ReadOnlyQuoteLeg
  poolIds: string[]
  tradeAllowed: false
  mode: "SIMULATION"
}

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function validPositiveRaw(value: unknown): value is string {
  return typeof value === "string" &&
    /^[1-9]\d*$/.test(value)
}

export function validatePondsolJupiterQuote(
  direction: PondsolJupiterDirection,
  requestedRawAmount: string,
  quote: ReadOnlyQuoteLeg
): PondsolJupiterObservation {
  if (
    direction !== "WSOL_TO_PONDSOL" &&
    direction !== "PONDSOL_TO_WSOL"
  ) {
    throw new Error("INVALID_PONDSOL_DIRECTION")
  }

  if (
    !validPositiveRaw(requestedRawAmount) ||
    !quote ||
    !validPositiveRaw(quote.inputAmountBaseUnits) ||
    !validPositiveRaw(quote.outputAmountBaseUnits)
  ) {
    throw new Error("INVALID_PONDSOL_RAW_AMOUNT")
  }

  if (quote.inputAmountBaseUnits !== requestedRawAmount) {
    throw new Error("PONDSOL_INPUT_AMOUNT_MISMATCH")
  }

  if (
    typeof quote.routeId !== "string" ||
    !quote.routeId.startsWith("jupiter:") ||
    !Number.isFinite(quote.inputAmount) ||
    !Number.isFinite(quote.outputAmount) ||
    quote.inputAmount <= 0 ||
    quote.outputAmount <= 0 ||
    !Number.isFinite(quote.estimatedFeeUsd) ||
    quote.estimatedFeeUsd < 0
  ) {
    throw new Error("INVALID_PONDSOL_QUOTE")
  }

  const expectedInput = Number(quote.inputAmountBaseUnits) / 1e9
  const expectedOutput = Number(quote.outputAmountBaseUnits) / 1e9

  if (
    quote.inputAmount !== expectedInput ||
    quote.outputAmount !== expectedOutput
  ) {
    throw new Error("PONDSOL_UNIT_MISMATCH")
  }

  if (
    !Array.isArray(quote.venueIds) ||
    quote.venueIds.length === 0 ||
    quote.venueIds.some(
      (id) =>
        typeof id !== "string" ||
        !SOLANA_ADDRESS.test(id)
    )
  ) {
    throw new Error("INVALID_PONDSOL_POOL_IDS")
  }

  const poolIds = [...quote.venueIds]

  if (new Set(poolIds).size !== poolIds.length) {
    throw new Error("DUPLICATE_PONDSOL_POOL_IDS")
  }

  return {
    direction,
    quote,
    poolIds,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}

export async function readPondsolJupiterQuote(
  direction: PondsolJupiterDirection,
  inputAmountBaseUnits: string,
  reader: typeof readJupiterQuote = readJupiterQuote
): Promise<PondsolJupiterObservation> {
  if (!validPositiveRaw(inputAmountBaseUnits)) {
    throw new Error("INVALID_PONDSOL_RAW_AMOUNT")
  }

  const buying = direction === "WSOL_TO_PONDSOL"

  if (!buying && direction !== "PONDSOL_TO_WSOL") {
    throw new Error("INVALID_PONDSOL_DIRECTION")
  }

  const request: JupiterQuoteRequest = {
    inputToken: buying
      ? WSOL_MINT
      : PONDSOL_TOKEN_IDENTITY.mint,
    outputToken: buying
      ? PONDSOL_TOKEN_IDENTITY.mint
      : WSOL_MINT,
    inputAmountBaseUnits,
    inputDecimals: 9,
    outputDecimals: 9,
    estimatedFeeUsd: 0,
  }

  const quote = await reader(request)

  return validatePondsolJupiterQuote(
    direction,
    inputAmountBaseUnits,
    quote
  )
}
