import type {
  MaxRepopulationSignal,
} from "./max-repopulation-signal"

export type MaxRepopulationLedgerCandidate = {
  candidateId: string
  identityKey: string
  network: string
  contractAddress: string
  symbol: string | null
  name: string | null
  rank: 2 | 3
  price: number | null
  change24h: number
  liquidity: number | null
  marketCap: number | null
  volume24h: number | null
}

export type MaxRepopulationLedgerEpisode = {
  eventId: string
  signalVersion: "MAX_REPOP_V1"
  observedAt: string
  candidates: ReadonlyArray<MaxRepopulationLedgerCandidate>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export type MaxRepopulationLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  episodes: ReadonlyArray<MaxRepopulationLedgerEpisode>
}

export function emptyMaxRepopulationLedger(): MaxRepopulationLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    episodes: [],
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  )
}

function nullableFiniteNumber(value: unknown) {
  return value === null ||
    (typeof value === "number" && Number.isFinite(value))
}

function nullableString(value: unknown) {
  return value === null || typeof value === "string"
}

function assertCandidate(
  value: unknown
): asserts value is MaxRepopulationLedgerCandidate {
  if (
    !record(value) ||
    typeof value.candidateId !== "string" ||
    typeof value.identityKey !== "string" ||
    typeof value.network !== "string" ||
    typeof value.contractAddress !== "string" ||
    !nullableString(value.symbol) ||
    !nullableString(value.name) ||
    (value.rank !== 2 && value.rank !== 3) ||
    !nullableFiniteNumber(value.price) ||
    typeof value.change24h !== "number" ||
    !Number.isFinite(value.change24h) ||
    !nullableFiniteNumber(value.liquidity) ||
    !nullableFiniteNumber(value.marketCap) ||
    !nullableFiniteNumber(value.volume24h)
  ) {
    throw new Error("invalid MAX repopulation ledger")
  }
}

function assertEpisode(
  value: unknown
): asserts value is MaxRepopulationLedgerEpisode {
  if (
    !record(value) ||
    typeof value.eventId !== "string" ||
    value.signalVersion !== "MAX_REPOP_V1" ||
    !timestamp(value.observedAt) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length === 0 ||
    value.watchOnly !== true ||
    value.approvalGranted !== false ||
    value.transactionRequested !== false
  ) {
    throw new Error("invalid MAX repopulation ledger")
  }

  for (const candidate of value.candidates) {
    assertCandidate(candidate)
  }
}

function assertLedger(
  value: unknown
): asserts value is MaxRepopulationLedger {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null && !timestamp(value.updatedAt)) ||
    !Array.isArray(value.episodes)
  ) {
    throw new Error("invalid MAX repopulation ledger")
  }

  for (const episode of value.episodes) {
    assertEpisode(episode)
  }
}

export function parseMaxRepopulationLedger(
  serialized: string
): MaxRepopulationLedger {
  let value: unknown

  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid MAX repopulation ledger")
  }

  assertLedger(value)
  return value
}

export function recordMaxRepopulationT0(input: {
  ledger: MaxRepopulationLedger
  signal: MaxRepopulationSignal
}): MaxRepopulationLedger {
  if (
    !input.signal.triggered ||
    input.signal.candidates.length === 0
  ) {
    return input.ledger
  }

  const eventId =
    `${input.signal.signalVersion}:${input.signal.observedAt}`

  const alreadyRecorded = input.ledger.episodes.some(
    episode => episode.eventId === eventId
  )

  if (alreadyRecorded) {
    return input.ledger
  }

  const episode: MaxRepopulationLedgerEpisode = {
    eventId,
    signalVersion: input.signal.signalVersion,
    observedAt: input.signal.observedAt,
    candidates: input.signal.candidates.map(candidate => ({
      candidateId: `${eventId}:${candidate.identityKey}`,
      identityKey: candidate.identityKey,
      network: candidate.network,
      contractAddress: candidate.contractAddress,
      symbol: candidate.symbol,
      name: candidate.name,
      rank: candidate.rank,
      price: candidate.price,
      change24h: candidate.change24h,
      liquidity: candidate.liquidity,
      marketCap: candidate.marketCap,
      volume24h: candidate.volume24h,
    })),
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }

  return {
    schemaVersion: 1,
    revision: input.ledger.revision + 1,
    updatedAt: input.signal.observedAt,
    episodes: [
      ...input.ledger.episodes,
      episode,
    ],
  }
}

export type MaxRepopulationStore = {
  read(): Promise<string | null>
  compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ): Promise<boolean>
}

async function loadMaxRepopulationLedger(
  store: MaxRepopulationStore
): Promise<MaxRepopulationLedger> {
  const serialized = await store.read()

  if (serialized === null) {
    return emptyMaxRepopulationLedger()
  }

  return parseMaxRepopulationLedger(serialized)
}

export async function coordinateMaxRepopulationT0(input: {
  store: MaxRepopulationStore
  signal: MaxRepopulationSignal
}) {
  const ledger = await loadMaxRepopulationLedger(input.store)

  const next = recordMaxRepopulationT0({
    ledger,
    signal: input.signal,
  })

  if (next === ledger) {
    return {
      changed: false,
      ledger,
    }
  }

  const written = await input.store.compareAndSet(
    ledger.revision,
    JSON.stringify(next)
  )

  if (!written) {
    throw new Error("MAX repopulation concurrent write rejected")
  }

  return {
    changed: true,
    ledger: next,
  }
}
