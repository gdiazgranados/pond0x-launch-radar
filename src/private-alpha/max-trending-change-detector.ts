import { createHash } from "node:crypto"
import type {
  MaxTrendingAsset,
  MaxTrendingSnapshot,
} from "./max-trending-client"

export type MaxTrendingChangeType =
  | "NEW"
  | "REAPPEARED"
  | "MOVED"
  | "REMOVED"

export type MaxTrendingChange = {
  type: MaxTrendingChangeType
  identityKey: string
  asset: MaxTrendingAsset
  previousPosition: number | null
  currentPosition: number | null
}

export type MaxTrendingDetection = {
  schemaVersion: 1
  observedAt: string
  previousObservedAt: string | null
  status: "CHANGED" | "EMPTY" | "UNCHANGED"
  materialChange: boolean
  snapshotHash: string
  changes: ReadonlyArray<MaxTrendingChange>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export function hashMaxTrendingSnapshot(snapshot: MaxTrendingSnapshot) {
  const normalized = snapshot.trending.map(asset => ({
    identityKey: asset.identityKey,
    position: asset.position,
  }))
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
}

function assertSnapshotOrder(
  previous: MaxTrendingSnapshot | null,
  current: MaxTrendingSnapshot
) {
  if (
    previous &&
    Date.parse(current.observedAt) <= Date.parse(previous.observedAt)
  ) {
    throw new Error("MAX trending snapshots are out of order")
  }
}

export function detectMaxTrendingChanges(input: {
  previous: MaxTrendingSnapshot | null
  current: MaxTrendingSnapshot
  seenIdentityKeys?: ReadonlySet<string>
}): MaxTrendingDetection {
  assertSnapshotOrder(input.previous, input.current)
  if (input.current.trending.length === 0) {
    return {
      schemaVersion: 1,
      observedAt: input.current.observedAt,
      previousObservedAt: input.previous?.observedAt ?? null,
      status: "EMPTY",
      materialChange: false,
      snapshotHash: hashMaxTrendingSnapshot(input.current),
      changes: [],
      watchOnly: true,
      approvalGranted: false,
      transactionRequested: false,
    }
  }

  const previousByIdentity = new Map(
    (input.previous?.trending ?? []).map(asset => [
      asset.identityKey,
      asset,
    ])
  )
  const currentByIdentity = new Map(
    input.current.trending.map(asset => [
      asset.identityKey,
      asset,
    ])
  )
  const changes: MaxTrendingChange[] = []

  for (const asset of input.current.trending) {
    const previousAsset = previousByIdentity.get(asset.identityKey)
    if (!previousAsset) {
      changes.push({
        type: input.seenIdentityKeys?.has(asset.identityKey)
          ? "REAPPEARED"
          : "NEW",
        identityKey: asset.identityKey,
        asset: structuredClone(asset),
        previousPosition: null,
        currentPosition: asset.position,
      })
    } else if (previousAsset.position !== asset.position) {
      changes.push({
        type: "MOVED",
        identityKey: asset.identityKey,
        asset: structuredClone(asset),
        previousPosition: previousAsset.position,
        currentPosition: asset.position,
      })
    }
  }

  for (const asset of input.previous?.trending ?? []) {
    if (!currentByIdentity.has(asset.identityKey)) {
      changes.push({
        type: "REMOVED",
        identityKey: asset.identityKey,
        asset: structuredClone(asset),
        previousPosition: asset.position,
        currentPosition: null,
      })
    }
  }

  return {
    schemaVersion: 1,
    observedAt: input.current.observedAt,
    previousObservedAt: input.previous?.observedAt ?? null,
    status: input.current.trending.length === 0
      ? "EMPTY"
      : changes.length > 0
        ? "CHANGED"
        : "UNCHANGED",
    materialChange: changes.length > 0,
    snapshotHash: hashMaxTrendingSnapshot(input.current),
    changes,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}
