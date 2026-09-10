import type {
  Pond0xUnderlyingQuote,
} from "./pond0x-portal-observation"
import {
  PONDOX_REFERRAL_ACCOUNT,
} from "./pond0x-referral-vault-observer"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "./wpond-quote-observer"

export type Pond0xRoundTripQuoteLeg = {
  observedAt: string
  portalDisplayedAmountBaseUnits: string | null
  quote: Pond0xUnderlyingQuote | null
}

export type Pond0xRoundTripEconomics = {
  schemaVersion: 1
  simulationOnly: true
  walletConnected: false
  transactionRequested: false
  status: "MEASURED" | "BLOCKED"
  observedAt: string
  entryInputLamports: string | null
  acquiredTokenAmountBaseUnits: string | null
  exitInputTokenAmountBaseUnits: string | null
  exitOutputLamports: string | null
  entryDeclaredFeeBps: number | null
  exitDeclaredFeeBps: number | null
  totalDeclaredFeeBps: number | null
  roundTripLossLamports: string | null
  roundTripLossBps: number | null
  breakEvenAppreciationBps: number | null
  entryRouteLabels: ReadonlyArray<string>
  exitRouteLabels: ReadonlyArray<string>
  blockingReasons: ReadonlyArray<string>
  source: "PONDOX_PORTAL_ULTRA_ROUND_TRIP"
}

function positiveInteger(
  value: string | null | undefined
): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
}

function nonNegativeFee(value: number | null) {
  return value === null || (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10_000
  )
}

function ratioBps(numerator: bigint, denominator: bigint) {
  if (denominator <= BigInt(0)) {
    throw new Error("ratio denominator must be positive")
  }
  return Number(
    numerator * BigInt(100_000_000) / denominator
  ) / 10_000
}

export function evaluatePond0xRoundTripEconomics(input: {
  observedAt: string
  entry: Pond0xRoundTripQuoteLeg
  exit: Pond0xRoundTripQuoteLeg
}): Pond0xRoundTripEconomics {
  const reasons: string[] = []
  const entry = input.entry.quote
  const exit = input.exit.quote

  if (!Number.isFinite(Date.parse(input.observedAt))) {
    reasons.push("PONDOX_ROUND_TRIP_TIMESTAMP_INVALID")
  }
  if (!entry) reasons.push("PONDOX_ENTRY_QUOTE_UNAVAILABLE")
  if (!exit) reasons.push("PONDOX_EXIT_QUOTE_UNAVAILABLE")

  const entryTime = Date.parse(input.entry.observedAt)
  const exitTime = Date.parse(input.exit.observedAt)
  if (!Number.isFinite(entryTime)) {
    reasons.push("PONDOX_ENTRY_TIMESTAMP_INVALID")
  }
  if (!Number.isFinite(exitTime)) {
    reasons.push("PONDOX_EXIT_TIMESTAMP_INVALID")
  }
  if (
    Number.isFinite(entryTime) &&
    Number.isFinite(exitTime) &&
    (
      exitTime < entryTime ||
      exitTime - entryTime > 120_000
    )
  ) {
    reasons.push("PONDOX_ROUND_TRIP_QUOTE_WINDOW_INVALID")
  }

  if (entry) {
    if (
      entry.provider !== "JUPITER_ULTRA" ||
      entry.sourceHost !== "ultra-api.jup.ag" ||
      entry.sourcePath !== "/order" ||
      entry.httpStatus !== 200
    ) {
      reasons.push("PONDOX_ENTRY_SOURCE_INVALID")
    }
    if (
      entry.inputMint !== WRAPPED_SOL_MINT ||
      entry.outputMint !== WPOND_MINT
    ) {
      reasons.push("PONDOX_ENTRY_MINT_MISMATCH")
    }
    if (
      !positiveInteger(entry.inAmount) ||
      !positiveInteger(entry.outAmount)
    ) {
      reasons.push("PONDOX_ENTRY_AMOUNT_INVALID")
    }
    if (!nonNegativeFee(entry.feeBps)) {
      reasons.push("PONDOX_ENTRY_FEE_INVALID")
    }
    if (
      entry.referralAccount !== PONDOX_REFERRAL_ACCOUNT ||
      entry.referralFeeBps !== entry.feeBps
    ) {
      reasons.push("PONDOX_ENTRY_REFERRAL_MISMATCH")
    }
    if (
      input.entry.portalDisplayedAmountBaseUnits !==
      entry.outAmount
    ) {
      reasons.push("PONDOX_ENTRY_DISPLAY_MISMATCH")
    }
  }

  if (exit) {
    if (
      exit.provider !== "JUPITER_ULTRA" ||
      exit.sourceHost !== "ultra-api.jup.ag" ||
      exit.sourcePath !== "/order" ||
      exit.httpStatus !== 200
    ) {
      reasons.push("PONDOX_EXIT_SOURCE_INVALID")
    }
    if (
      exit.inputMint !== WPOND_MINT ||
      exit.outputMint !== WRAPPED_SOL_MINT
    ) {
      reasons.push("PONDOX_EXIT_MINT_MISMATCH")
    }
    if (
      !positiveInteger(exit.inAmount) ||
      !positiveInteger(exit.outAmount)
    ) {
      reasons.push("PONDOX_EXIT_AMOUNT_INVALID")
    }
    if (!nonNegativeFee(exit.feeBps)) {
      reasons.push("PONDOX_EXIT_FEE_INVALID")
    }
    if (
      exit.referralAccount !== PONDOX_REFERRAL_ACCOUNT ||
      exit.referralFeeBps !== exit.feeBps
    ) {
      reasons.push("PONDOX_EXIT_REFERRAL_MISMATCH")
    }
    if (
      input.exit.portalDisplayedAmountBaseUnits !==
      exit.outAmount
    ) {
      reasons.push("PONDOX_EXIT_DISPLAY_MISMATCH")
    }
  }

  if (
    entry &&
    exit &&
    positiveInteger(entry.outAmount) &&
    exit.inAmount !== entry.outAmount
  ) {
    reasons.push("PONDOX_EXIT_INPUT_NOT_EXACT_ENTRY_OUTPUT")
  }

  const uniqueReasons = [...new Set(reasons)]
  const entryInput = positiveInteger(entry?.inAmount)
    ? BigInt(entry.inAmount)
    : null
  const acquired = positiveInteger(entry?.outAmount)
    ? entry.outAmount
    : null
  const exitInput = positiveInteger(exit?.inAmount)
    ? exit.inAmount
    : null
  const exitOutput = positiveInteger(exit?.outAmount)
    ? BigInt(exit.outAmount)
    : null
  const measured =
    uniqueReasons.length === 0 &&
    entryInput !== null &&
    exitOutput !== null

  const loss = measured
    ? entryInput - exitOutput
    : null
  const entryFee = entry?.feeBps ?? null
  const exitFee = exit?.feeBps ?? null

  return {
    schemaVersion: 1,
    simulationOnly: true,
    walletConnected: false,
    transactionRequested: false,
    status: measured ? "MEASURED" : "BLOCKED",
    observedAt: input.observedAt,
    entryInputLamports: entryInput?.toString() ?? null,
    acquiredTokenAmountBaseUnits: acquired,
    exitInputTokenAmountBaseUnits: exitInput,
    exitOutputLamports: exitOutput?.toString() ?? null,
    entryDeclaredFeeBps: entryFee,
    exitDeclaredFeeBps: exitFee,
    totalDeclaredFeeBps:
      entryFee !== null && exitFee !== null
        ? entryFee + exitFee
        : null,
    roundTripLossLamports: loss?.toString() ?? null,
    roundTripLossBps:
      loss !== null && entryInput !== null
        ? ratioBps(loss, entryInput)
        : null,
    breakEvenAppreciationBps:
      loss !== null && loss > BigInt(0) && exitOutput !== null
        ? ratioBps(loss, exitOutput)
        : loss !== null
          ? 0
          : null,
    entryRouteLabels: entry?.routeLabels ?? [],
    exitRouteLabels: exit?.routeLabels ?? [],
    blockingReasons: uniqueReasons,
    source: "PONDOX_PORTAL_ULTRA_ROUND_TRIP",
  }
}
