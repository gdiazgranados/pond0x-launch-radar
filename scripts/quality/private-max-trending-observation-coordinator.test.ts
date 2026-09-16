import test from "node:test"
import assert from "node:assert/strict"
import {
  coordinateMaxTrendingObservation,
} from "../../src/private-alpha/max-trending-observation-coordinator"
import type {
  MaxTrendingAsset,
  MaxTrendingSnapshot,
} from "../../src/private-alpha/max-trending-client"
import type {
  MaxTrendingStore,
} from "../../src/private-alpha/max-trending-snapshot-repository"

const MINT = "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq"

function asset(position = 1): MaxTrendingAsset {
  return {
    network: "solana",
    contractAddress: MINT,
    symbol: "TEST",
    name: "Test",
    position,
    identityKey: `solana:${MINT}`,
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
  writes = 0

  async read() {
    return this.serialized
  }

  async compareAndSet(expectedRevision: number, next: string) {
    const revision = this.serialized === null
      ? 0
      : JSON.parse(this.serialized).revision
    if (revision !== expectedRevision) return false
    this.serialized = next
    this.writes += 1
    return true
  }
}

test("coordinates EMPTY evidence without creating an event", async () => {
  const store = new MemoryStore()
  const result = await coordinateMaxTrendingObservation({
    store,
    observe: async () => snapshot("2026-09-16T18:32:44.666Z", []),
  })

  assert.equal(result.status, "EMPTY")
  assert.equal(result.persisted, true)
  assert.equal(result.ledgerRevision, 1)
  assert.equal(result.event, null)
  assert.equal(result.watchOnly, true)
  assert.equal(result.approvalGranted, false)
  assert.equal(result.transactionRequested, false)
})

test("creates only a watch-only event for a material change", async () => {
  const store = new MemoryStore()
  await coordinateMaxTrendingObservation({
    store,
    observe: async () => snapshot("2026-09-16T18:32:44.666Z", []),
  })
  const result = await coordinateMaxTrendingObservation({
    store,
    observe: async () => snapshot(
      "2026-09-16T18:33:44.666Z",
      [asset()]
    ),
  })

  assert.equal(result.status, "MATERIAL_CHANGE")
  assert.equal(result.ledgerRevision, 2)
  assert.equal(result.event?.type, "MAX_TRENDING_MATERIAL_CHANGE")
  assert.equal(result.event?.changes[0]?.type, "NEW")
  assert.match(result.event?.eventId ?? "", /^max-trending:/)
  assert.equal(result.event?.approvalGranted, false)
  assert.equal(result.event?.transactionRequested, false)
})

test("keeps an unchanged observation healthy and event-free", async () => {
  const store = new MemoryStore()
  await coordinateMaxTrendingObservation({
    store,
    observe: async () => snapshot("2026-09-16T18:32:44.666Z", [asset()]),
  })
  const result = await coordinateMaxTrendingObservation({
    store,
    observe: async () => snapshot("2026-09-16T18:33:44.666Z", [asset()]),
  })

  assert.equal(result.status, "UNCHANGED")
  assert.equal(result.event, null)
  assert.equal(result.ledgerRevision, 2)
})

test("makes an identical retry idempotent with a stable event", async () => {
  const store = new MemoryStore()
  const current = snapshot("2026-09-16T18:32:44.666Z", [asset()])
  const first = await coordinateMaxTrendingObservation({
    store,
    observe: async () => current,
  })
  const retry = await coordinateMaxTrendingObservation({
    store,
    observe: async () => structuredClone(current),
  })

  assert.equal(first.status, "MATERIAL_CHANGE")
  assert.equal(retry.persisted, false)
  assert.equal(retry.ledgerRevision, 1)
  assert.equal(retry.event?.eventId, first.event?.eventId)
  assert.equal(store.writes, 1)
})

test("does not write when observation fails", async () => {
  const store = new MemoryStore()
  await assert.rejects(
    () => coordinateMaxTrendingObservation({
      store,
      observe: async () => {
        throw new Error("Pond0x MAX returned invalid JSON")
      },
    }),
    /invalid JSON/
  )
  assert.equal(store.serialized, null)
  assert.equal(store.writes, 0)
})

test("does not emit an event when persistence fails", async () => {
  const store: MaxTrendingStore = {
    read: async () => null,
    compareAndSet: async () => false,
  }
  await assert.rejects(
    () => coordinateMaxTrendingObservation({
      store,
      observe: async () => snapshot("2026-09-16T18:32:44.666Z", [asset()]),
    }),
    /concurrent write rejected/
  )
})
