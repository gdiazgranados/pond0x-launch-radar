import test from "node:test"
import assert from "node:assert/strict"
import {
  detectMaxTrendingChanges,
} from "../../src/private-alpha/max-trending-change-detector"
import {
  emptyMaxTrendingLedger,
  loadMaxTrendingLedger,
  persistMaxTrendingSnapshot,
  type MaxTrendingStore,
} from "../../src/private-alpha/max-trending-snapshot-repository"
import type {
  MaxTrendingAsset,
  MaxTrendingSnapshot,
} from "../../src/private-alpha/max-trending-client"

const MINT_A = "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq"
const MINT_B = "So11111111111111111111111111111111111111112"

function asset(
  mint: string,
  position: number,
  symbol: string
): MaxTrendingAsset {
  return {
    network: "solana",
    contractAddress: mint,
    symbol,
    name: symbol,
    position,
    identityKey: `solana:${mint}`,
  }
}

function snapshot(
  observedAt: string,
  trending: ReadonlyArray<MaxTrendingAsset>
): MaxTrendingSnapshot {
  return {
    schemaVersion: 1,
    observedAt,
    status: trending.length === 0 ? "EMPTY" : "OBSERVED",
    query: { q: "", verified: false, network: "all" },
    tokenCount: 4,
    trending,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "PONDOX_MAX_SEARCH",
  }
}

class MemoryStore implements MaxTrendingStore {
  serialized: string | null = null
  rejectWrite = false

  async read() {
    return this.serialized
  }

  async compareAndSet(expectedRevision: number, next: string) {
    if (this.rejectWrite) return false
    const current = this.serialized === null
      ? 0
      : JSON.parse(this.serialized).revision
    if (current !== expectedRevision) return false
    this.serialized = next
    return true
  }
}

test("records first EMPTY and keeps the next EMPTY unchanged", async () => {
  const store = new MemoryStore()
  const first = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:32:44.666Z", [])
  )
  const second = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:33:44.666Z", [])
  )

  assert.equal(first.detection.status, "EMPTY")
  assert.equal(first.detection.materialChange, false)
  assert.equal(second.detection.status, "EMPTY")
  assert.equal(second.detection.materialChange, false)
  assert.deepEqual(second.detection.changes, [])
  assert.equal(second.changed, false)
  assert.equal(second.ledger.revision, 1)
})

test("detects NEW, MOVED, REMOVED and REAPPEARED", async () => {
  const store = new MemoryStore()
  await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:00:00.000Z", [])
  )
  const added = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:01:00.000Z", [
      asset(MINT_A, 1, "A"),
      asset(MINT_B, 2, "B"),
    ])
  )
  assert.deepEqual(
    added.detection.changes.map(change => change.type),
    ["NEW", "NEW"]
  )

  const changed = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:02:00.000Z", [
      asset(MINT_B, 1, "B"),
    ])
  )
  assert.deepEqual(
    changed.detection.changes.map(change => change.type),
    ["MOVED", "REMOVED"]
  )

  const reappeared = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:03:00.000Z", [
      asset(MINT_B, 1, "B"),
      asset(MINT_A, 2, "A"),
    ])
  )
  assert.deepEqual(
    reappeared.detection.changes.map(change => change.type),
    ["REAPPEARED"]
  )
  const stateA = reappeared.ledger.assetStates.find(
    state => state.identityKey === `solana:${MINT_A}`
  )
  assert.equal(stateA?.observationCount, 2)
  assert.equal(stateA?.firstSeenAt, "2026-09-16T18:01:00.000Z")
  assert.equal(stateA?.lastSeenAt, "2026-09-16T18:03:00.000Z")
})

test("unchanged composition is non-material", () => {
  const previous = snapshot("2026-09-16T18:00:00.000Z", [
    asset(MINT_A, 1, "A"),
  ])
  const current = snapshot("2026-09-16T18:01:00.000Z", [
    asset(MINT_A, 1, "A"),
  ])
  const result = detectMaxTrendingChanges({ previous, current })
  assert.equal(result.status, "UNCHANGED")
  assert.equal(result.materialChange, false)
  assert.deepEqual(result.changes, [])
})

test("bridges a transient EMPTY without removals or reappearances", async () => {
  const store = new MemoryStore()
  const visible = [
    asset(MINT_A, 1, "A"),
    asset(MINT_B, 2, "B"),
  ]
  await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:00:00.000Z", visible)
  )
  const empty = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:01:00.000Z", [])
  )

  assert.equal(empty.detection.status, "EMPTY")
  assert.equal(empty.detection.materialChange, false)
  assert.deepEqual(empty.detection.changes, [])
  assert.equal(
    empty.ledger.assetStates.every(state => state.active),
    true
  )
  assert.deepEqual(
    empty.ledger.assetStates.map(state => state.observationCount),
    [1, 1]
  )

  const resumed = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:02:00.000Z", visible)
  )
  assert.equal(resumed.detection.status, "UNCHANGED")
  assert.equal(resumed.detection.materialChange, false)
  assert.deepEqual(resumed.detection.changes, [])
  assert.deepEqual(
    resumed.ledger.assetStates.map(state => state.observationCount),
    [2, 2]
  )
})

test("detects only the real difference after a transient EMPTY", async () => {
  const store = new MemoryStore()
  await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:00:00.000Z", [
      asset(MINT_A, 1, "A"),
      asset(MINT_B, 2, "B"),
    ])
  )
  await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:01:00.000Z", [])
  )
  const changed = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:02:00.000Z", [
      asset(MINT_B, 1, "B"),
    ])
  )

  assert.equal(changed.detection.status, "CHANGED")
  assert.deepEqual(
    changed.detection.changes.map(change => change.type),
    ["MOVED", "REMOVED"]
  )
  assert.deepEqual(
    changed.detection.changes.map(change => change.identityKey),
    [`solana:${MINT_B}`, `solana:${MINT_A}`]
  )
})

test("identical retry is idempotent but conflicting timestamp fails", async () => {
  const store = new MemoryStore()
  const value = snapshot("2026-09-16T18:00:00.000Z", [])
  await persistMaxTrendingSnapshot(store, value)
  const retry = await persistMaxTrendingSnapshot(store, value)
  assert.equal(retry.changed, false)
  assert.equal(retry.ledger.revision, 1)

  await assert.rejects(
    () => persistMaxTrendingSnapshot(
      store,
      snapshot("2026-09-16T18:00:00.000Z", [asset(MINT_A, 1, "A")])
    ),
    /timestamp already has another snapshot/
  )
})

test("rejects stale observations and concurrent writes", async () => {
  const store = new MemoryStore()
  await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:01:00.000Z", [])
  )
  await assert.rejects(
    () => persistMaxTrendingSnapshot(
      store,
      snapshot("2026-09-16T18:00:00.000Z", [])
    ),
    /stale or out of order/
  )

  store.rejectWrite = true
  await assert.rejects(
    () => persistMaxTrendingSnapshot(
      store,
      snapshot("2026-09-16T18:02:00.000Z", [
        asset(MINT_A, 1, "A"),
      ])
    ),
    /concurrent write rejected/
  )
})

test("compacts high-volume unchanged observations into one tail", async () => {
  const store = new MemoryStore()
  const visible = [asset(MINT_A, 1, "A")]
  await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:00:00.000Z", visible)
  )

  for (let index = 1; index <= 100; index += 1) {
    await persistMaxTrendingSnapshot(
      store,
      snapshot(
        new Date(Date.parse("2026-09-16T18:00:00.000Z") + index * 1_000)
          .toISOString(),
        visible
      )
    )
  }

  const ledger = await loadMaxTrendingLedger(store)
  assert.equal(ledger.revision, 1)
  assert.equal(ledger.snapshots.length, 1)
  assert.equal(ledger.observationStats.totalCount, 1)
  assert.equal(ledger.observationStats.baselineCount, 1)
  assert.equal(ledger.observationStats.unchangedCount, 0)
  assert.equal(ledger.observationStats.materialCount, 0)
  assert.equal(ledger.observationStats.emptyCount, 0)
})

test("migrates an existing ledger into compact observation stats", async () => {
  const store = new MemoryStore()
  await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:00:00.000Z", [asset(MINT_A, 1, "A")])
  )
  await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:01:00.000Z", [])
  )

  const legacy = JSON.parse(store.serialized!)
  delete legacy.observationStats
  store.serialized = JSON.stringify(legacy)

  const migrated = await loadMaxTrendingLedger(store)
  assert.equal(migrated.observationStats.totalCount, 2)
  assert.equal(migrated.observationStats.baselineCount, 1)
  assert.equal(migrated.observationStats.emptyCount, 1)

  const persisted = await persistMaxTrendingSnapshot(
    store,
    snapshot("2026-09-16T18:02:00.000Z", [])
  )
  assert.equal(persisted.changed, false)
  assert.equal(persisted.ledger.observationStats.totalCount, 2)
  assert.equal(persisted.ledger.observationStats.emptyCount, 1)
  assert.equal(persisted.ledger.snapshots.length, 2)
})

test("fails closed on corrupt ledgers", async () => {
  const store = new MemoryStore()
  store.serialized = JSON.stringify({
    ...emptyMaxTrendingLedger(),
    revision: -1,
  })
  await assert.rejects(
    () => loadMaxTrendingLedger(store),
    /invalid MAX trending ledger/
  )
})
