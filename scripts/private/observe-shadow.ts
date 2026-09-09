import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  buildShadowCandidate,
  type ShadowCandidateInput,
} from "../../src/private-alpha/shadow-candidate-pipeline"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import {
  buildShadowExecutionBasis,
  persistShadowExecutionBasis,
} from "../../src/private-alpha/shadow-execution-basis"
import {
  coordinateShadowCandidate,
  type CoordinateShadowCandidateInput,
} from "../../src/private-alpha/shadow-simulation-coordinator"
import type {
  MarketSnapshot,
  MarketTrends,
} from "../../src/private-alpha/public-market-evidence-adapter"
import type { ShadowToken } from "../../src/private-alpha/shadow-portfolio"
import type { SizeAwareQuoteObservation } from "../../src/private-alpha/size-aware-quote"

type ObservationEnvelope = {
  decisionId: string
  evaluatedAt: string
  tokenId: ShadowToken
  positionId: string
  ruleVersion: string
  windowKey: "1h" | "6h" | "24h"
  maxAgeMinutes: number
  operatorNote: string | null
  snapshot: MarketSnapshot
  trends: MarketTrends
  sizeAwareQuote: SizeAwareQuoteObservation
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function parseEnvelope(serialized: string): ObservationEnvelope {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid shadow observation JSON")
  }

  if (
    !record(value) ||
    !nonEmpty(value.decisionId) ||
    !nonEmpty(value.evaluatedAt) ||
    !Number.isFinite(Date.parse(value.evaluatedAt)) ||
    !["PNDC", "PORK", "wPOND", "PAPER"].includes(String(value.tokenId)) ||
    !nonEmpty(value.positionId) ||
    !nonEmpty(value.ruleVersion) ||
    !["1h", "6h", "24h"].includes(String(value.windowKey)) ||
    typeof value.maxAgeMinutes !== "number" ||
    !Number.isFinite(value.maxAgeMinutes) ||
    value.maxAgeMinutes <= 0 ||
    (value.operatorNote !== null && typeof value.operatorNote !== "string") ||
    !record(value.snapshot) ||
    !record(value.trends) ||
    !record(value.sizeAwareQuote)
  ) {
    throw new Error("invalid shadow observation envelope")
  }

  return value as ObservationEnvelope
}

async function main() {
  const inputPath = resolve(
    process.env.SHADOW_OBSERVATION_INPUT ??
      "private-data/shadow-observation-input.json"
  )
  const dataDirectory = resolve(
    process.env.SHADOW_DATA_DIR ?? "private-data"
  )
  const envelope = parseEnvelope(await readFile(inputPath, "utf8"))

  const candidateInput: ShadowCandidateInput = {
    snapshot: envelope.snapshot,
    trends: envelope.trends,
    tokenId: envelope.tokenId,
    windowKey: envelope.windowKey,
    now: new Date(envelope.evaluatedAt),
    maxAgeMinutes: envelope.maxAgeMinutes,
    sizeAwareQuote: envelope.sizeAwareQuote,
    positionId: envelope.positionId,
    ruleVersion: envelope.ruleVersion,
    operatorNote: envelope.operatorNote,
  }
  const candidate = buildShadowCandidate(candidateInput)
  const coordinateInput: CoordinateShadowCandidateInput = {
    decisionId: envelope.decisionId,
    evaluatedAt: envelope.evaluatedAt,
    tokenId: envelope.tokenId,
    positionId: envelope.positionId,
    ruleVersion: envelope.ruleVersion,
    candidate,
  }

  const result = await coordinateShadowCandidate(
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-portfolio.json")
    ),
    new PrivateFileLedgerStore(
      resolve(dataDirectory, "shadow-decisions.json")
    ),
    coordinateInput
  )

  let executionBasisRevision: number | null = null
  let executionBasisComplete = false
  if (candidate.status === "PROPOSED") {
    const basis = buildShadowExecutionBasis(
      candidate.proposal,
      envelope.sizeAwareQuote
    )
    const basisResult = await persistShadowExecutionBasis(
      new PrivateFileLedgerStore(
        resolve(dataDirectory, "shadow-execution-basis.json")
      ),
      basis,
      envelope.evaluatedAt
    )
    executionBasisRevision = basisResult.ledger.revision
    executionBasisComplete = true
  }

  console.log(JSON.stringify({
    simulationOnly: true,
    changed: result.changed,
    decisionStatus: candidate.status,
    blockingReasons: candidate.blockingReasons,
    auditRevision: result.audit.revision,
    portfolioRevision: result.state.portfolio.revision,
    executionBasisRevision,
    executionBasisComplete,
    positions: result.state.portfolio.positions.length,
    evaluation: result.state.evaluation,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "shadow observation failed"
  )
  process.exitCode = 1
})
