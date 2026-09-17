import type {
  MaxTrendingAttentionCandidate,
  MaxTrendingOpportunityClassification,
} from "./max-trending-opportunity-classifier"

const MAX_CANDIDATES = 100
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
const MAX_EVIDENCE_PER_CANDIDATE = 20

export type MaxAttentionReviewState =
  | "PENDING_REVIEW"
  | "MONITORING"
  | "DISMISSED"

export type MaxAttentionEvidence = {
  candidateId: string
  observedAt: string
  trigger: "NEW" | "REAPPEARED"
  position: number
}

export type MaxAttentionInboxCandidate = {
  identityKey: string
  network: string
  contractAddress: string
  symbol: string | null
  name: string | null
  firstSeenAt: string
  lastSeenAt: string
  firstAttentionAt: string
  lastAttentionAt: string
  appearanceCount: number
  newCount: number
  reappearedCount: number
  firstPosition: number
  latestPosition: number
  bestPosition: number
  state: MaxAttentionReviewState
  stateUpdatedAt: string
  dismissalReason: string | null
  evidence: ReadonlyArray<MaxAttentionEvidence>
  requiresHumanDecision: true
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export type MaxAttentionInboxLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  candidates: ReadonlyArray<MaxAttentionInboxCandidate>
}

export type MaxAttentionInboxStore = {
  read(): Promise<string | null>
  compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ): Promise<boolean>
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function assertEvidence(value: unknown): asserts value is MaxAttentionEvidence {
  if (
    !record(value) ||
    typeof value.candidateId !== "string" ||
    !value.candidateId ||
    !timestamp(value.observedAt) ||
    (value.trigger !== "NEW" && value.trigger !== "REAPPEARED") ||
    !Number.isInteger(value.position) ||
    Number(value.position) < 1
  ) {
    throw new Error("invalid MAX attention evidence")
  }
}

function assertCandidate(
  value: unknown
): asserts value is MaxAttentionInboxCandidate {
  if (
    !record(value) ||
    typeof value.identityKey !== "string" ||
    !value.identityKey ||
    typeof value.network !== "string" ||
    !value.network ||
    typeof value.contractAddress !== "string" ||
    !value.contractAddress ||
    (value.symbol !== null && typeof value.symbol !== "string") ||
    (value.name !== null && typeof value.name !== "string") ||
    !timestamp(value.firstSeenAt) ||
    !timestamp(value.lastSeenAt) ||
    !timestamp(value.firstAttentionAt) ||
    !timestamp(value.lastAttentionAt) ||
    Date.parse(value.firstSeenAt) > Date.parse(value.lastSeenAt) ||
    Date.parse(value.firstAttentionAt) > Date.parse(value.lastAttentionAt) ||
    !Number.isInteger(value.appearanceCount) ||
    Number(value.appearanceCount) < 1 ||
    !Number.isInteger(value.newCount) ||
    Number(value.newCount) < 0 ||
    !Number.isInteger(value.reappearedCount) ||
    Number(value.reappearedCount) < 0 ||
    Number(value.appearanceCount) !==
      Number(value.newCount) + Number(value.reappearedCount) ||
    !Number.isInteger(value.firstPosition) ||
    Number(value.firstPosition) < 1 ||
    !Number.isInteger(value.latestPosition) ||
    Number(value.latestPosition) < 1 ||
    !Number.isInteger(value.bestPosition) ||
    Number(value.bestPosition) < 1 ||
    !["PENDING_REVIEW", "MONITORING", "DISMISSED"].includes(
      String(value.state)
    ) ||
    !timestamp(value.stateUpdatedAt) ||
    (value.dismissalReason !== null &&
      (typeof value.dismissalReason !== "string" ||
        !value.dismissalReason.trim())) ||
    value.requiresHumanDecision !== true ||
    value.watchOnly !== true ||
    value.approvalGranted !== false ||
    value.transactionRequested !== false ||
    !Array.isArray(value.evidence) ||
    value.evidence.length < 1 ||
    value.evidence.length > MAX_EVIDENCE_PER_CANDIDATE
  ) {
    throw new Error("invalid MAX attention inbox candidate")
  }
  if (
    value.state === "DISMISSED"
      ? value.dismissalReason === null
      : value.dismissalReason !== null
  ) {
    throw new Error("invalid MAX attention dismissal state")
  }

  const evidenceIds = new Set<string>()
  for (const item of value.evidence) {
    assertEvidence(item)
    if (evidenceIds.has(item.candidateId)) {
      throw new Error("duplicate MAX attention evidence")
    }
    evidenceIds.add(item.candidateId)
  }
}

function assertLedger(
  value: unknown
): asserts value is MaxAttentionInboxLedger {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null && !timestamp(value.updatedAt)) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length > MAX_CANDIDATES
  ) {
    throw new Error("invalid MAX attention inbox ledger")
  }

  const identities = new Set<string>()
  for (const candidate of value.candidates) {
    assertCandidate(candidate)
    if (identities.has(candidate.identityKey)) {
      throw new Error("duplicate MAX attention inbox identity")
    }
    identities.add(candidate.identityKey)
  }
}

export function emptyMaxAttentionInboxLedger(): MaxAttentionInboxLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    candidates: [],
  }
}

export function parseMaxAttentionInboxLedger(serialized: string) {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid MAX attention inbox JSON")
  }
  assertLedger(value)
  return structuredClone(value)
}

export async function loadMaxAttentionInboxLedger(
  store: MaxAttentionInboxStore
) {
  const serialized = await store.read()
  return serialized === null
    ? emptyMaxAttentionInboxLedger()
    : parseMaxAttentionInboxLedger(serialized)
}

function evidence(candidate: MaxTrendingAttentionCandidate) {
  return {
    candidateId: candidate.candidateId,
    observedAt: candidate.lastSeenAt,
    trigger: candidate.trigger,
    position: candidate.position,
  } satisfies MaxAttentionEvidence
}

function sameEvidence(
  left: MaxAttentionEvidence,
  right: MaxAttentionEvidence
) {
  return (
    left.candidateId === right.candidateId &&
    left.observedAt === right.observedAt &&
    left.trigger === right.trigger &&
    left.position === right.position
  )
}

function createCandidate(
  candidate: MaxTrendingAttentionCandidate
): MaxAttentionInboxCandidate {
  const item = evidence(candidate)
  return {
    identityKey: candidate.identityKey,
    network: candidate.network,
    contractAddress: candidate.contractAddress,
    symbol: candidate.symbol,
    name: candidate.name,
    firstSeenAt: candidate.firstSeenAt,
    lastSeenAt: candidate.lastSeenAt,
    firstAttentionAt: candidate.lastSeenAt,
    lastAttentionAt: candidate.lastSeenAt,
    appearanceCount: 1,
    newCount: candidate.trigger === "NEW" ? 1 : 0,
    reappearedCount: candidate.trigger === "REAPPEARED" ? 1 : 0,
    firstPosition: candidate.position,
    latestPosition: candidate.position,
    bestPosition: candidate.position,
    state: "PENDING_REVIEW",
    stateUpdatedAt: candidate.lastSeenAt,
    dismissalReason: null,
    evidence: [item],
    requiresHumanDecision: true,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

function mergeCandidate(
  current: MaxAttentionInboxCandidate,
  incoming: MaxTrendingAttentionCandidate
) {
  const item = evidence(incoming)
  const duplicate = current.evidence.find(
    entry => entry.candidateId === item.candidateId
  )
  if (duplicate) {
    if (!sameEvidence(duplicate, item)) {
      throw new Error("MAX attention candidate id conflicts with evidence")
    }
    return { changed: false, candidate: current }
  }
  if (
    current.network !== incoming.network ||
    current.contractAddress !== incoming.contractAddress
  ) {
    throw new Error("MAX attention candidate identity changed")
  }

  return {
    changed: true,
    candidate: {
      ...current,
      symbol: incoming.symbol,
      name: incoming.name,
      firstSeenAt: Date.parse(incoming.firstSeenAt) <
          Date.parse(current.firstSeenAt)
        ? incoming.firstSeenAt
        : current.firstSeenAt,
      lastSeenAt: incoming.lastSeenAt,
      lastAttentionAt: incoming.lastSeenAt,
      appearanceCount: current.appearanceCount + 1,
      newCount: current.newCount + (incoming.trigger === "NEW" ? 1 : 0),
      reappearedCount:
        current.reappearedCount +
        (incoming.trigger === "REAPPEARED" ? 1 : 0),
      latestPosition: incoming.position,
      bestPosition: Math.min(current.bestPosition, incoming.position),
      evidence: [...current.evidence, item].slice(
        -MAX_EVIDENCE_PER_CANDIDATE
      ),
    } satisfies MaxAttentionInboxCandidate,
  }
}

function retainCandidates(
  candidates: ReadonlyArray<MaxAttentionInboxCandidate>,
  observedAt: string
) {
  const cutoff = Date.parse(observedAt) - RETENTION_MS
  return [...candidates]
    .filter(candidate => Date.parse(candidate.lastAttentionAt) >= cutoff)
    .sort((left, right) =>
      Date.parse(right.lastAttentionAt) -
        Date.parse(left.lastAttentionAt) ||
      left.identityKey.localeCompare(right.identityKey)
    )
    .slice(0, MAX_CANDIDATES)
}

export async function persistMaxAttentionCandidates(input: {
  store: MaxAttentionInboxStore
  opportunity: MaxTrendingOpportunityClassification
}) {
  const ledger = await loadMaxAttentionInboxLedger(input.store)
  if (input.opportunity.status !== "EARLY_ATTENTION") {
    return { changed: false, ledger }
  }

  const incomingIdentities = new Set<string>()
  const candidates = new Map(
    ledger.candidates.map(candidate => [
      candidate.identityKey,
      structuredClone(candidate),
    ])
  )
  let changed = false

  for (const incoming of input.opportunity.candidates) {
    if (incomingIdentities.has(incoming.identityKey)) {
      throw new Error("duplicate MAX attention candidate input")
    }
    incomingIdentities.add(incoming.identityKey)
    const current = candidates.get(incoming.identityKey)
    if (!current) {
      candidates.set(incoming.identityKey, createCandidate(incoming))
      changed = true
      continue
    }
    const merged = mergeCandidate(current, incoming)
    candidates.set(incoming.identityKey, merged.candidate)
    changed ||= merged.changed
  }

  if (!changed) return { changed: false, ledger }
  const next: MaxAttentionInboxLedger = {
    schemaVersion: 1,
    revision: ledger.revision + 1,
    updatedAt: input.opportunity.observedAt,
    candidates: retainCandidates(
      [...candidates.values()],
      input.opportunity.observedAt
    ),
  }
  assertLedger(next)
  const written = await input.store.compareAndSet(
    ledger.revision,
    JSON.stringify(next)
  )
  if (!written) {
    throw new Error("MAX attention inbox concurrent write rejected")
  }
  return { changed: true, ledger: next }
}


export async function updateMaxAttentionCandidateState(input: {
  store: MaxAttentionInboxStore
  identityKey: string
  state: MaxAttentionReviewState
  updatedAt: string
  dismissalReason?: string | null
}) {
  if (!input.identityKey) {
    throw new Error("MAX attention identity is required")
  }
  if (!timestamp(input.updatedAt)) {
    throw new Error("MAX attention state timestamp is invalid")
  }
  const reason = input.dismissalReason?.trim() || null
  if (
    input.state === "DISMISSED"
      ? reason === null
      : reason !== null
  ) {
    throw new Error("MAX attention dismissal reason is inconsistent")
  }

  const ledger = await loadMaxAttentionInboxLedger(input.store)
  const current = ledger.candidates.find(
    candidate => candidate.identityKey === input.identityKey
  )
  if (!current) {
    throw new Error("MAX attention candidate was not found")
  }
  if (
    (ledger.updatedAt !== null &&
      Date.parse(input.updatedAt) < Date.parse(ledger.updatedAt)) ||
    Date.parse(input.updatedAt) < Date.parse(current.stateUpdatedAt)
  ) {
    throw new Error("MAX attention state transition is stale")
  }
  if (
    current.state === input.state &&
    current.dismissalReason === reason
  ) {
    return { changed: false, ledger }
  }

  const nextCandidate: MaxAttentionInboxCandidate = {
    ...current,
    state: input.state,
    stateUpdatedAt: input.updatedAt,
    dismissalReason: reason,
  }
  const next: MaxAttentionInboxLedger = {
    schemaVersion: 1,
    revision: ledger.revision + 1,
    updatedAt: input.updatedAt,
    candidates: ledger.candidates.map(candidate =>
      candidate.identityKey === input.identityKey
        ? nextCandidate
        : candidate
    ),
  }
  assertLedger(next)
  const written = await input.store.compareAndSet(
    ledger.revision,
    JSON.stringify(next)
  )
  if (!written) {
    throw new Error("MAX attention inbox concurrent write rejected")
  }
  return { changed: true, ledger: next }
}
