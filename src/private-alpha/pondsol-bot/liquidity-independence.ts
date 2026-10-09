export type LiquidityIndependenceResult = {
  classification: "INDEPENDENT" | "SAME_LIQUIDITY" | "UNKNOWN"
  sharedPoolIds: string[]
  tradeAllowed: false
  reason: "PAPER_ONLY_NO_EXECUTION"
}

function validPoolIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const ids: string[] = []

  for (const id of value) {
    if (
      typeof id !== "string" ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)
    ) return null

    ids.push(id)
  }

  return ids
}

export function classifyLiquidityIndependence(
  entryPoolIds: unknown,
  exitPoolIds: unknown
): LiquidityIndependenceResult {
  const entry = validPoolIds(entryPoolIds)
  const exit = validPoolIds(exitPoolIds)

  let classification: LiquidityIndependenceResult["classification"] =
    "UNKNOWN"

  let sharedPoolIds: string[] = []

  if (entry && exit) {
    const exitSet = new Set(exit)
    sharedPoolIds = [...new Set(entry.filter((id) => exitSet.has(id)))]

    classification = sharedPoolIds.length > 0
      ? "SAME_LIQUIDITY"
      : "INDEPENDENT"
  }

  return {
    classification,
    sharedPoolIds,
    tradeAllowed: false,
    reason: "PAPER_ONLY_NO_EXECUTION",
  }
}
