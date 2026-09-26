import assert from "node:assert/strict"
import test from "node:test"

import {
  coordinateMaxCommunityResponse,
  parseMaxCommunityResponseLedger,
} from "../../src/private-alpha/max-community-response-repository"
import type {
  MaxTrendingOpportunityClassification,
} from "../../src/private-alpha/max-trending-opportunity-classifier"
import type {
  MaxTrendingAsset,
} from "../../src/private-alpha/max-trending-client"

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

function trendingAsset(input?: {
  position?: number
  price?: number | null
  change24h?: number | null
  liquidity?: number | null
  marketCap?: number | null
  volume24h?: number | null
}): MaxTrendingAsset {
  const identityKey = "solana:Mint1111111111111111111111111111111111111"

  return {
    network: "solana",
    contractAddress: identityKey.slice("solana:".length),
    symbol: "TEST",
    name: "Test Token",
    position: input?.position ?? 2,
    price: input?.price ?? 1,
    change24h: input?.change24h ?? 5,
    liquidity: input?.liquidity ?? 1_000_000,
    marketCap: input?.marketCap ?? 10_000_000,
    volume24h: input?.volume24h ?? 2_000_000,
    identityKey,
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
    currentTrending: [
      trendingAsset({
        position: 2,
        price: 1,
        change24h: 5,
        liquidity: 1_000_000,
        marketCap: 10_000_000,
        volume24h: 2_000_000,
      }),
    ],
  })

  const initialCheckpoint = initial.ledger.episodes[0]?.checkpoints[0]
  assert.equal(initialCheckpoint?.targetSeconds, 0)
  assert.equal(initialCheckpoint?.position, 2)
  assert.equal(initialCheckpoint?.price, 1)
  assert.equal(initialCheckpoint?.change24h, 5)
  assert.equal(initialCheckpoint?.liquidity, 1_000_000)
  assert.equal(initialCheckpoint?.marketCap, 10_000_000)
  assert.equal(initialCheckpoint?.volume24h, 2_000_000)

  const observations = [
    {
      seconds: 30,
      price: 1.1,
      change24h: 6,
      liquidity: 1_100_000,
      marketCap: 11_000_000,
      volume24h: 2_100_000,
    },
    {
      seconds: 60,
      price: 1.2,
      change24h: 7,
      liquidity: 1_200_000,
      marketCap: 12_000_000,
      volume24h: 2_200_000,
    },
    {
      seconds: 120,
      price: 1.3,
      change24h: 8,
      liquidity: 1_300_000,
      marketCap: 13_000_000,
      volume24h: 2_300_000,
    },
  ]

  for (const observation of observations) {
    await coordinateMaxCommunityResponse({
      store: ledgerStore,
      opportunity: opportunity({
        observedAt: new Date(
          Date.parse(start) + observation.seconds * 1_000
        ).toISOString(),
      }),
      currentTrending: [
        trendingAsset({
          position: 2,
          price: observation.price,
          change24h: observation.change24h,
          liquidity: observation.liquidity,
          marketCap: observation.marketCap,
          volume24h: observation.volume24h,
        }),
      ],
    })
  }

  const final = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:02:01.000Z",
    }),
    currentTrending: [
      trendingAsset({
        position: 2,
        price: 1.3,
        change24h: 8,
        liquidity: 1_300_000,
        marketCap: 13_000_000,
        volume24h: 2_300_000,
      }),
    ],
  })

  const episode = final.ledger.episodes[0]

  assert.deepEqual(
    episode?.checkpoints.map(item => item.targetSeconds),
    [0, 30, 60, 120]
  )
  assert.deepEqual(
    episode?.checkpoints.map(item => item.price),
    [1, 1.1, 1.2, 1.3]
  )
  assert.deepEqual(
    episode?.checkpoints.map(item => item.change24h),
    [5, 6, 7, 8]
  )
  assert.deepEqual(
    episode?.checkpoints.map(item => item.liquidity),
    [1_000_000, 1_100_000, 1_200_000, 1_300_000]
  )
  assert.deepEqual(
    episode?.checkpoints.map(item => item.marketCap),
    [10_000_000, 11_000_000, 12_000_000, 13_000_000]
  )
  assert.deepEqual(
    episode?.checkpoints.map(item => item.volume24h),
    [2_000_000, 2_100_000, 2_200_000, 2_300_000]
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
    currentTrending: [trendingAsset()],
  })
  await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:20.000Z",
      movedTo: 1,
    }),
    currentTrending: [trendingAsset()],
  })
  const atThirty = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:30.000Z",
    }),
    currentTrending: [trendingAsset()],
  })
  assert.equal(atThirty.ledger.episodes[0]?.checkpoints[1]?.position, 1)

  await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:45.000Z",
      removed: true,
    }),
    currentTrending: [trendingAsset()],
  })
  const atSixty = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:01:00.000Z",
    }),
    currentTrending: [trendingAsset()],
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
    currentTrending: [trendingAsset()],
  })
  const result = await coordinateMaxCommunityResponse({
    store: ledgerStore,
    opportunity: opportunity({
      observedAt: "2026-09-17T00:00:10.000Z",
    }),
    currentTrending: [trendingAsset()],
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
    currentTrending: [trendingAsset()],
  })
  await assert.rejects(
    coordinateMaxCommunityResponse({
      store: ledgerStore,
      opportunity: opportunity({
        observedAt: "2026-09-16T23:59:59.000Z",
      }),
    currentTrending: [trendingAsset()],
    }),
    /stale/
  )

  assert.throws(
    () => parseMaxCommunityResponseLedger("{}"),
    /invalid/
  )
})

