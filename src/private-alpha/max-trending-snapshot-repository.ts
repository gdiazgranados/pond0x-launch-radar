import {
  detectMaxTrendingChanges,
  hashMaxTrendingSnapshot,
  type MaxTrendingDetection,
} from "./max-trending-change-detector"
import type {
  MaxTrendingSnapshot,
} from "./max-trending-client"

const MAX_SNAPSHOTS = 720

export type MaxTrendingAssetState = {
  identityKey: string
  firstSeenAt: string
  lastSeenAt: string
  observationCount: number
  lastPosition: number
  active: boolean
}

export type MaxTrendingSnapshotRecord = {
  observedAt: string
  snapshotHash: string
  snapshot: MaxTrendingSnapshot
  detection: MaxTrendingDetection
}

export type MaxTrendingObservationStats = {
  totalCount: number
  baselineCount: number
  materialCount: number
  unchangedCount: number
  emptyCount: number
  lastUnchangedAt: string | null
  lastEmptyAt: string | null
}

export type MaxTrendingLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  assetStates: ReadonlyArray<MaxTrendingAssetState>
  observationStats: MaxTrendingObservationStats
  snapshots: ReadonlyArray<MaxTrendingSnapshotRecord>
}

export type MaxTrendingStore = {
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

function emptyObservationStats(): MaxTrendingObservationStats {
  return {
    totalCount: 0,
    baselineCount: 0,
    materialCount: 0,
    unchangedCount: 0,
    emptyCount: 0,
    lastUnchangedAt: null,
    lastEmptyAt: null,
  }
}

function statsFromSnapshots(
  snapshots: ReadonlyArray<MaxTrendingSnapshotRecord>
) {
  let stats = emptyObservationStats()
  for (const item of snapshots) {
    stats = updateObservationStats(stats, item.detection)
  }
  return stats
}

function updateObservationStats(
  current: MaxTrendingObservationStats,
  detection: MaxTrendingDetection
): MaxTrendingObservationStats {
  const baseline = detection.previousObservedAt === null
  return {
    totalCount: current.totalCount + 1,
    baselineCount: current.baselineCount + (baseline ? 1 : 0),
    materialCount:
      current.materialCount +
      (!baseline && detection.materialChange ? 1 : 0),
    unchangedCount:
      current.unchangedCount +
      (!baseline && detection.status === "UNCHANGED" ? 1 : 0),
    emptyCount:
      current.emptyCount +
      (!baseline && detection.status === "EMPTY" ? 1 : 0),
    lastUnchangedAt: !baseline && detection.status === "UNCHANGED"
      ? detection.observedAt
      : current.lastUnchangedAt,
    lastEmptyAt: !baseline && detection.status === "EMPTY"
      ? detection.observedAt
      : current.lastEmptyAt,
  }
}

function compactSnapshots(
  snapshots: ReadonlyArray<MaxTrendingSnapshotRecord>,
  next: MaxTrendingSnapshotRecord
) {
  const last = snapshots.at(-1)
  const routine = (item: MaxTrendingSnapshotRecord) =>
    item.detection.previousObservedAt !== null &&
    !item.detection.materialChange

  const retained = last && routine(last) && routine(next)
    ? snapshots.slice(0, -1)
    : snapshots
  return [...retained, next].slice(-MAX_SNAPSHOTS)
}

function assertLedger(value: unknown): asserts value is MaxTrendingLedger {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null && !timestamp(value.updatedAt)) ||
    !Array.isArray(value.assetStates) ||
    !record(value.observationStats) ||
    !Array.isArray(value.snapshots) ||
    value.snapshots.length > MAX_SNAPSHOTS
  ) {
    throw new Error("invalid MAX trending ledger")
  }

  const stats = value.observationStats
  const counts = [
    stats.totalCount,
    stats.baselineCount,
    stats.materialCount,
    stats.unchangedCount,
    stats.emptyCount,
  ]
  if (
    counts.some(count => !Number.isInteger(count) || Number(count) < 0) ||
    Number(stats.totalCount) !==
      Number(stats.baselineCount) +
      Number(stats.materialCount) +
      Number(stats.unchangedCount) +
      Number(stats.emptyCount) ||
    (stats.lastUnchangedAt !== null &&
      !timestamp(stats.lastUnchangedAt)) ||
    (stats.lastEmptyAt !== null && !timestamp(stats.lastEmptyAt))
  ) {
    throw new Error("invalid MAX trending observation stats")
  }

    const identities = new Set<string>()
  for (const state of value.assetStates) {
    if (
      !record(state) ||
      typeof state.identityKey !== "string" ||
      !state.identityKey ||
      identities.has(state.identityKey) ||
      !timestamp(state.firstSeenAt) ||
      !timestamp(state.lastSeenAt) ||
      Date.parse(state.firstSeenAt) > Date.parse(state.lastSeenAt) ||
      !Number.isInteger(state.observationCount) ||
      Number(state.observationCount) < 1 ||
      !Number.isInteger(state.lastPosition) ||
      Number(state.lastPosition) < 1 ||
      typeof state.active !== "boolean"
    ) {
      throw new Error("invalid MAX trending asset state")
    }
    identities.add(state.identityKey)
  }

  let lastObservedAt = -Infinity
  for (const item of value.snapshots) {
    if (
      !record(item) ||
      !timestamp(item.observedAt) ||
      typeof item.snapshotHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(item.snapshotHash) ||
      !record(item.snapshot) ||
      item.snapshot.observedAt !== item.observedAt ||
      hashMaxTrendingSnapshot(item.snapshot as MaxTrendingSnapshot) !==
        item.snapshotHash ||
      !record(item.detection) ||
      item.detection.observedAt !== item.observedAt
    ) {
      throw new Error("invalid MAX trending snapshot record")
    }
    const observedAt = Date.parse(item.observedAt)
    if (observedAt <= lastObservedAt) {
      throw new Error("MAX trending ledger snapshots are out of order")
    }
    lastObservedAt = observedAt
  }

  if (
    value.snapshots.length === 0
      ? value.updatedAt !== null
      : value.updatedAt !== value.snapshots.at(-1)?.observedAt
  ) {
    throw new Error("MAX trending ledger update timestamp is inconsistent")
  }
}

export function emptyMaxTrendingLedger(): MaxTrendingLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    assetStates: [],
    observationStats: emptyObservationStats(),
    snapshots: [],
  }
}

export function parseMaxTrendingLedger(serialized: string) {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid MAX trending ledger JSON")
  }
  if (
    record(value) &&
    Array.isArray(value.snapshots) &&
    value.observationStats === undefined
  ) {
    value = {
      ...value,
      observationStats: statsFromSnapshots(
        value.snapshots as ReadonlyArray<MaxTrendingSnapshotRecord>
      ),
    }
  }
  assertLedger(value)
  return structuredClone(value)
}

export async function loadMaxTrendingLedger(store: MaxTrendingStore) {
  const serialized = await store.read()
  return serialized === null
    ? emptyMaxTrendingLedger()
    : parseMaxTrendingLedger(serialized)
}

function updateAssetStates(
  ledger: MaxTrendingLedger,
  snapshot: MaxTrendingSnapshot
) {
  if (snapshot.trending.length === 0) {
    const lastNonEmpty = ledger.snapshots.findLast(
      item => item.snapshot.trending.length > 0
    )
    if (!lastNonEmpty) return structuredClone(ledger.assetStates)

    const activeIdentities = new Set(
      lastNonEmpty.snapshot.trending.map(asset => asset.identityKey)
    )
    return ledger.assetStates.map(state => ({
      ...state,
      active: activeIdentities.has(state.identityKey),
    }))
  }

  const current = new Map(
    snapshot.trending.map(asset => [asset.identityKey, asset])
  )
  const states = new Map(
    ledger.assetStates.map(state => [
      state.identityKey,
      { ...state, active: current.has(state.identityKey) },
    ])
  )

  for (const asset of snapshot.trending) {
    const existing = states.get(asset.identityKey)
    states.set(asset.identityKey, existing
      ? {
          ...existing,
          lastSeenAt: snapshot.observedAt,
          observationCount: existing.observationCount + 1,
          lastPosition: asset.position,
          active: true,
        }
      : {
          identityKey: asset.identityKey,
          firstSeenAt: snapshot.observedAt,
          lastSeenAt: snapshot.observedAt,
          observationCount: 1,
          lastPosition: asset.position,
          active: true,
        }
    )
  }

  return [...states.values()].sort((a, b) =>
    a.identityKey.localeCompare(b.identityKey)
  )
}

export async function persistMaxTrendingSnapshot(
  store: MaxTrendingStore,
  snapshot: MaxTrendingSnapshot
) {
  const ledger = await loadMaxTrendingLedger(store)
  const snapshotHash = hashMaxTrendingSnapshot(snapshot)
  const last = ledger.snapshots.at(-1)

  if (last?.observedAt === snapshot.observedAt) {
    if (last.snapshotHash !== snapshotHash) {
      throw new Error("MAX trending timestamp already has another snapshot")
    }
    return { changed: false, ledger, detection: last.detection }
  }
  if (
    ledger.updatedAt !== null &&
    Date.parse(snapshot.observedAt) <= Date.parse(ledger.updatedAt)
  ) {
    throw new Error("MAX trending snapshot is stale or out of order")
  }

  const lastNonEmpty = ledger.snapshots.findLast(
    item => item.snapshot.trending.length > 0
  )
  const detection = detectMaxTrendingChanges({
    previous: snapshot.trending.length === 0
      ? last?.snapshot ?? null
      : lastNonEmpty?.snapshot ?? null,
    current: snapshot,
    seenIdentityKeys: new Set(
      ledger.assetStates.map(state => state.identityKey)
    ),
  })
  const record: MaxTrendingSnapshotRecord = {
    observedAt: snapshot.observedAt,
    snapshotHash,
    snapshot: structuredClone(snapshot),
    detection,
  }
  const next: MaxTrendingLedger = {
    schemaVersion: 1,
    revision: ledger.revision + 1,
    updatedAt: snapshot.observedAt,
    assetStates: updateAssetStates(ledger, snapshot),
    observationStats: updateObservationStats(
      ledger.observationStats,
      detection
    ),
    snapshots: compactSnapshots(ledger.snapshots, record),
  }
  assertLedger(next)

  const written = await store.compareAndSet(
    ledger.revision,
    JSON.stringify(next)
  )
  if (!written) {
    throw new Error("MAX trending concurrent write rejected")
  }
  return { changed: true, ledger: next, detection }
}
