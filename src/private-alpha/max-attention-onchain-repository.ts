import type {
  SolanaMintValidation,
} from "./solana-mint-validator"

const MAX_VALIDATIONS = 100
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

export type MaxAttentionOnchainEntry = {
  identityKey: string
  candidateId: string
  validatedAt: string
  validation: SolanaMintValidation
}

export type MaxAttentionOnchainLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  entries: ReadonlyArray<MaxAttentionOnchainEntry>
}

export type MaxAttentionOnchainStore = {
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

function assertEntry(value: unknown): asserts value is MaxAttentionOnchainEntry {
  if (
    !record(value) ||
    typeof value.identityKey !== "string" ||
    !value.identityKey ||
    typeof value.candidateId !== "string" ||
    !value.candidateId ||
    !timestamp(value.validatedAt) ||
    !record(value.validation) ||
    value.validation.schemaVersion !== 1 ||
    value.validation.network !== "solana" ||
    typeof value.validation.mintAddress !== "string" ||
    value.identityKey !== `solana:${value.validation.mintAddress}` ||
    value.validation.observedAt !== value.validatedAt ||
    ![
      "VERIFIED_ONCHAIN",
      "INCOMPLETE",
      "UNAVAILABLE",
      "BLOCKED",
    ].includes(String(value.validation.status)) ||
    value.validation.watchOnly !== true ||
    value.validation.approvalGranted !== false ||
    value.validation.transactionRequested !== false ||
    value.validation.source !== "SOLANA_RPC_MINT_VALIDATION"
  ) {
    throw new Error("invalid MAX attention on-chain entry")
  }
}

function assertLedger(
  value: unknown
): asserts value is MaxAttentionOnchainLedger {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null && !timestamp(value.updatedAt)) ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_VALIDATIONS
  ) {
    throw new Error("invalid MAX attention on-chain ledger")
  }

  const identities = new Set<string>()
  const candidateIds = new Set<string>()
  for (const entry of value.entries) {
    assertEntry(entry)
    if (
      identities.has(entry.identityKey) ||
      candidateIds.has(entry.candidateId)
    ) {
      throw new Error("duplicate MAX attention on-chain evidence")
    }
    identities.add(entry.identityKey)
    candidateIds.add(entry.candidateId)
  }
}

export function emptyMaxAttentionOnchainLedger(): MaxAttentionOnchainLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    entries: [],
  }
}

export function parseMaxAttentionOnchainLedger(serialized: string) {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid MAX attention on-chain JSON")
  }
  assertLedger(value)
  return structuredClone(value)
}

export async function loadMaxAttentionOnchainLedger(
  store: MaxAttentionOnchainStore
) {
  const serialized = await store.read()
  return serialized === null
    ? emptyMaxAttentionOnchainLedger()
    : parseMaxAttentionOnchainLedger(serialized)
}

function sameValidation(
  left: MaxAttentionOnchainEntry,
  right: MaxAttentionOnchainEntry
) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export async function persistMaxAttentionOnchainValidations(input: {
  store: MaxAttentionOnchainStore
  entries: ReadonlyArray<MaxAttentionOnchainEntry>
}) {
  const ledger = await loadMaxAttentionOnchainLedger(input.store)
  if (input.entries.length === 0) {
    return { changed: false, ledger }
  }

  const incomingIdentities = new Set<string>()
  const incomingCandidates = new Set<string>()
  const entries = new Map(
    ledger.entries.map(entry => [entry.identityKey, entry])
  )
  let changed = false
  let newest = ledger.updatedAt

  for (const raw of input.entries) {
    const entry = structuredClone(raw)
    assertEntry(entry)
    if (
      incomingIdentities.has(entry.identityKey) ||
      incomingCandidates.has(entry.candidateId)
    ) {
      throw new Error("duplicate MAX attention on-chain input")
    }
    incomingIdentities.add(entry.identityKey)
    incomingCandidates.add(entry.candidateId)

    const existingByCandidate = ledger.entries.find(
      current => current.candidateId === entry.candidateId
    )
    if (existingByCandidate) {
      if (!sameValidation(existingByCandidate, entry)) {
        throw new Error(
          "MAX attention candidate id conflicts with on-chain evidence"
        )
      }
      continue
    }

    entries.set(entry.identityKey, entry)
    changed = true
    if (
      newest === null ||
      Date.parse(entry.validatedAt) > Date.parse(newest)
    ) {
      newest = entry.validatedAt
    }
  }

  if (!changed) return { changed: false, ledger }
  if (newest === null) {
    throw new Error("MAX attention on-chain update timestamp is absent")
  }
  const cutoff = Date.parse(newest) - RETENTION_MS
  const retained = [...entries.values()]
    .filter(entry => Date.parse(entry.validatedAt) >= cutoff)
    .sort((left, right) =>
      Date.parse(right.validatedAt) - Date.parse(left.validatedAt) ||
      left.identityKey.localeCompare(right.identityKey)
    )
    .slice(0, MAX_VALIDATIONS)
  const next: MaxAttentionOnchainLedger = {
    schemaVersion: 1,
    revision: ledger.revision + 1,
    updatedAt: newest,
    entries: retained,
  }
  assertLedger(next)

  const written = await input.store.compareAndSet(
    ledger.revision,
    JSON.stringify(next)
  )
  if (!written) {
    throw new Error("MAX attention on-chain concurrent write rejected")
  }
  return { changed: true, ledger: next }
}
