import assert from "node:assert/strict"
import test from "node:test"

import {
  coordinateMaxTrendingAttentionObservation,
} from "../../src/private-alpha/max-trending-attention-coordinator"
import type {
  MaxAttentionInboxStore,
} from "../../src/private-alpha/max-attention-inbox-repository"
import type {
  MaxTrendingAsset,
  MaxTrendingSnapshot,
} from "../../src/private-alpha/max-trending-client"
import type {
  MaxTrendingStore,
} from "../../src/private-alpha/max-trending-snapshot-repository"

const MINT_A = "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq"
const MINT_B = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx"

class MemoryStore implements MaxTrendingStore, MaxAttentionInboxStore {
  serialized: string | null = null
  rejectWrite = false
  writes = 0

  async read() {
    return this.serialized
  }

  async compareAndSet(expectedRevision: number, next: string) {
    if (this.rejectWrite) return false
    const revision = this.serialized === null
      ? 0
      : JSON.parse(this.serialized).revision
    if (revision !== expectedRevision) return false
    this.serialized = next
    this.writes += 1
    return true
  }
}

function asset(
  mint: string,
  symbol: string,
  position: number
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

test("keeps the baseline out of the persistent attention inbox", async () => {
  const observationStore = new MemoryStore()
  const attentionInboxStore = new MemoryStore()
  const result = await coordinateMaxTrendingAttentionObservation({
    observationStore,
    attentionInboxStore,
    observe: async () => snapshot(
      "2026-09-17T01:00:00.000Z",
      [asset(MINT_A, "BASE", 1)]
    ),
  })

  assert.equal(result.status, "BASELINE")
  assert.equal(result.attentionInbox.persisted, false)
  assert.equal(result.attentionInbox.revision, 0)
  assert.equal(result.attentionInbox.totalCandidates, 0)
  assert.equal(attentionInboxStore.writes, 0)
})

test("persists NEW attention before reporting a successful result", async () => {
  const observationStore = new MemoryStore()
  const attentionInboxStore = new MemoryStore()
  await coordinateMaxTrendingAttentionObservation({
    observationStore,
    attentionInboxStore,
    observe: async () => snapshot(
      "2026-09-17T01:00:00.000Z",
      [asset(MINT_A, "BASE", 1)]
    ),
  })
  const result = await coordinateMaxTrendingAttentionObservation({
    observationStore,
    attentionInboxStore,
    observe: async () => snapshot(
      "2026-09-17T01:01:00.000Z",
      [
        asset(MINT_A, "BASE", 1),
        asset(MINT_B, "NEW", 2),
      ]
    ),
  })

  assert.equal(result.opportunity.status, "EARLY_ATTENTION")
  assert.equal(result.attentionInbox.persisted, true)
  assert.equal(result.attentionInbox.revision, 1)
  assert.equal(result.attentionInbox.totalCandidates, 1)
  assert.equal(result.attentionInbox.pendingReviewCount, 1)
  assert.equal(result.attentionInbox.monitoringCount, 0)
  assert.equal(result.attentionInbox.dismissedCount, 0)
})

test("deduplicates a retried observation across both ledgers", async () => {
  const observationStore = new MemoryStore()
  const attentionInboxStore = new MemoryStore()
  await coordinateMaxTrendingAttentionObservation({
    observationStore,
    attentionInboxStore,
    observe: async () => snapshot(
      "2026-09-17T01:00:00.000Z",
      [asset(MINT_A, "BASE", 1)]
    ),
  })
  const current = snapshot(
    "2026-09-17T01:01:00.000Z",
    [
      asset(MINT_A, "BASE", 1),
      asset(MINT_B, "NEW", 2),
    ]
  )
  await coordinateMaxTrendingAttentionObservation({
    observationStore,
    attentionInboxStore,
    observe: async () => current,
  })
  const retry = await coordinateMaxTrendingAttentionObservation({
    observationStore,
    attentionInboxStore,
    observe: async () => structuredClone(current),
  })

  assert.equal(retry.persisted, false)
  assert.equal(retry.attentionInbox.persisted, false)
  assert.equal(retry.attentionInbox.revision, 1)
  assert.equal(attentionInboxStore.writes, 1)
})

test("fails the cycle when attention persistence is rejected", async () => {
  const observationStore = new MemoryStore()
  const attentionInboxStore = new MemoryStore()
  await coordinateMaxTrendingAttentionObservation({
    observationStore,
    attentionInboxStore,
    observe: async () => snapshot(
      "2026-09-17T01:00:00.000Z",
      [asset(MINT_A, "BASE", 1)]
    ),
  })
  attentionInboxStore.rejectWrite = true

  await assert.rejects(
    coordinateMaxTrendingAttentionObservation({
      observationStore,
      attentionInboxStore,
      observe: async () => snapshot(
        "2026-09-17T01:01:00.000Z",
        [
          asset(MINT_A, "BASE", 1),
          asset(MINT_B, "NEW", 2),
        ]
      ),
    }),
    /attention inbox concurrent write rejected/
  )
  assert.equal(observationStore.writes, 2)
  assert.equal(attentionInboxStore.writes, 0)
})
