import {
  loadMaxAttentionInboxLedger,
  type MaxAttentionInboxStore,
} from "./max-attention-inbox-repository"
import {
  loadMaxAttentionOnchainLedger,
  persistMaxAttentionOnchainValidations,
  type MaxAttentionOnchainEntry,
  type MaxAttentionOnchainStore,
} from "./max-attention-onchain-repository"
import {
  validateSolanaMintOnchain,
  type SolanaMintValidation,
} from "./solana-mint-validator"

const MAX_VALIDATIONS_PER_RUN = 5
const RETRY_DELAY_MS = 15 * 60 * 1_000

type ValidateMint = (input: {
  rpcUrl: string
  network: string
  contractAddress: string
  now?: () => Date
}) => Promise<SolanaMintValidation>

export type MaxAttentionOnchainRun = {
  schemaVersion: 1
  observedAt: string
  eligibleCount: number
  selectedCount: number
  validatedCount: number
  cachedCount: number
  remainingCount: number
  unsupportedNetworkCount: number
  dismissedCount: number
  persisted: boolean
  ledgerRevision: number
  results: ReadonlyArray<{
    identityKey: string
    candidateId: string
    status: SolanaMintValidation["status"]
    validatedAt: string
  }>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export async function coordinatePendingMaxAttentionOnchain(input: {
  inboxStore: MaxAttentionInboxStore
  onchainStore: MaxAttentionOnchainStore
  rpcUrl: string
  validateMint?: ValidateMint
  now?: () => Date
  maxCandidates?: number
}): Promise<MaxAttentionOnchainRun> {
  const observedDate = input.now?.() ?? new Date()
  const observedAt = observedDate.toISOString()
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("MAX on-chain coordination timestamp is invalid")
  }
  const maxCandidates = input.maxCandidates ??
    MAX_VALIDATIONS_PER_RUN
  if (
    !Number.isInteger(maxCandidates) ||
    maxCandidates < 1 ||
    maxCandidates > MAX_VALIDATIONS_PER_RUN
  ) {
    throw new Error("MAX on-chain candidate limit must be between 1 and 5")
  }

  const [inbox, currentOnchain] = await Promise.all([
    loadMaxAttentionInboxLedger(input.inboxStore),
    loadMaxAttentionOnchainLedger(input.onchainStore),
  ])
  const existing = new Map(
    currentOnchain.entries.map(entry => [entry.identityKey, entry])
  )
  const active = inbox.candidates.filter(
    candidate => candidate.state !== "DISMISSED"
  )
  const solana = active.filter(
    candidate => candidate.network === "solana"
  )
  const unsupportedNetworkCount = active.length - solana.length
  const dismissedCount =
    inbox.candidates.length - active.length
  let cachedCount = 0
  const due = solana.filter(candidate => {
    const candidateId = candidate.evidence.at(-1)?.candidateId
    if (!candidateId) {
      throw new Error("MAX attention candidate lacks evidence")
    }
    const prior = existing.get(candidate.identityKey)
    if (!prior || prior.candidateId !== candidateId) return true
    const retryable = (
      prior.validation.status === "UNAVAILABLE" ||
      prior.validation.status === "INCOMPLETE"
    )
    const age = Date.parse(observedAt) - Date.parse(prior.validatedAt)
    if (retryable && age >= RETRY_DELAY_MS) return true
    cachedCount += 1
    return false
  })
  const ordered = [...due].sort((left, right) =>
    (left.state === "PENDING_REVIEW" ? 0 : 1) -
      (right.state === "PENDING_REVIEW" ? 0 : 1) ||
    Date.parse(right.lastAttentionAt) -
      Date.parse(left.lastAttentionAt) ||
    left.identityKey.localeCompare(right.identityKey)
  )
  const selected = ordered.slice(0, maxCandidates)
  const validate = input.validateMint ?? validateSolanaMintOnchain
  const entries: MaxAttentionOnchainEntry[] = []

  for (const candidate of selected) {
    const candidateId = candidate.evidence.at(-1)?.candidateId
    if (!candidateId) {
      throw new Error("MAX attention candidate lacks evidence")
    }
    const validation = await validate({
      rpcUrl: input.rpcUrl,
      network: candidate.network,
      contractAddress: candidate.contractAddress,
      now: () => new Date(observedAt),
    })
    if (
      validation.observedAt !== observedAt ||
      validation.mintAddress !== candidate.contractAddress
    ) {
      throw new Error("MAX on-chain validator returned mismatched evidence")
    }
    entries.push({
      identityKey: candidate.identityKey,
      candidateId,
      validatedAt: observedAt,
      validation,
    })
  }

  const persisted = await persistMaxAttentionOnchainValidations({
    store: input.onchainStore,
    entries,
  })
  return {
    schemaVersion: 1,
    observedAt,
    eligibleCount: solana.length,
    selectedCount: selected.length,
    validatedCount: entries.length,
    cachedCount,
    remainingCount: Math.max(0, ordered.length - selected.length),
    unsupportedNetworkCount,
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
