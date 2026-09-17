import assert from "node:assert/strict"
import test from "node:test"

import {
  parseMaxAttentionInboxLedger,
  persistMaxAttentionCandidates,
  updateMaxAttentionCandidateState,
  type MaxAttentionInboxStore,
} from "../../src/private-alpha/max-attention-inbox-repository"
import type {
  MaxTrendingAttentionCandidate,
  MaxTrendingOpportunityClassification,
} from "../../src/private-alpha/max-trending-opportunity-classifier"

class MemoryStore implements MaxAttentionInboxStore {
  serialized: string | null = null
  rejectWrite = false
  writes = 0

  async read() {
    return this.serialized
  }

  async compareAndSet(expectedRevision: number, serialized: string) {
    if (this.rejectWrite) return false
    const current = this.serialized === null
      ? 0
      : JSON.parse(this.serialized).revision
    if (current !== expectedRevision) return false
    this.serialized = serialized
    this.writes += 1
    return true
  }
}

function candidate(input: {
  identity?: string
  observedAt?: string
  trigger?: "NEW" | "REAPPEARED"
  position?: number
} = {}): MaxTrendingAttentionCandidate {
  const identity = input.identity ?? "solana:mint-a"
  const observedAt = input.observedAt ?? "2026-09-17T01:32:00.000Z"
  const trigger = input.trigger ?? "NEW"
  return {
    candidateId: `max-attention:${observedAt}:${identity}`,
    trigger,
    stage: trigger === "NEW" ? "FIRST_SEEN" : "RETURNED",
    identityKey: identity,
    network: "solana",
    contractAddress: identity.slice("solana:".length),
    symbol: identity.slice(-6).toUpperCase(),
    name: "Test token",
    position: input.position ?? 2,
    firstSeenAt: trigger === "NEW"
      ? observedAt
      : "2026-09-01T00:00:00.000Z",
    lastSeenAt: observedAt,
    observationCount: trigger === "NEW" ? 1 : 3,
    priority: "IMMEDIATE_REVIEW",
    successProbability: null,
    investmentRecommendation: null,
    requiresHumanDecision: true,
  }
}

function opportunity(
  candidates: ReadonlyArray<MaxTrendingAttentionCandidate>,
  observedAt = candidates[0]?.lastSeenAt ??
    "2026-09-17T01:32:00.000Z"
): MaxTrendingOpportunityClassification {
  return {
    schemaVersion: 1,
    observedAt,
    status: candidates.length > 0 ? "EARLY_ATTENTION" : "NO_CHANGE",
    candidates,
    context: { moved: [], removed: [] },
    fastFollowUp: {
      recommended: candidates.length > 0,
      afterSeconds: candidates.length > 0 ? 10 : null,
    },
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

test("persists a new candidate as pending human review", async () => {
  const store = new MemoryStore()
  const result = await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity([candidate()]),
  })

  assert.equal(result.changed, true)
  assert.equal(result.ledger.revision, 1)
  assert.equal(result.ledger.candidates.length, 1)
  assert.equal(result.ledger.candidates[0]?.state, "PENDING_REVIEW")
  assert.equal(result.ledger.candidates[0]?.appearanceCount, 1)
  assert.equal(result.ledger.candidates[0]?.newCount, 1)
  assert.equal(result.ledger.candidates[0]?.reappearedCount, 0)
  assert.equal(result.ledger.candidates[0]?.watchOnly, true)
  assert.equal(result.ledger.candidates[0]?.approvalGranted, false)
  assert.equal(result.ledger.candidates[0]?.transactionRequested, false)
})

test("deduplicates an identical attention event without writing", async () => {
  const store = new MemoryStore()
  const signal = opportunity([candidate()])
  await persistMaxAttentionCandidates({ store, opportunity: signal })
  const retry = await persistMaxAttentionCandidates({
    store,
    opportunity: signal,
  })

  assert.equal(retry.changed, false)
  assert.equal(retry.ledger.revision, 1)
  assert.equal(retry.ledger.candidates[0]?.appearanceCount, 1)
  assert.equal(store.writes, 1)
})

test("merges a reappearance and preserves bounded history", async () => {
  const store = new MemoryStore()
  await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity([candidate()]),
  })
  const returned = candidate({
    observedAt: "2026-09-18T01:32:00.000Z",
    trigger: "REAPPEARED",
    position: 1,
  })
  const result = await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity([returned]),
  })

  const stored = result.ledger.candidates[0]
  assert.equal(stored?.appearanceCount, 2)
  assert.equal(stored?.newCount, 1)
  assert.equal(stored?.reappearedCount, 1)
  assert.equal(stored?.latestPosition, 1)
  assert.equal(stored?.bestPosition, 1)
  assert.equal(stored?.evidence.length, 2)
})

test("keeps at most one hundred recent candidates", async () => {
  const store = new MemoryStore()
  const signals = Array.from({ length: 101 }, (_, index) =>
    candidate({ identity: `solana:mint-${String(index).padStart(3, "0")}` })
  )
  const result = await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity(signals),
  })

  assert.equal(result.ledger.candidates.length, 100)
})

test("prunes candidates outside the thirty-day retention window", async () => {
  const store = new MemoryStore()
  await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity([
      candidate({
        identity: "solana:old",
        observedAt: "2026-08-01T00:00:00.000Z",
      }),
    ]),
  })
  const result = await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity([
      candidate({
        identity: "solana:new",
        observedAt: "2026-09-17T00:00:00.000Z",
      }),
    ]),
  })

  assert.deepEqual(
    result.ledger.candidates.map(item => item.identityKey),
    ["solana:new"]
  )
})

test("does not write neutral classifications and fails closed", async () => {
  const store = new MemoryStore()
  const neutral = await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity([]),
  })
  assert.equal(neutral.changed, false)
  assert.equal(store.writes, 0)

  store.rejectWrite = true
  await assert.rejects(
    persistMaxAttentionCandidates({
      store,
      opportunity: opportunity([candidate()]),
    }),
    /concurrent write rejected/
  )
  assert.throws(
    () => parseMaxAttentionInboxLedger('{"revision":1}'),
    /invalid MAX attention inbox ledger/
  )
})


test("records explicit human review state changes", async () => {
  const store = new MemoryStore()
  await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity([candidate()]),
  })

  const monitoring = await updateMaxAttentionCandidateState({
    store,
    identityKey: "solana:mint-a",
    state: "MONITORING",
    updatedAt: "2026-09-17T02:00:00.000Z",
  })
  assert.equal(monitoring.ledger.revision, 2)
  assert.equal(monitoring.ledger.candidates[0]?.state, "MONITORING")
  assert.equal(
    monitoring.ledger.candidates[0]?.dismissalReason,
    null
  )

  const dismissed = await updateMaxAttentionCandidateState({
    store,
    identityKey: "solana:mint-a",
    state: "DISMISSED",
    dismissalReason: "Insufficient first-party persistence",
    updatedAt: "2026-09-17T02:05:00.000Z",
  })
  assert.equal(dismissed.ledger.revision, 3)
  assert.equal(dismissed.ledger.candidates[0]?.state, "DISMISSED")
  assert.equal(
    dismissed.ledger.candidates[0]?.dismissalReason,
    "Insufficient first-party persistence"
  )
})

test("keeps review decisions idempotent and rejects invalid transitions", async () => {
  const store = new MemoryStore()
  await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity([candidate()]),
  })
  await assert.rejects(
    updateMaxAttentionCandidateState({
      store,
      identityKey: "solana:mint-a",
      state: "DISMISSED",
      updatedAt: "2026-09-17T02:00:00.000Z",
    }),
    /dismissal reason is inconsistent/
  )
  await assert.rejects(
    updateMaxAttentionCandidateState({
      store,
      identityKey: "solana:missing",
      state: "MONITORING",
      updatedAt: "2026-09-17T02:00:00.000Z",
    }),
    /was not found/
  )

  const first = await updateMaxAttentionCandidateState({
    store,
    identityKey: "solana:mint-a",
    state: "MONITORING",
    updatedAt: "2026-09-17T02:00:00.000Z",
  })
  const retry = await updateMaxAttentionCandidateState({
    store,
    identityKey: "solana:mint-a",
    state: "MONITORING",
    updatedAt: "2026-09-17T02:00:00.000Z",
  })
  assert.equal(first.changed, true)
  assert.equal(retry.changed, false)
  assert.equal(retry.ledger.revision, 2)
})
