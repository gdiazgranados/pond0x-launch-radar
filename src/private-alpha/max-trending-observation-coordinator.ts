import {
  observeMaxTrending,
  type MaxTrendingSnapshot,
} from "./max-trending-client"
import type {
  MaxTrendingChange,
} from "./max-trending-change-detector"
import {
  persistMaxTrendingSnapshot,
  type MaxTrendingStore,
} from "./max-trending-snapshot-repository"

type ObserveMaxTrending = () => Promise<MaxTrendingSnapshot>

export type MaxTrendingOpportunityEvent = {
  schemaVersion: 1
  eventId: string
  type: "MAX_TRENDING_MATERIAL_CHANGE"
  observedAt: string
  snapshotHash: string
  changes: ReadonlyArray<MaxTrendingChange>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export type MaxTrendingObservationResult = {
  schemaVersion: 1
  observedAt: string
  status: "MATERIAL_CHANGE" | "EMPTY" | "UNCHANGED"
  persisted: boolean
  ledgerRevision: number
  snapshotHash: string
  event: MaxTrendingOpportunityEvent | null
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

function buildEvent(input: {
  observedAt: string
  snapshotHash: string
  changes: ReadonlyArray<MaxTrendingChange>
}): MaxTrendingOpportunityEvent {
  return {
    schemaVersion: 1,
    eventId: `max-trending:${input.observedAt}:${input.snapshotHash}`,
    type: "MAX_TRENDING_MATERIAL_CHANGE",
    observedAt: input.observedAt,
    snapshotHash: input.snapshotHash,
    changes: structuredClone(input.changes),
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

export async function coordinateMaxTrendingObservation(input: {
  store: MaxTrendingStore
  observe?: ObserveMaxTrending
}): Promise<MaxTrendingObservationResult> {
  const snapshot = await (input.observe ?? observeMaxTrending)()
  const persisted = await persistMaxTrendingSnapshot(input.store, snapshot)
  const detection = persisted.detection
  const event = detection.materialChange
    ? buildEvent({
        observedAt: detection.observedAt,
        snapshotHash: detection.snapshotHash,
        changes: detection.changes,
      })
    : null

  return {
    schemaVersion: 1,
    observedAt: detection.observedAt,
    status: event
      ? "MATERIAL_CHANGE"
      : detection.status === "EMPTY"
        ? "EMPTY"
        : "UNCHANGED",
    persisted: persisted.changed,
    ledgerRevision: persisted.ledger.revision,
    snapshotHash: detection.snapshotHash,
    event,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}
