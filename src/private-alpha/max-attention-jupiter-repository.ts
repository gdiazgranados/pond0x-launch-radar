import type {
  MaxAttentionJupiterValidation,
} from "./max-attention-jupiter-validator"

const MAX_VALIDATIONS = 100
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

export type MaxAttentionJupiterEntry = {
  identityKey: string
  candidateId: string
  validatedAt: string
  validation: MaxAttentionJupiterValidation
}

export type MaxAttentionJupiterLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  entries: ReadonlyArray<MaxAttentionJupiterEntry>
}

export type MaxAttentionJupiterStore = {
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

function assertEntry(value: unknown): asserts value is MaxAttentionJupiterEntry {
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
    !["ROUTE_AVAILABLE", "UNAVAILABLE", "BLOCKED"].includes(
      String(value.validation.status)
    ) ||
    value.validation.watchOnly !== true ||
    value.validation.approvalGranted !== false ||
    value.validation.transactionRequested !== false ||
    value.validation.source !== "JUPITER_READ_ONLY_QUOTE"
  ) {
    throw new Error("invalid MAX attention Jupiter entry")
  }
  const hasQuote = value.validation.quote !== null
  if (
    (value.validation.status === "ROUTE_AVAILABLE") !== hasQuote
  ) {
    throw new Error("invalid MAX attention Jupiter quote evidence")
  }
}

function assertLedger(
  value: unknown
): asserts value is MaxAttentionJupiterLedger {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null && !timestamp(value.updatedAt)) ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_VALIDATIONS
  ) {
    throw new Error("invalid MAX attention Jupiter ledger")
  }

  const identities = new Set<string>()
  const candidateIds = new Set<string>()
  for (const entry of value.entries) {
    assertEntry(entry)
    if (
      identities.has(entry.identityKey) ||
      candidateIds.has(entry.candidateId)
    ) {
      throw new Error("duplicate MAX attention Jupiter evidence")
    }
    identities.add(entry.identityKey)
    candidateIds.add(entry.candidateId)
  }
}

export function emptyMaxAttentionJupiterLedger(): MaxAttentionJupiterLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    entries: [],
  }
}

export function parseMaxAttentionJupiterLedger(serialized: string) {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid MAX attention Jupiter JSON")
  }
  assertLedger(value)
  return structuredClone(value)
}

export async function loadMaxAttentionJupiterLedger(
  store: MaxAttentionJupiterStore
) {
  const serialized = await store.read()
  return serialized === null
    ? emptyMaxAttentionJupiterLedger()
    : parseMaxAttentionJupiterLedger(serialized)
}

export async function persistMaxAttentionJupiterValidations(input: {
  store: MaxAttentionJupiterStore
  entries: ReadonlyArray<MaxAttentionJupiterEntry>
}) {
  const ledger = await loadMaxAttentionJupiterLedger(input.store)
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
      throw new Error("duplicate MAX attention Jupiter input")
    }
    incomingIdentities.add(entry.identityKey)
    incomingCandidates.add(entry.candidateId)

    const prior = ledger.entries.find(
      current => current.candidateId === entry.candidateId
    )
    if (prior) {
      if (JSON.stringify(prior) === JSON.stringify(entry)) continue
      if (
        prior.identityKey !== entry.identityKey ||
        Date.parse(entry.validatedAt) <= Date.parse(prior.validatedAt)
      ) {
        throw new Error(
          "MAX attention candidate id conflicts with Jupiter evidence"
        )
      }
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
    throw new Error("MAX attention Jupiter update timestamp is absent")
  }
  const cutoff = Date.parse(newest) - RETENTION_MS
  const retained = [...entries.values()]
    .filter(entry => Date.parse(entry.validatedAt) >= cutoff)
    .sort((left, right) =>
      Date.parse(right.validatedAt) - Date.parse(left.validatedAt) ||
      left.identityKey.localeCompare(right.identityKey)
    )
    .slice(0, MAX_VALIDATIONS)
  const next: MaxAttentionJupiterLedger = {
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
    throw new Error("MAX attention Jupiter concurrent write rejected")
  }
  return { changed: true, ledger: next }
}
