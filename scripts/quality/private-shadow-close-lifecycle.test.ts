import test from "node:test"
import assert from "node:assert/strict"
import { closeBasisAwareShadowPosition } from "../../src/private-alpha/shadow-close-lifecycle"
import {
  createShadowProposal,
  openShadowPosition,
} from "../../src/private-alpha/shadow-portfolio"
import type { PrivateShadowPortfolioStore } from "../../src/private-alpha/shadow-portfolio-repository"
import type { PrivateShadowExecutionBasisStore } from "../../src/private-alpha/shadow-execution-basis"
import { buildSizeAwareQuote } from "../../src/private-alpha/size-aware-quote"

class MemoryStore implements
  PrivateShadowPortfolioStore,
  PrivateShadowExecutionBasisStore {
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
const closeAt = "2026-09-09T16:00:00.000Z"

function fixture(options?: {
  includeBasis?: boolean
  pairAddress?: string
}) {
  const pairAddress = options?.pairAddress ?? "wpond-pair"
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
  const proposed = createShadowProposal({
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
  const position = openShadowPosition(proposed, entryAt)
  const portfolioStore = new MemoryStore(JSON.stringify({
    schemaVersion: 1,
    revision: 2,
    updatedAt: entryAt,
    positions: [position],
  }))
  const basisStore = new MemoryStore(
    options?.includeBasis === false
      ? null
      : JSON.stringify({
          schemaVersion: 1,
          revision: 1,
          updatedAt: entryAt,
          records: [{
            positionId: "wpond-shadow-1",
            tokenId: "wPOND",
            chain: "SOLANA",
            observedAt: entryAt,
            referencePairAddress: "wpond-pair",
            requestedNotionalUsd: 10,
            simulatedTokenUnits: 90_000_000,
            effectiveEntryPriceUsd: 10 / 90_000_000,
            estimatedEntryFeeUsd: 0.001,
            buyRouteId: "jupiter:Raydium CLMM",
            source: "EXECUTABLE_BUY_QUOTE",
          }],
        })
  )
  const snapshot = {
    generatedAt: closeAt,
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
    generatedAt: closeAt,
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
    observedAt: closeAt,
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
  return { portfolioStore, basisStore, snapshot, trends, quote }
}

test("closes an open position using its immutable execution basis", async () => {
  const value = fixture()
  const result = await closeBasisAwareShadowPosition(
    value.portfolioStore,
    value.basisStore,
    {
      positionId: "wpond-shadow-1",
      closedAt: closeAt,
      snapshot: value.snapshot,
      trends: value.trends,
      sizeAwareQuote: value.quote,
      windowKey: "24h",
      maxAgeMinutes: 15,
    }
  )

  assert.equal(result.status, "CLOSED")
  if (result.status !== "CLOSED") return
  assert.equal(result.position.status, "CLOSED")
  assert.ok(Math.abs(result.grossExitProceedsUsd - 9.8) < 1e-9)
  assert.ok(Math.abs(result.realizedPnlUsd - -0.202) < 1e-9)
  assert.equal(result.position.evidenceRefs.length, 2)
  assert.equal(result.state.portfolio.revision, 3)
})

test("keeps a legacy position open when execution basis is unavailable", async () => {
  const value = fixture({ includeBasis: false })
  const result = await closeBasisAwareShadowPosition(
    value.portfolioStore,
    value.basisStore,
    {
      positionId: "wpond-shadow-1",
      closedAt: closeAt,
      snapshot: value.snapshot,
      trends: value.trends,
      sizeAwareQuote: value.quote,
      windowKey: "24h",
      maxAgeMinutes: 15,
    }
  )

  assert.equal(result.status, "BLOCKED")
  assert.deepEqual(
    result.blockingReasons,
    ["LEGACY_EXECUTION_BASIS_UNAVAILABLE"]
  )
  assert.equal(JSON.parse(value.portfolioStore.value!).revision, 2)
})

test("refuses to close against a replacement pool", async () => {
  const value = fixture({ pairAddress: "other-pair" })
  const result = await closeBasisAwareShadowPosition(
    value.portfolioStore,
    value.basisStore,
    {
      positionId: "wpond-shadow-1",
      closedAt: closeAt,
      snapshot: value.snapshot,
      trends: value.trends,
      sizeAwareQuote: value.quote,
      windowKey: "24h",
      maxAgeMinutes: 15,
    }
  )

  assert.equal(result.status, "BLOCKED")
  assert.ok(\n    Array.from<string>(result.blockingReasons).includes(\n      "ENTRY_EXIT_PAIR_MISMATCH"\n    )\n  )
  assert.equal(JSON.parse(value.portfolioStore.value!).revision, 2)
})
