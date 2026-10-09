import type { QuoteLeg } from "./quote-adapter"

export type QuoteProvenance = {
  quote: QuoteLeg
  reportedPoolIds: unknown
  expectedPoolIds: unknown
}

export type ProvenanceDecision = {
  verified: boolean
  reasons: string[]
  tradeAllowed: false
}

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function parsePoolIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  if (!value.every(
    (id) => typeof id === "string" && SOLANA_ADDRESS.test(id)
  )) {
    return null
  }

  if (new Set(value).size !== value.length) {
    return null
  }

  return value
}

export function verifyQuoteProvenance(
  input: QuoteProvenance
): ProvenanceDecision {
  const reasons: string[] = []

  const reported = parsePoolIds(input.reportedPoolIds)
  const expected = parsePoolIds(input.expectedPoolIds)

  if (!reported || !expected) {
    reasons.push("INVALID_POOL_PROVENANCE")
  } else {
    const reportedSet = new Set(reported)
    const expectedSet = new Set(expected)

    if (
      reportedSet.size !== expectedSet.size ||
      [...reportedSet].some((id) => !expectedSet.has(id))
    ) {
      reasons.push("POOL_PROVENANCE_MISMATCH")
    }
  }

  if (
    !input.quote ||
    typeof input.quote.routeId !== "string" ||
    !input.quote.routeId.trim()
  ) {
    reasons.push("INVALID_QUOTE_IDENTITY")
  }

  return {
    verified: reasons.length === 0,
    reasons,
    tradeAllowed: false,
  }
}
