import type { TimedPondsolRoundTrip } from "./timed-pondsol-roundtrip"

export type IntegrityKind =
  | "SOL_PRICE"
  | "ENTRY_SWAP"
  | "EXIT_SWAP"
  | "NETWORK"
  | "PRIORITY"
  | "RENT"

export type BoundMarketEvidence = {
  kind: IntegrityKind
  cycleId: string
  observedAtMs: number
  routeId: string | null
  source: string
}

export type MarketIntegrityInput = {
  cycleId: string
  cycle: TimedPondsolRoundTrip
  evidence: readonly BoundMarketEvidence[]
  nowMs: number
}

export type MarketIntegrityResult = {
  structurallyConsistent: boolean
  independentlyVerified: false
  reasons: string[]
  decision: "NO_TRADE"
  tradeAllowed: false
  mode: "SIMULATION"
}

const KINDS: readonly IntegrityKind[] = [
  "SOL_PRICE",
  "ENTRY_SWAP",
  "EXIT_SWAP",
  "NETWORK",
  "PRIORITY",
  "RENT",
]

const ID = /^[A-Za-z0-9][A-Za-z0-9:_./-]{0,127}$/
const MAX_AGE_MS = 30_000

export function evaluateMarketEvidenceIntegrity(
  input: MarketIntegrityInput
): MarketIntegrityResult {
  const reasons: string[] = []

  const finish = (): MarketIntegrityResult => ({
    structurallyConsistent: reasons.length === 0,
    independentlyVerified: false,
    reasons: [...new Set(reasons)],
    decision: "NO_TRADE",
    tradeAllowed: false,
    mode: "SIMULATION",
  })

  try {
    if (
      !input ||
      !ID.test(input.cycleId ?? "") ||
      !Array.isArray(input.evidence) ||
      !Number.isSafeInteger(input.nowMs) ||
      input.nowMs <= 0
    ) {
      reasons.push("INVALID_INTEGRITY_INPUT")
      return finish()
    }

    const cycle = input.cycle

    if (
      !cycle ||
      cycle.mode !== "SIMULATION" ||
      cycle.tradeAllowed !== false ||
      !cycle.entry ||
      !cycle.exit ||
      cycle.entry.mode !== "SIMULATION" ||
      cycle.exit.mode !== "SIMULATION" ||
      cycle.entry.tradeAllowed !== false ||
      cycle.exit.tradeAllowed !== false
    ) {
      reasons.push("INVALID_SIMULATION_CYCLE")
      return finish()
    }

    const entry = cycle.entry
    const exit = cycle.exit

    const start = entry.requestStartedAtMs
    const entryEnd = entry.responseReceivedAtMs
    const exitStart = exit.requestStartedAtMs
    const end = exit.responseReceivedAtMs

    if (
      ![start, entryEnd, exitStart, end].every(
        x => Number.isSafeInteger(x) && x > 0
      ) ||
      start > entryEnd ||
      entryEnd > exitStart ||
      exitStart > end ||
      end > input.nowMs ||
      input.nowMs - start > MAX_AGE_MS ||
      cycle.cycleDurationMs !== end - start
    ) {
      reasons.push("INVALID_CYCLE_TIMELINE")
      return finish()
    }

    const entryRoute = entry.observation?.quote?.routeId
    const exitRoute = exit.observation?.quote?.routeId

    if (
      typeof entryRoute !== "string" ||
      typeof exitRoute !== "string" ||
      !ID.test(entryRoute) ||
      !ID.test(exitRoute) ||
      entryRoute === exitRoute
    ) {
      reasons.push("INVALID_CYCLE_ROUTES")
      return finish()
    }

    if (
      entry.observation.direction !== "WSOL_TO_PONDSOL" ||
      exit.observation.direction !== "PONDSOL_TO_WSOL" ||
      entry.observation.quote.outputAmountBaseUnits !==
        exit.observation.quote.inputAmountBaseUnits
    ) {
      reasons.push("INVALID_CYCLE_CONTINUITY")
    }

    const entryPools = entry.observation.poolIds
    const exitPools = exit.observation.poolIds

    if (
      !Array.isArray(entryPools) ||
      !Array.isArray(exitPools) ||
      entryPools.length === 0 ||
      exitPools.length === 0 ||
      entryPools.some(x => typeof x !== "string" || !ID.test(x)) ||
      exitPools.some(x => typeof x !== "string" || !ID.test(x)) ||
      new Set(entryPools).size !== entryPools.length ||
      new Set(exitPools).size !== exitPools.length
    ) {
      reasons.push("INVALID_POOL_IDENTITIES")
    } else {
      const overlap = entryPools.some(x => exitPools.includes(x))
      if (overlap || cycle.liquidityClassification !== "INDEPENDENT") {
        reasons.push("LIQUIDITY_NOT_STRUCTURALLY_INDEPENDENT")
      }
    }

    const seen = new Set<IntegrityKind>()

    for (const item of input.evidence) {
      if (!item || !KINDS.includes(item.kind)) {
        reasons.push("UNKNOWN_EVIDENCE_KIND")
        continue
      }

      if (seen.has(item.kind)) {
        reasons.push("DUPLICATE_EVIDENCE_KIND")
      }
      seen.add(item.kind)

      if (item.cycleId !== input.cycleId) {
        reasons.push("CROSS_CYCLE_EVIDENCE")
      }

      if (
        typeof item.source !== "string" ||
        !item.source.trim()
      ) {
        reasons.push("UNKNOWN_EVIDENCE_SOURCE")
      }

      if (
        !Number.isSafeInteger(item.observedAtMs) ||
        item.observedAtMs < start ||
        item.observedAtMs > end
      ) {
        reasons.push("EVIDENCE_OUTSIDE_CYCLE")
      }

      if (item.kind === "ENTRY_SWAP") {
        if (item.routeId !== entryRoute) {
          reasons.push("ENTRY_ROUTE_MISMATCH")
        }
        if (
          item.observedAtMs < start ||
          item.observedAtMs > entryEnd
        ) {
          reasons.push("ENTRY_EVIDENCE_OUTSIDE_LEG")
        }
      } else if (item.kind === "EXIT_SWAP") {
        if (item.routeId !== exitRoute) {
          reasons.push("EXIT_ROUTE_MISMATCH")
        }
        if (
          item.observedAtMs < exitStart ||
          item.observedAtMs > end
        ) {
          reasons.push("EXIT_EVIDENCE_OUTSIDE_LEG")
        }
      } else if (
        item.routeId !== null &&
        item.routeId !== entryRoute &&
        item.routeId !== exitRoute
      ) {
        reasons.push("UNKNOWN_EVIDENCE_ROUTE")
      }
    }

    for (const kind of KINDS) {
      if (!seen.has(kind)) {
        reasons.push("MISSING_" + kind)
      }
    }

    return finish()
  } catch {
    reasons.push("INTEGRITY_VALIDATION_REJECTED")
    return finish()
  }
}
