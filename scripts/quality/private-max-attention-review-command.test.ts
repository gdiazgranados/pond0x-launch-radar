import assert from "node:assert/strict"
import test from "node:test"

import {
  parseMaxAttentionReviewCommand,
  runMaxAttentionReviewCommand,
} from "../../src/private-alpha/max-attention-review-command"
import {
  persistMaxAttentionCandidates,
  type MaxAttentionInboxStore,
} from "../../src/private-alpha/max-attention-inbox-repository"
import type {
  MaxTrendingOpportunityClassification,
} from "../../src/private-alpha/max-trending-opportunity-classifier"

const IDENTITY =
  "solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx"

class MemoryStore implements MaxAttentionInboxStore {
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

function opportunity(): MaxTrendingOpportunityClassification {
  const observedAt = "2026-09-17T01:32:00.000Z"
  return {
    schemaVersion: 1,
    observedAt,
    status: "EARLY_ATTENTION",
    candidates: [{
      candidateId: `max-attention:${observedAt}:${IDENTITY}`,
      trigger: "NEW",
      stage: "FIRST_SEEN",
      identityKey: IDENTITY,
      network: "solana",
      contractAddress: IDENTITY.slice("solana:".length),
      symbol: "TEST",
      name: "Test",
      position: 2,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      observationCount: 1,
      priority: "IMMEDIATE_REVIEW",
      successProbability: null,
      investmentRecommendation: null,
      requiresHumanDecision: true,
    }],
    context: { moved: [], removed: [] },
    fastFollowUp: { recommended: true, afterSeconds: 10 },
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

test("parses list as the safe default", () => {
  assert.deepEqual(parseMaxAttentionReviewCommand([]), {
    action: "LIST",
  })
  assert.deepEqual(parseMaxAttentionReviewCommand(["list"]), {
    action: "LIST",
  })
})

test("parses exact monitoring and dismissal commands", () => {
  assert.deepEqual(parseMaxAttentionReviewCommand([
    "set",
    "--identity",
    IDENTITY,
    "--state",
    "MONITORING",
  ]), {
    action: "SET_STATE",
    identityKey: IDENTITY,
    state: "MONITORING",
    dismissalReason: null,
  })
  assert.deepEqual(parseMaxAttentionReviewCommand([
    "set",
    "--identity",
    IDENTITY,
    "--state",
    "DISMISSED",
    "--reason",
    "Insufficient persistence",
  ]), {
    action: "SET_STATE",
    identityKey: IDENTITY,
    state: "DISMISSED",
    dismissalReason: "Insufficient persistence",
  })
})

test("rejects symbols, unknown options and inconsistent reasons", () => {
  assert.throws(
    () => parseMaxAttentionReviewCommand([
      "set",
      "--identity",
      "TEST",
      "--state",
      "MONITORING",
    ]),
    /exact network:contract identity/
  )
  assert.throws(
    () => parseMaxAttentionReviewCommand([
      "set",
      "--identity",
      IDENTITY,
      "--state",
      "MONITORING",
      "--buy",
      "10",
    ]),
    /unknown MAX attention option/
  )
  assert.throws(
    () => parseMaxAttentionReviewCommand([
      "set",
      "--identity",
      IDENTITY,
      "--state",
      "DISMISSED",
    ]),
    /dismissal reason is inconsistent/
  )
  assert.throws(
    () => parseMaxAttentionReviewCommand([
      "set",
      "--identity",
      IDENTITY,
      "--state",
      "MONITORING",
      "--reason",
      "not allowed",
    ]),
    /dismissal reason is inconsistent/
  )
})

test("lists an absent inbox without creating a file", async () => {
  const store = new MemoryStore()
  const result = await runMaxAttentionReviewCommand({
    store,
    command: { action: "LIST" },
  })

  assert.equal(result.changed, false)
  assert.equal(result.ledgerRevision, 0)
  assert.equal(result.totalCandidates, 0)
  assert.deepEqual(result.candidates, [])
  assert.equal(store.writes, 0)
})

test("updates only an exact candidate and remains watch-only", async () => {
  const store = new MemoryStore()
  await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity(),
  })
  const result = await runMaxAttentionReviewCommand({
    store,
    command: {
      action: "SET_STATE",
      identityKey: IDENTITY,
      state: "MONITORING",
      dismissalReason: null,
    },
    now: () => new Date("2026-09-17T02:00:00.000Z"),
  })

  assert.equal(result.changed, true)
  assert.equal(result.ledgerRevision, 2)
  assert.equal(result.monitoringCount, 1)
  assert.equal(result.candidates[0]?.identityKey, IDENTITY)
  assert.equal(result.candidates[0]?.state, "MONITORING")
  assert.equal(
    result.candidates[0]?.financialAssessment,
    "NOT_PERFORMED"
  )
  assert.equal(result.candidates[0]?.successProbability, null)
  assert.equal(result.candidates[0]?.investmentRecommendation, null)
  assert.equal(result.watchOnly, true)
  assert.equal(result.approvalGranted, false)
  assert.equal(result.transactionRequested, false)
})
