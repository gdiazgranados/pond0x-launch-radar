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

export type MaxTrendingLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  assetStates: ReadonlyArray<MaxTrendingAssetState>
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

function assertLedger(value: unknown): asserts value is MaxTrendingLedger {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null && !timestamp(value.updatedAt)) ||
    !Array.isArray(value.assetStates) ||
    !Array.isArray(value.snapshots) ||
    value.snapshots.length > MAX_SNAPSHOTS
  ) {
    throw new Error("invalid MAX trending ledger")
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

  const detection = detectMaxTrendingChanges({
    previous: last?.snapshot ?? null,
    current: snapshot,
    seenIdentityKeys: new Set(
      ledger.assetStates.map(state => state.identityKey)
    ),
  })
  const next: MaxTrendingLedger = {
    schemaVersion: 1,
    revision: ledger.revision + 1,
    updatedAt: snapshot.observedAt,
    assetStates: updateAssetStates(ledger, snapshot),
    snapshots: [
      ...ledger.snapshots,
      {
        observedAt: snapshot.observedAt,
        snapshotHash,
        snapshot: structuredClone(snapshot),
        detection,
      },
    ].slice(-MAX_SNAPSHOTS),
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
