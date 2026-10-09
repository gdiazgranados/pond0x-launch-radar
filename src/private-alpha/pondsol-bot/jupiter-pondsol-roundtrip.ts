import { readJupiterQuote } from "../read-only-quote-clients"
import {
  readPondsolJupiterQuote,
  type PondsolJupiterObservation,
} from "./jupiter-pondsol-adapter"
import { classifyLiquidityIndependence } from "./liquidity-independence"

export type PondsolRoundTripObservation = {
  entry: PondsolJupiterObservation
  exit: PondsolJupiterObservation
  liquidityClassification: "INDEPENDENT" | "SAME_LIQUIDITY" | "UNKNOWN"
  grossPnlWsol: number
  grossPnlPct: number
  tradeAllowed: false
  mode: "SIMULATION"
}

export async function observePondsolJupiterRoundTrip(
  initialWsolRaw: string,
  reader: typeof readJupiterQuote = readJupiterQuote
): Promise<PondsolRoundTripObservation> {
  const entry = await readPondsolJupiterQuote(
    "WSOL_TO_PONDSOL",
    initialWsolRaw,
    reader
  )

  const pondsolReceivedRaw = entry.quote.outputAmountBaseUnits

  const exit = await readPondsolJupiterQuote(
    "PONDSOL_TO_WSOL",
    pondsolReceivedRaw,
    reader
  )

  if (
    exit.quote.inputAmountBaseUnits !== pondsolReceivedRaw
  ) {
    throw new Error("ROUNDTRIP_AMOUNT_MISMATCH")
  }

  const liquidity = classifyLiquidityIndependence(
    entry.poolIds,
    exit.poolIds
  )

  const initialRaw = BigInt(initialWsolRaw)
  const finalRaw = BigInt(exit.quote.outputAmountBaseUnits)

  const deltaRaw = finalRaw - initialRaw
  const grossPnlWsol = Number(deltaRaw) / 1e9
  const grossPnlPct =
    Number(deltaRaw) / Number(initialRaw) * 100

  if (
    !Number.isFinite(grossPnlWsol) ||
    !Number.isFinite(grossPnlPct)
  ) {
    throw new Error("INVALID_ROUNDTRIP_CALCULATION")
  }

  return {
    entry,
    exit,
    liquidityClassification: liquidity.classification,
    grossPnlWsol,
    grossPnlPct,
    tradeAllowed: false,
    mode: "SIMULATION",
  }
}
