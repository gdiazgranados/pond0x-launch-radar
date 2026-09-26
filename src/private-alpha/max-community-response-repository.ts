import type {
  MaxTrendingOpportunityClassification,
} from "./max-trending-opportunity-classifier"
import type { MaxTrendingAsset } from "./max-trending-client"

const MAX_EPISODES = 100
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
export const MAX_COMMUNITY_CHECKPOINT_SECONDS = [0, 30, 60, 120] as const

export type MaxCommunityCheckpointSeconds =
  (typeof MAX_COMMUNITY_CHECKPOINT_SECONDS)[number]

export type MaxCommunityResponseCheckpoint = {
  targetSeconds: MaxCommunityCheckpointSeconds
  capturedAt: string
  lagMs: number
  present: boolean
  position: number | null
  price?: number | null
  change24h?: number | null
  liquidity?: number | null
  marketCap?: number | null
  volume24h?: number | null
}

export type MaxCommunityResponseEpisode = {
  candidateId: string
  identityKey: string
  network: string
  contractAddress: string
  symbol: string | null
  name: string | null
  trigger: "NEW" | "REAPPEARED"
  triggeredAt: string
  initialPosition: number
  currentPresent: boolean
  currentPosition: number | null
  currentUpdatedAt: string
  checkpoints: ReadonlyArray<MaxCommunityResponseCheckpoint>
  completedAt: string | null
  successProbability: null
  investmentRecommendation: null
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export type MaxCommunityResponseLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  episodes: ReadonlyArray<MaxCommunityResponseEpisode>
}

export type MaxCommunityResponseStore = {
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

function assertCheckpoint(
  value: unknown
): asserts value is MaxCommunityResponseCheckpoint {
  if (
    !record(value) ||
    !MAX_COMMUNITY_CHECKPOINT_SECONDS.includes(
      value.targetSeconds as MaxCommunityCheckpointSeconds
    ) ||
    !timestamp(value.capturedAt) ||
    !Number.isInteger(value.lagMs) ||
    Number(value.lagMs) < 0 ||
    typeof value.present !== "boolean" ||
    (value.position !== null &&
      (!Number.isInteger(value.position) || Number(value.position) < 1)) ||
    (value.present ? value.position === null : value.position !== null) ||
    ("price" in value &&
      value.price !== null &&
      typeof value.price !== "number") ||
    ("change24h" in value &&
      value.change24h !== null &&
      typeof value.change24h !== "number") ||
    ("liquidity" in value &&
      value.liquidity !== null &&
      typeof value.liquidity !== "number") ||
    ("marketCap" in value &&
      value.marketCap !== null &&
      typeof value.marketCap !== "number") ||
    ("volume24h" in value &&
      value.volume24h !== null &&
      typeof value.volume24h !== "number")
  ) {
    throw new Error("invalid MAX community response checkpoint")
  }
}

function assertEpisode(
  value: unknown
): asserts value is MaxCommunityResponseEpisode {
  if (
    !record(value) ||
    typeof value.candidateId !== "string" ||
    !value.candidateId ||
    typeof value.identityKey !== "string" ||
    !value.identityKey ||
    typeof value.network !== "string" ||
    !value.network ||
    typeof value.contractAddress !== "string" ||
    !value.contractAddress ||
    (value.symbol !== null && typeof value.symbol !== "string") ||
    (value.name !== null && typeof value.name !== "string") ||
    (value.trigger !== "NEW" && value.trigger !== "REAPPEARED") ||
    !timestamp(value.triggeredAt) ||
    !Number.isInteger(value.initialPosition) ||
    Number(value.initialPosition) < 1 ||
    typeof value.currentPresent !== "boolean" ||
    (value.currentPosition !== null &&
      (!Number.isInteger(value.currentPosition) ||
        Number(value.currentPosition) < 1)) ||
    (value.currentPresent
      ? value.currentPosition === null
      : value.currentPosition !== null) ||
    !timestamp(value.currentUpdatedAt) ||
    (value.completedAt !== null && !timestamp(value.completedAt)) ||
    value.successProbability !== null ||
    value.investmentRecommendation !== null ||
    value.watchOnly !== true ||
    value.approvalGranted !== false ||
    value.transactionRequested !== false ||
    !Array.isArray(value.checkpoints) ||
    value.checkpoints.length < 1 ||
    value.checkpoints.length > MAX_COMMUNITY_CHECKPOINT_SECONDS.length
  ) {
    throw new Error("invalid MAX community response episode")
  }

  let previousTarget = -1
  for (const checkpoint of value.checkpoints) {
    assertCheckpoint(checkpoint)
    if (checkpoint.targetSeconds <= previousTarget) {
      throw new Error("invalid MAX community checkpoint order")
    }
    previousTarget = checkpoint.targetSeconds
  }
  const complete =
    value.checkpoints.length === MAX_COMMUNITY_CHECKPOINT_SECONDS.length
  if (complete !== (value.completedAt !== null)) {
    throw new Error("invalid MAX community completion state")
  }
}

function assertLedger(
  value: unknown
): asserts value is MaxCommunityResponseLedger {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null && !timestamp(value.updatedAt)) ||
    !Array.isArray(value.episodes) ||
    value.episodes.length > MAX_EPISODES
  ) {
    throw new Error("invalid MAX community response ledger")
  }

  const ids = new Set<string>()
  for (const episode of value.episodes) {
    assertEpisode(episode)
    if (ids.has(episode.candidateId)) {
      throw new Error("duplicate MAX community response candidate")
    }
    ids.add(episode.candidateId)
  }
}

export function emptyMaxCommunityResponseLedger(): MaxCommunityResponseLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    episodes: [],
  }
}

export function parseMaxCommunityResponseLedger(serialized: string) {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid MAX community response JSON")
  }
  assertLedger(value)
  return structuredClone(value)
}

export async function loadMaxCommunityResponseLedger(
  store: MaxCommunityResponseStore
) {
  const serialized = await store.read()
  return serialized === null
    ? emptyMaxCommunityResponseLedger()
    : parseMaxCommunityResponseLedger(serialized)
}

function checkpoint(
  episode: MaxCommunityResponseEpisode,
  targetSeconds: MaxCommunityCheckpointSeconds,
  capturedAt: string,
  asset?: MaxTrendingAsset
): MaxCommunityResponseCheckpoint {
  const targetAt = Date.parse(episode.triggeredAt) + targetSeconds * 1_000
  return {
    targetSeconds,
    capturedAt,
    lagMs: Math.max(0, Date.parse(capturedAt) - targetAt),
    present: episode.currentPresent,
    position: episode.currentPosition,
    price: asset?.price ?? null,
    change24h: asset?.change24h ?? null,
    liquidity: asset?.liquidity ?? null,
    marketCap: asset?.marketCap ?? null,
    volume24h: asset?.volume24h ?? null,
  }
}

function createEpisode(
  candidate: MaxTrendingOpportunityClassification["candidates"][number],
  observedAt: string,
  asset?: MaxTrendingAsset
): MaxCommunityResponseEpisode {
  const base: MaxCommunityResponseEpisode = {
    candidateId: candidate.candidateId,
    identityKey: candidate.identityKey,
    network: candidate.network,
    contractAddress: candidate.contractAddress,
    symbol: candidate.symbol,
    name: candidate.name,
    trigger: candidate.trigger,
    triggeredAt: observedAt,
    initialPosition: candidate.position,
    currentPresent: true,
    currentPosition: candidate.position,
    currentUpdatedAt: observedAt,
    checkpoints: [],
    completedAt: null,
    successProbability: null,
    investmentRecommendation: null,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
  return {
    ...base,
    checkpoints: [checkpoint(base, 0, observedAt, asset)],
  }
}

function applyCurrentState(
  episode: MaxCommunityResponseEpisode,
  opportunity: MaxTrendingOpportunityClassification
) {
  const candidate = opportunity.candidates.find(
    item => item.identityKey === episode.identityKey
  )
  const moved = opportunity.context.moved.find(
    item => item.identityKey === episode.identityKey
  )
  const removed = opportunity.context.removed.find(
    item => item.identityKey === episode.identityKey
  )

  if (removed) {
    return {
      ...episode,
      currentPresent: false,
      currentPosition: null,
      currentUpdatedAt: opportunity.observedAt,
    } satisfies MaxCommunityResponseEpisode
  }
  const position = candidate?.position ?? moved?.currentPosition
  if (position !== undefined && position !== null) {
    return {
      ...episode,
      currentPresent: true,
      currentPosition: position,
      currentUpdatedAt: opportunity.observedAt,
    } satisfies MaxCommunityResponseEpisode
  }
  return episode
}

function addDueCheckpoints(
  episode: MaxCommunityResponseEpisode,
  observedAt: string,
  asset?: MaxTrendingAsset
) {
  const elapsedMs = Date.parse(observedAt) - Date.parse(episode.triggeredAt)
  const existing = new Set(
    episode.checkpoints.map(item => item.targetSeconds)
  )
  const due = MAX_COMMUNITY_CHECKPOINT_SECONDS.filter(
    seconds => !existing.has(seconds) && elapsedMs >= seconds * 1_000
  )
  if (due.length === 0) return episode

  const checkpoints = [
    ...episode.checkpoints,
    ...due.map(seconds => checkpoint(episode, seconds, observedAt, asset)),
  ]
  return {
    ...episode,
    checkpoints,
    completedAt:
      checkpoints.length === MAX_COMMUNITY_CHECKPOINT_SECONDS.length
        ? observedAt
        : null,
  } satisfies MaxCommunityResponseEpisode
}

function sameEpisode(
  left: MaxCommunityResponseEpisode,
  right: MaxCommunityResponseEpisode
) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function retainEpisodes(
  episodes: ReadonlyArray<MaxCommunityResponseEpisode>,
  observedAt: string
) {
  const cutoff = Date.parse(observedAt) - RETENTION_MS
  return [...episodes]
    .filter(episode => Date.parse(episode.triggeredAt) >= cutoff)
    .sort((left, right) =>
      Date.parse(right.triggeredAt) - Date.parse(left.triggeredAt) ||
      left.candidateId.localeCompare(right.candidateId)
    )
    .slice(0, MAX_EPISODES)
}

export async function coordinateMaxCommunityResponse(input: {
  store: MaxCommunityResponseStore
  opportunity: MaxTrendingOpportunityClassification
  currentTrending: ReadonlyArray<MaxTrendingAsset>
}) {
  const ledger = await loadMaxCommunityResponseLedger(input.store)
  const observedAt = input.opportunity.observedAt
  const currentAssets = new Map(
    input.currentTrending.map(asset => [asset.identityKey, asset])
  )
  if (
    ledger.updatedAt !== null &&
    Date.parse(observedAt) < Date.parse(ledger.updatedAt)
  ) {
    throw new Error("stale MAX community response observation")
  }

  const episodes = new Map(
    ledger.episodes.map(episode => [
      episode.candidateId,
      structuredClone(episode),
    ])
  )

  for (const candidate of input.opportunity.candidates) {
    const existing = episodes.get(candidate.candidateId)
    if (existing) {
      if (
        existing.identityKey !== candidate.identityKey ||
        existing.contractAddress !== candidate.contractAddress
      ) {
        throw new Error("MAX community response candidate conflict")
      }
      continue
    }
    episodes.set(
      candidate.candidateId,
      createEpisode(
        candidate,
        observedAt,
        currentAssets.get(candidate.identityKey)
      )
    )
  }

  for (const [candidateId, episode] of episodes) {
    const current = applyCurrentState(episode, input.opportunity)
    episodes.set(
      candidateId,
      addDueCheckpoints(
        current,
        observedAt,
        current.currentPresent
          ? currentAssets.get(current.identityKey)
          : undefined
      )
    )
  }

  const retained = retainEpisodes([...episodes.values()], observedAt)
  const changed =
    retained.length !== ledger.episodes.length ||
    retained.some((episode, index) =>
      !sameEpisode(episode, ledger.episodes[index]!)
    )
  if (!changed) return { changed: false, ledger }

  const next: MaxCommunityResponseLedger = {
    schemaVersion: 1,
    revision: ledger.revision + 1,
    updatedAt: observedAt,
    episodes: retained,
  }
  assertLedger(next)
  const written = await input.store.compareAndSet(
    ledger.revision,
    JSON.stringify(next)
  )
  if (!written) {
    throw new Error("MAX community response concurrent write rejected")
  }
  return { changed: true, ledger: next }
}

