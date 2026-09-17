import assert from "node:assert/strict"
import test from "node:test"

import {
  parseMaxTrendingPayload,
} from "../../src/private-alpha/max-trending-client"
import {
  MAX_TRENDING_ROUTINE_HEARTBEAT_MS,
  persistMaxTrendingSnapshot,
} from "../../src/private-alpha/max-trending-snapshot-repository"

class MemoryStore {
  value: string | null = null
  writes = 0

  async read() {
    return this.value
  }

  async compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ) {
    const currentRevision = this.value === null
      ? 0
      : Number(JSON.parse(this.value).revision)
    if (currentRevision !== expectedRevision) return false
    this.value = serializedLedger
    this.writes += 1
    return true
  }
}

const mint = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"

function observedAt(offsetMs: number) {
  return new Date(
    Date.parse("2026-09-17T00:00:00.000Z") + offsetMs
  ).toISOString()
}

function snapshot(
  offsetMs: number,
  trending = true,
  symbol = "RAY"
) {
  return parseMaxTrendingPayload({
    tokens: [],
    trending: trending
      ? [{
          network: "solana",
          contractAddress: mint,
          symbol,
          name: "Raydium",
        }]
      : [],
  }, observedAt(offsetMs))
}

test("does not rewrite an unchanged MAX ledger every poll", async () => {
  const store = new MemoryStore()
  const baseline = await persistMaxTrendingSnapshot(
    store,
    snapshot(0)
  )
  const routine = await persistMaxTrendingSnapshot(
    store,
    snapshot(30_000)
  )

  assert.equal(baseline.changed, true)
  assert.equal(routine.changed, false)
  assert.equal(routine.detection.status, "UNCHANGED")
  assert.equal(routine.detection.observedAt, observedAt(30_000))
  assert.equal(routine.ledger.revision, 1)
  assert.equal(store.writes, 1)
})

test("persists a compact routine heartbeat after fifteen minutes", async () => {
  const store = new MemoryStore()
  await persistMaxTrendingSnapshot(store, snapshot(0))
  const heartbeat = await persistMaxTrendingSnapshot(
    store,
    snapshot(MAX_TRENDING_ROUTINE_HEARTBEAT_MS)
  )

  assert.equal(heartbeat.changed, true)
  assert.equal(heartbeat.ledger.revision, 2)
  assert.equal(heartbeat.ledger.observationStats.totalCount, 2)
  assert.equal(heartbeat.ledger.snapshots.length, 2)
  assert.equal(store.writes, 2)
})

test("persists EMPTY transitions but suppresses repeated empty writes", async () => {
  const store = new MemoryStore()
  await persistMaxTrendingSnapshot(store, snapshot(0))
  const firstEmpty = await persistMaxTrendingSnapshot(
    store,
    snapshot(30_000, false)
  )
  const repeatedEmpty = await persistMaxTrendingSnapshot(
    store,
    snapshot(60_000, false)
  )

  assert.equal(firstEmpty.changed, true)
  assert.equal(firstEmpty.detection.status, "EMPTY")
  assert.equal(repeatedEmpty.changed, false)
  assert.equal(repeatedEmpty.detection.status, "EMPTY")
  assert.equal(store.writes, 2)
})

test("persists material changes immediately inside heartbeat window", async () => {
  const store = new MemoryStore()
  await persistMaxTrendingSnapshot(store, snapshot(0))
  const changed = await persistMaxTrendingSnapshot(
    store,
    snapshot(30_000, true, "RAY-UPDATED")
  )

  assert.equal(changed.changed, true)
  assert.equal(changed.detection.materialChange, true)
  assert.equal(changed.ledger.revision, 2)
  assert.equal(store.writes, 2)
})
