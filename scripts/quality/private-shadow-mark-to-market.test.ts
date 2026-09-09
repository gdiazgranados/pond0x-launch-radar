import test from "node:test"
import assert from "node:assert/strict"
import { createShadowProposal, openShadowPosition } from "../../src/private-alpha/shadow-portfolio"
import type { PrivateShadowPortfolioStore } from "../../src/private-alpha/shadow-portfolio-repository"
import { markShadowPosition } from "../../src/private-alpha/shadow-mark-to-market"
import { buildSizeAwareQuote } from "../../src/private-alpha/size-aware-quote"

class MemoryStore implements PrivateShadowPortfolioStore {
  constructor(public value: string | null) {}
  async read() { return this.value }
  async compareAndSet(expectedRevision: number, serialized: string) {
    const revision = this.value === null
      ? 0
      : Number(JSON.parse(this.value).revision)
    if (revision !== expectedRevision) return false
    this.value = serialized
    return true
  }
}

const entryAt = "2026-09-09T15:39:34.480Z"
const markAt = "2026-09-09T16:00:00.000Z"

function fixture(pairAddress = "wpond-pair") {
  const evidence = {
    observedAt: entryAt,
    baselineObservedAt: "2026-09-08T15:39:34.480Z",
    currentPairAddress: "wpond-pair",
    baselinePairAddress: "wpond-pair",
    marketContinuity: "SAME_PAIR" as const,
    currentLiquidityUsd: 50_000,
    rollingVolumeUsd: 18_000,
    requestedLookbackHours: 24,
    actualLookbackHours: 24,
    sourceFresh: true,
    anomalies: [],
    estimatedPriceImpactPct: 0.5,
  }
  const proposal = createShadowProposal({
    positionId: "wpond-shadow-1",
    tokenId: "wPOND",
    chain: "SOLANA",
    entryReferenceUsd: 0.0000001,
    notionalUsd: 10,
    estimatedEntrySlippagePct: 0.5,
    estimatedFeesUsd: 0.001,
    ruleVersion: "private-wpond-v1",
    operatorNote: null,
    evidence,
  })
  const position = openShadowPosition(proposal, entryAt)
  const store = new MemoryStore(JSON.stringify({
    schemaVersion: 1,
    revision: 2,
    updatedAt: entryAt,
    positions: [position],
  }))
  const snapshot = {
    generatedAt: markAt,
    status: "PARTIAL",
    scoreNeutral: true,
    tokens: [{
      symbol: "wPOND",
      chain: "solana",
      status: "OBSERVED",
      primaryMarket: {
        pairAddress,
        priceUsd: 0.00000011,
        liquidityUsd: 52_000,
        volume: { h24: 19_000 },
      },
    }],
  }
  const trends = {
    generatedAt: markAt,
    status: "LIVE",
    scoreNeutral: true,
    tokens: {
      wpond: {
        symbol: "wPOND",
        chain: "solana",
        status: "OBSERVED",
        windows: {
          "24h": {
            status: "OBSERVED",
            requestedHours: 24,
            baselineAt: "2026-09-08T16:00:00.000Z",
            actualHours: 24,
            baselineQuality: "ALIGNED",
            marketContinuity: {
              state: "SAME_PRIMARY_PAIR",
              currentPairAddress: pairAddress,
              previousPrimaryPairAddress: pairAddress,
              samePairObserved: true,
            },
            anomalies: [] as string[],
          },
        },
      },
    },
  }
  const quote = buildSizeAwareQuote({
    tokenId: "wPOND",
    chain: "SOLANA",
    observedAt: markAt,
    referencePairAddress: pairAddress,
    requestedNotionalUsd: 10,
    referencePriceUsd: 0.00000011,
    buy: {
      routeId: "jupiter:buy",
      inputAmount: 10,
      outputAmount: 90_000_000,
      estimatedFeeUsd: 0.001,
    },
    sell: {
      routeId: "jupiter:sell",
      inputAmount: 90_000_000,
      outputAmount: 9.8,
      estimatedFeeUsd: 0.001,
    },
  })
  return { store, snapshot, trends, quote }
}

test("marks an open position and appends immutable evidence", async () => {
  const { store, snapshot, trends, quote } = fixture()
  const result = await markShadowPosition(store, {
    positionId: "wpond-shadow-1",
    markedAt: markAt,
    snapshot,
    trends,
    sizeAwareQuote: quote,
    windowKey: "24h",
    maxAgeMinutes: 15,
  })

  assert.equal(result.position.status, "OPEN")
  assert.equal(result.position.evidenceRefs.length, 2)
  assert.ok(result.position.maxFavorableExcursionPct > 9.9)
  assert.equal(result.position.maxAdverseExcursionPct, 0)
  assert.ok(result.grossUnrealizedPnlUsd > 0.99)
  assert.equal(result.executionBasisComplete, false)
  assert.ok(
    Math.abs((result.currentRoundTripLossPct ?? 0) - 2) <
      1e-9
  )
  assert.ok(
    result.conservativeExitStressPnlUsd <
      result.grossUnrealizedPnlUsd
  )
  assert.equal(result.state.portfolio.revision, 3)
})

test("refuses to mark against a replacement pool", async () => {
  const { store, snapshot, trends, quote } = fixture("other-pair")

  await assert.rejects(
    markShadowPosition(store, {
      positionId: "wpond-shadow-1",
      markedAt: markAt,
      snapshot,
      trends,
      sizeAwareQuote: quote,
      windowKey: "24h",
      maxAgeMinutes: 15,
    }),
    /ENTRY_MARK_PAIR_MISMATCH/
  )
  assert.equal(JSON.parse(store.value!).revision, 2)
})
