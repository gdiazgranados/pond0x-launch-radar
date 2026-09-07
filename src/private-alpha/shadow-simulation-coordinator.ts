import type { ShadowCandidateResult } from "./shadow-candidate-pipeline"
import { evaluateShadowPortfolio } from "./shadow-portfolio-evaluation"
import {
  loadShadowPortfolio,
  persistShadowPosition,
  type PrivateShadowPortfolioStore,
  type ShadowPortfolioLedger,
} from "./shadow-portfolio-repository"
import type {
  ShadowPosition,
  ShadowToken,
} from "./shadow-portfolio"

export type ShadowDecisionAuditRecord = {
  decisionId: string
  evaluatedAt: string
  tokenId: ShadowToken
  positionId: string
  ruleVersion: string
  status: "PROPOSED" | "BLOCKED"
  blockingReasons: ReadonlyArray<string>
  portfolioRevision: number | null
}

export type ShadowDecisionAuditLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  records: ReadonlyArray<ShadowDecisionAuditRecord>
}

export type PrivateShadowDecisionStore = {
  read(): Promise<string | null>
  compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ): Promise<boolean>
}

export type CoordinateShadowCandidateInput = {
  decisionId: string
  evaluatedAt: string
  tokenId: ShadowToken
  positionId: string
  ruleVersion: string
  candidate: ShadowCandidateResult
}

export type ShadowSimulationState = {
  portfolio: ShadowPortfolioLedger
  evaluation: ReturnType<typeof evaluateShadowPortfolio>
}

export type CoordinateShadowCandidateResult = {
  changed: boolean
  audit: ShadowDecisionAuditLedger
  state: ShadowSimulationState
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function validTimestamp(value: unknown) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  )
}

function validString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
}

function assertAuditRecord(
  value: unknown
): asserts value is ShadowDecisionAuditRecord {
  if (!record(value)) throw new Error("invalid shadow decision record")
  if (
    !validString(value.decisionId) ||
    !validTimestamp(value.evaluatedAt) ||
    !validString(value.tokenId) ||
    !validString(value.positionId) ||
    !validString(value.ruleVersion) ||
    (value.status !== "PROPOSED" && value.status !== "BLOCKED") ||
    !Array.isArray(value.blockingReasons) ||
    !value.blockingReasons.every(validString) ||
    (value.portfolioRevision !== null &&
      (!Number.isInteger(value.portfolioRevision) ||
        Number(value.portfolioRevision) < 1))
  ) {
    throw new Error("invalid shadow decision record")
  }
  if (
    value.status === "PROPOSED" &&
    (value.blockingReasons.length !== 0 ||
      value.portfolioRevision === null)
  ) {
    throw new Error("invalid proposed decision audit")
  }
  if (
    value.status === "BLOCKED" &&
    (value.blockingReasons.length === 0 ||
      value.portfolioRevision !== null)
  ) {
    throw new Error("invalid blocked decision audit")
  }
}

export function emptyShadowDecisionAuditLedger(): ShadowDecisionAuditLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    records: [],
  }
}

export function parseShadowDecisionAuditLedger(
  serialized: string
): ShadowDecisionAuditLedger {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid private shadow decision JSON")
  }
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null &&
      !validTimestamp(value.updatedAt)) ||
    !Array.isArray(value.records)
  ) {
    throw new Error("invalid private shadow decision ledger")
  }

  const ids = new Set<string>()
  for (const item of value.records) {
    assertAuditRecord(item)
    if (ids.has(item.decisionId)) {
      throw new Error(
        `duplicate shadow decisionId: ${item.decisionId}`
      )
    }
    ids.add(item.decisionId)
  }

  return structuredClone(value as ShadowDecisionAuditLedger)
}

export async function loadShadowDecisionAudit(
  store: PrivateShadowDecisionStore
) {
  const serialized = await store.read()
  return serialized === null
    ? emptyShadowDecisionAuditLedger()
    : parseShadowDecisionAuditLedger(serialized)
}

export async function loadShadowSimulationState(
  store: PrivateShadowPortfolioStore
): Promise<ShadowSimulationState> {
  const portfolio = await loadShadowPortfolio(store)
  return {
    portfolio,
    evaluation: evaluateShadowPortfolio(portfolio.positions),
  }
}

function comparableRecord(
  record: ShadowDecisionAuditRecord
) {
  return {
    decisionId: record.decisionId,
    evaluatedAt: record.evaluatedAt,
    tokenId: record.tokenId,
    positionId: record.positionId,
    ruleVersion: record.ruleVersion,
    status: record.status,
    blockingReasons: record.blockingReasons,
  }
}

function validateCandidateIdentity(
  input: CoordinateShadowCandidateInput
) {
  if (
    !validString(input.decisionId) ||
    !validTimestamp(input.evaluatedAt) ||
    !validString(input.positionId) ||
    !validString(input.ruleVersion)
  ) {
    throw new Error("invalid shadow decision identity")
  }
  if (input.candidate.status === "PROPOSED") {
    const proposal = input.candidate.proposal
    if (
      proposal.positionId !== input.positionId ||
      proposal.tokenId !== input.tokenId ||
      proposal.ruleVersion !== input.ruleVersion
    ) {
      throw new Error("candidate identity mismatch")
    }
  }
}

function desiredRecord(
  input: CoordinateShadowCandidateInput,
  portfolioRevision: number | null
): ShadowDecisionAuditRecord {
  return {
    decisionId: input.decisionId,
    evaluatedAt: input.evaluatedAt,
    tokenId: input.tokenId,
    positionId: input.positionId,
    ruleVersion: input.ruleVersion,
    status: input.candidate.status,
    blockingReasons: [...input.candidate.blockingReasons],
    portfolioRevision,
  }
}

async function appendAuditRecord(
  store: PrivateShadowDecisionStore,
  ledger: ShadowDecisionAuditLedger,
  item: ShadowDecisionAuditRecord
) {
  const next: ShadowDecisionAuditLedger = {
    schemaVersion: 1,
    revision: ledger.revision + 1,
    updatedAt: item.evaluatedAt,
    records: [...ledger.records, structuredClone(item)],
  }
  const written = await store.compareAndSet(
    ledger.revision,
    JSON.stringify(next)
  )
  if (!written) {
    throw new Error("shadow decision concurrent write rejected")
  }
  return next
}

export async function coordinateShadowCandidate(
  portfolioStore: PrivateShadowPortfolioStore,
  decisionStore: PrivateShadowDecisionStore,
  input: CoordinateShadowCandidateInput
): Promise<CoordinateShadowCandidateResult> {
  validateCandidateIdentity(input)
  const audit = await loadShadowDecisionAudit(decisionStore)
  const existing = audit.records.find(
    (item) => item.decisionId === input.decisionId
  )

  if (existing) {
    const desired = desiredRecord(
      input,
      existing.portfolioRevision
    )
    if (
      JSON.stringify(comparableRecord(existing)) !==
      JSON.stringify(comparableRecord(desired))
    ) {
      throw new Error("shadow decisionId already has another result")
    }
    const state = await loadShadowSimulationState(portfolioStore)
    if (
      existing.status === "PROPOSED" &&
      !state.portfolio.positions.some(
        (item) => item.positionId === existing.positionId
      )
    ) {
      throw new Error("audited proposal is missing from portfolio")
    }
    return { changed: false, audit, state }
  }

  let portfolioRevision: number | null = null
  if (input.candidate.status === "PROPOSED") {
    const persisted = await persistShadowPosition(
      portfolioStore,
      input.candidate.proposal,
      { updatedAt: input.evaluatedAt }
    )
    portfolioRevision = persisted.ledger.revision
  }

  const item = desiredRecord(input, portfolioRevision)
  assertAuditRecord(item)
  const nextAudit = await appendAuditRecord(
    decisionStore,
    audit,
    item
  )
  const state = await loadShadowSimulationState(portfolioStore)

  return {
    changed: true,
    audit: nextAudit,
    state,
  }
}

export async function persistShadowSimulationTransition(
  portfolioStore: PrivateShadowPortfolioStore,
  position: ShadowPosition,
  options: {
    updatedAt: string
    expectedRevision?: number
  }
): Promise<ShadowSimulationState> {
  await persistShadowPosition(
    portfolioStore,
    position,
    options
  )
  return loadShadowSimulationState(portfolioStore)
}
