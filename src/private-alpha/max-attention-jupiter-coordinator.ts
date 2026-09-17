import {
  loadMaxAttentionInboxLedger,
  type MaxAttentionInboxStore,
} from "./max-attention-inbox-repository"
import {
  loadMaxAttentionOnchainLedger,
  type MaxAttentionOnchainStore,
} from "./max-attention-onchain-repository"
import {
  validateMaxAttentionJupiterRoute,
  type MaxAttentionJupiterValidation,
} from "./max-attention-jupiter-validator"
import {
  loadMaxAttentionJupiterLedger,
  persistMaxAttentionJupiterValidations,
  type MaxAttentionJupiterEntry,
  type MaxAttentionJupiterStore,
} from "./max-attention-jupiter-repository"
import type {
  SolanaMintValidation,
} from "./solana-mint-validator"

const MAX_VALIDATIONS_PER_RUN = 5
const RETRY_DELAY_MS = 15 * 60 * 1_000

export type MaxAttentionJupiterValidator = (input: {
  network: string
  contractAddress: string
  onchainValidation: SolanaMintValidation
  diagnosticInputLamports?: string
  apiKey?: string
  now?: () => Date
}) => Promise<MaxAttentionJupiterValidation>

export type MaxAttentionJupiterRun = {
  schemaVersion: 1
  observedAt: string
  eligibleCount: number
  selectedCount: number
  validatedCount: number
  cachedCount: number
  remainingCount: number
  unverifiedOnchainCount: number
  dismissedCount: number
  persisted: boolean
  ledgerRevision: number
  results: ReadonlyArray<{
    identityKey: string
    candidateId: string
    status: MaxAttentionJupiterValidation["status"]
    validatedAt: string
  }>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export async function coordinatePendingMaxAttentionJupiter(input: {
  inboxStore: MaxAttentionInboxStore
  onchainStore: MaxAttentionOnchainStore
  jupiterStore: MaxAttentionJupiterStore
  validateRoute?: MaxAttentionJupiterValidator
  diagnosticInputLamports?: string
  apiKey?: string
  now?: () => Date
  maxCandidates?: number
}): Promise<MaxAttentionJupiterRun> {
  const observedAt = (input.now?.() ?? new Date()).toISOString()
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("MAX Jupiter coordination timestamp is invalid")
  }
  const maxCandidates = input.maxCandidates ??
    MAX_VALIDATIONS_PER_RUN
  if (
    !Number.isInteger(maxCandidates) ||
    maxCandidates < 1 ||
    maxCandidates > MAX_VALIDATIONS_PER_RUN
  ) {
    throw new Error("MAX Jupiter candidate limit must be between 1 and 5")
  }

  const [inbox, onchain, jupiter] = await Promise.all([
    loadMaxAttentionInboxLedger(input.inboxStore),
    loadMaxAttentionOnchainLedger(input.onchainStore),
    loadMaxAttentionJupiterLedger(input.jupiterStore),
  ])
  const existing = new Map(
    jupiter.entries.map(entry => [entry.identityKey, entry])
  )
  const onchainByIdentity = new Map(
    onchain.entries.map(entry => [entry.identityKey, entry])
  )
  const active = inbox.candidates.filter(
    candidate => candidate.state !== "DISMISSED"
  )
  const dismissedCount = inbox.candidates.length - active.length
  let unverifiedOnchainCount = 0
  let cachedCount = 0

  const eligible = active.flatMap(candidate => {
    const candidateId = candidate.evidence.at(-1)?.candidateId
    if (!candidateId) {
      throw new Error("MAX attention candidate lacks evidence")
    }
    const evidence = onchainByIdentity.get(candidate.identityKey)
    if (
      !evidence ||
      evidence.candidateId !== candidateId ||
      evidence.validation.status !== "VERIFIED_ONCHAIN"
    ) {
      unverifiedOnchainCount += 1
      return []
    }
    return [{ candidate, candidateId, evidence }]
  })

  const due = eligible.filter(({ candidate, candidateId }) => {
    const prior = existing.get(candidate.identityKey)
    if (!prior || prior.candidateId !== candidateId) return true
    const age = Date.parse(observedAt) - Date.parse(prior.validatedAt)
    if (
      prior.validation.status === "UNAVAILABLE" &&
      age >= RETRY_DELAY_MS
    ) {
      return true
    }
    cachedCount += 1
    return false
  })
  const ordered = [...due].sort((left, right) =>
    (left.candidate.state === "PENDING_REVIEW" ? 0 : 1) -
      (right.candidate.state === "PENDING_REVIEW" ? 0 : 1) ||
    Date.parse(right.candidate.lastAttentionAt) -
      Date.parse(left.candidate.lastAttentionAt) ||
    left.candidate.identityKey.localeCompare(right.candidate.identityKey)
  )
  const selected = ordered.slice(0, maxCandidates)
  const validate = input.validateRoute ??
    validateMaxAttentionJupiterRoute
  const entries: MaxAttentionJupiterEntry[] = []

  for (const item of selected) {
    const validation = await validate({
      network: item.candidate.network,
      contractAddress: item.candidate.contractAddress,
      onchainValidation: item.evidence.validation,
      diagnosticInputLamports: input.diagnosticInputLamports,
      apiKey: input.apiKey,
      now: () => new Date(observedAt),
    })
    if (
      validation.observedAt !== observedAt ||
      validation.mintAddress !== item.candidate.contractAddress
    ) {
      throw new Error("MAX Jupiter validator returned mismatched evidence")
    }
    entries.push({
      identityKey: item.candidate.identityKey,
      candidateId: item.candidateId,
      validatedAt: observedAt,
      validation,
    })
  }

  const persisted = await persistMaxAttentionJupiterValidations({
    store: input.jupiterStore,
    entries,
  })
  return {
    schemaVersion: 1,
    observedAt,
    eligibleCount: eligible.length,
    selectedCount: selected.length,
    validatedCount: entries.length,
    cachedCount,
    remainingCount: Math.max(0, ordered.length - selected.length),
    unverifiedOnchainCount,
    dismissedCount,
    persisted: persisted.changed,
    ledgerRevision: persisted.ledger.revision,
    results: entries.map(entry => ({
      identityKey: entry.identityKey,
      candidateId: entry.candidateId,
      status: entry.validation.status,
      validatedAt: entry.validatedAt,
    })),
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}
