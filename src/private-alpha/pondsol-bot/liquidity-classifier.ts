export type LiquidityQuoteStatus =
  | "QUOTED"
  | "NO_BIN_ARRAYS"
  | "FAILED"

export type LiquidityQuote = {
  input: "WSOL" | "pondSOL"
  status: LiquidityQuoteStatus
  outAmount?: string
  error?: string
}

export type DirectionStatus =
  | "QUOTABLE"
  | "NO_QUOTE"
  | "INSUFFICIENT_LIQUIDITY"
  | "UNKNOWN"

export type PoolLiquidityStatus =
  | "NO_QUOTE"
  | "INSUFFICIENT_LIQUIDITY"
  | "ONE_WAY_ONLY"
  | "TWO_WAY_QUOTABLE"
  | "UNKNOWN"

export type PoolLiquidityDecision = {
  classification: PoolLiquidityStatus
  buy: DirectionStatus
  sell: DirectionStatus
  tradeAllowed: false
  reason: "PAPER_ONLY_NO_EXECUTION"
}

function isPositiveInteger(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d+$/.test(value) &&
    BigInt(value) > BigInt(0)
  )
}

function classifyDirection(
  quotes: LiquidityQuote[]
): DirectionStatus {
  if (quotes.length === 0) return "UNKNOWN"

  // Unknown or malformed observations must not be treated
  // as proof of insufficient liquidity.
  if (quotes.some((quote) => {
    if (!quote || typeof quote !== "object") return true

    if (quote.status === "QUOTED") {
      return !isPositiveInteger(quote.outAmount)
    }

    if (quote.status === "FAILED") {
      return typeof quote.error !== "string"
    }

    return quote.status !== "NO_BIN_ARRAYS"
  })) {
    return "UNKNOWN"
  }

  // Mixed SDK outcomes are ambiguous and must fail closed.
  const failures = quotes.filter((quote) => quote.status === "FAILED")

  if (failures.some((quote) =>
    !/insufficient liquidity/i.test(quote.error ?? "")
  )) {
    return "UNKNOWN"
  }

  if (quotes.some((quote) => quote.status === "QUOTED")) {
    return failures.length === 0 ? "QUOTABLE" : "UNKNOWN"
  }

  if (failures.length > 0) {
    return "INSUFFICIENT_LIQUIDITY"
  }

  if (quotes.every((quote) =>
    quote.status === "NO_BIN_ARRAYS"
  )) {
    return "NO_QUOTE"
  }

  return "UNKNOWN"
}

export function classifyPoolLiquidity(
  quotes: LiquidityQuote[]
): PoolLiquidityDecision {
  const observations = Array.isArray(quotes) ? quotes : []

  const buy = classifyDirection(
    observations.filter((quote) => quote?.input === "WSOL")
  )

  const sell = classifyDirection(
    observations.filter((quote) => quote?.input === "pondSOL")
  )

  let classification: PoolLiquidityStatus = "UNKNOWN"

  if (buy === "UNKNOWN" || sell === "UNKNOWN") {
    classification = "UNKNOWN"
  } else if (buy === "QUOTABLE" && sell === "QUOTABLE") {
    classification = "TWO_WAY_QUOTABLE"
  } else if (buy === "QUOTABLE" || sell === "QUOTABLE") {
    classification = "ONE_WAY_ONLY"
  } else if (
    buy === "INSUFFICIENT_LIQUIDITY" ||
    sell === "INSUFFICIENT_LIQUIDITY"
  ) {
    classification = "INSUFFICIENT_LIQUIDITY"
  } else if (buy === "NO_QUOTE" && sell === "NO_QUOTE") {
    classification = "NO_QUOTE"
  }

  return {
    classification,
    buy,
    sell,
    tradeAllowed: false,
    reason: "PAPER_ONLY_NO_EXECUTION",
  }
}
