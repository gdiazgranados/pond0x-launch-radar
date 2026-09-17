import assert from "node:assert/strict"
import test from "node:test"

import {
  coordinateMaxCommunityResponse,
  parseMaxCommunityResponseLedger,
} from "../../src/private-alpha/max-community-response-repository"
import type {
  MaxTrendingOpportunityClassification,
} from "../../src/private-alpha/max-trending-opportunity-classifier"

function store() {
  let serialized: string | null = null
  return {
    async read() {
      return serialized
    },
    async compareAndSet(expectedRevision: number, next: string) {
      const current = serialized === null
        ? 0
        : parseMaxCommunityResponseLedger(serialized).revision
      if (current !== expectedRevision) return false
      serialized = next
      return true
    },
  }
}

function opportunity(input: {
  observedAt: string
  candidate?: boolean
  movedTo?: number
  removed?: boolean
}): MaxTrendingOpportunityClassification {
  const identityKey = "solana:Mint1111111111111111111111111111111111111"
  const asset = {
    network: "solana",
    contractAddress: identityKey.slice("solana:".length),
    symbol: "TEST",
    name: "Test Token",
    position: input.movedTo ?? 2,
    identityKey,
  }
  return {
    schemaVersion: 1,
    observedAt: input.observedAt,
    status: input.candidate
      ? "EARLY_ATTENTION"
      : input.movedTo !== undefined || input.removed
        ? "CONTEXT_ONLY"
        : "NO_CHANGE",
    candidates: input.candidate
      ? [{
          candidateId: `max-attention:2026-09-17T00:00:00.000Z:${identityKey}`,
          trigger: "NEW",
          stage: "FIRST_SEEN",
          ...asset,
          firstSeenAt: "2026-09-17T00:00:00.000Z",
          lastSeenAt: input.observedAt,
          observationCount: 1,
          priority: "IMMEDIATE_REVIEW",
          successProbability: null,
          investmentRecommendation: null,
          requiresHumanDecision: true,
        }]
      : [],
    context: {
      moved: input.movedTo === undefined
        ? []
        : [{
            type: "MOVED",
            identityKey,
            asset,
            previousPosition: 2,
            currentPosition: input.movedTo,
          }],
      removed: input.removed
        ? [{
            type: "REMOVED",
            identityKey,
            asset,
            previousPosition: 2,
            currentPosition: null,
          }]
        : [],
    },
    fastFollowUp: {
      recommended: input.candidate ?? false,
      afterSeconds: input.candidate ? 10 : null,
    },
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

test("records T0 and the bounded 30, 60 and 120 second checkpoints", async () => {
  const ledgerStore = store()
  const start = "2026-09-17T00:00:00.000Z"

  const initial = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({ observedAt: start, candidate: true }),
  })
  assert.deepEqual(
    initial.ledger.episodes[0]?.checkpoints.map(item => item.targetSeconds),
    [0]
  )

  for (const seconds of [30, 60, 120]) {
    await coordinateMaxCommunityResponse({
      store: ledgerStore,
      opportunity: opportunity({
        observedAt: new Date(Date.parse(start) + seconds * 1_000).toISOString(),
      }),
    })
  }

  const final = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:02:01.000Z",
    }),
  })
  const episode = final.ledger.episodes[0]
  assert.deepEqual(
    episode?.checkpoints.map(item => item.targetSeconds),
    [0, 30, 60, 120]
  )
  assert.equal(episode?.completedAt, "2026-09-17T00:02:00.000Z")
  assert.equal(episode?.successProbability, null)
  assert.equal(episode?.investmentRecommendation, null)
  assert.equal(final.changed, false)
})

test("carries position and removal evidence into due checkpoints", async () => {
  const ledgerStore = store()
  const start = "2026-09-17T00:00:00.000Z"
  await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({ observedAt: start, candidate: true }),
  })
  await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:20.000Z",
      movedTo: 1,
    }),
  })
  const atThirty = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:30.000Z",
    }),
  })
  assert.equal(atThirty.ledger.episodes[0]?.checkpoints[1]?.position, 1)

  await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:45.000Z",
      removed: true,
    }),
  })
  const atSixty = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:01:00.000Z",
    }),
  })
  assert.equal(atSixty.ledger.episodes[0]?.checkpoints[2]?.present, false)
  assert.equal(atSixty.ledger.episodes[0]?.checkpoints[2]?.position, null)
})

test("does not write between checkpoints when state is unchanged", async () => {
  const ledgerStore = store()
  await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:00.000Z",
      candidate: true,
    }),
  })
  const result = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:10.000Z",
    }),
  })
  assert.equal(result.changed, false)
  assert.equal(result.ledger.revision, 1)
})

test("fails closed on stale, corrupt and conflicting evidence", async () => {
  const ledgerStore = store()
  const first = opportunity({
    observedAt: "2026-09-17T00:00:00.000Z",
    candidate: true,
  })
  await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: first,
  })
  await assert.rejects(
    coordinateMaxCommunityResponse({
      store: ledgerStore,
      opportunity: opportunity({
        observedAt: "2026-09-16T23:59:59.000Z",
      }),
    }),
    /stale/
  )

  assert.throws(
    () => parseMaxCommunityResponseLedger("{}"),
    /invalid/
  )
})
