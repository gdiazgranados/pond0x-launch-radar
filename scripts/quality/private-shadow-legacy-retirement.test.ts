import assert from "node:assert/strict"
import test from "node:test"
import {
  LEGACY_EXECUTION_BASIS_UNAVAILABLE,
  retireLegacyShadowPosition,
} from "../../src/private-alpha/shadow-legacy-retirement"
import type { ShadowPosition } from "../../src/private-alpha/shadow-portfolio"

class MemoryStore {
  constructor(private value: string | null) {}

  async read() {
    return this.value
  }

  async compareAndSet(expectedRevision: number, serialized: string) {
    const current = this.value === null
      ? 0
      : Number(JSON.parse(this.value).revision)
    if (current !== expectedRevision) return false
    this.value = serialized
    return true
  }
}

function openPosition(): ShadowPosition {
  return {
    positionId: "legacy-wpond-1",
    tokenId: "wPOND",
    chain: "SOLANA",
    side: "LONG",
    status: "OPEN",
    openedAt: "2026-09-09T15:39:34.480Z",
    closedAt: null,
    entryReferenceUsd: 0.0000001014,
    exitReferenceUsd: null,
    notionalUsd: 10,
    estimatedEntrySlippagePct: 0,
    estimatedExitSlippagePct: null,
    estimatedFeesUsd: 0.001,
    realizedPnlUsd: null,
    realizedPnlPct: null,
    maxAdverseExcursionPct: 0.8,
    maxFavorableExcursionPct: 0,
    evidenceRefs: [{
      observedAt: "2026-09-09T15:39:34.480Z",
      baselineObservedAt: "2026-09-09T14:39:34.480Z",
      currentPairAddress: "pool-1",
      baselinePairAddress: "pool-1",
      marketContinuity: "SAME_PAIR",
      currentLiquidityUsd: 1000,
      rollingVolumeUsd: 100,
      requestedLookbackHours: 1,
      actualLookbackHours: 1,
      sourceFresh: true,
      anomalies: [],
      estimatedPriceImpactPct: 0,
    }],
    ruleVersion: "private-wpond-v1",
    invalidationReason: null,
    operatorNote: null,
  }
}

function portfolio(position = openPosition()) {
  return new MemoryStore(JSON.stringify({
    schemaVersion: 1,
    revision: 3,
    updatedAt: "2026-09-09T16:42:41.458Z",
    positions: [position],
  }))
}

function basis(records: unknown[] = []) {
  return new MemoryStore(JSON.stringify({
    schemaVersion: 1,
    revision: records.length,
    updatedAt: records.length ? "2026-09-09T15:39:34.480Z" : null,
    records,
  }))
}

test("retires an open legacy position without inventing exit results", async () => {
  const store = portfolio()
  const result = await retireLegacyShadowPosition(store, basis(), {
    positionId: "legacy-wpond-1",
    retiredAt: "2026-09-10T03:30:00Z",
  })

  assert.equal(result.changed, true)
  assert.equal(result.position.status, "INVALIDATED")
  assert.equal(
    result.position.invalidationReason,
    LEGACY_EXECUTION_BASIS_UNAVAILABLE
  )
  assert.equal(result.position.exitReferenceUsd, null)
  assert.equal(result.position.realizedPnlUsd, null)
  assert.equal(result.position.realizedPnlPct, null)
  assert.equal(result.position.evidenceRefs.length, 1)
  assert.equal(result.state.portfolio.revision, 4)

  const retry = await retireLegacyShadowPosition(store, basis(), {
    positionId: "legacy-wpond-1",
    retiredAt: "2026-09-10T03:31:00Z",
  })
  assert.equal(retry.changed, false)
  assert.equal(retry.state.portfolio.revision, 4)
})

test("rejects a modern position that has an execution basis", async () => {
  const modernBasis = {
    positionId: "legacy-wpond-1",
    tokenId: "wPOND",
    chain: "SOLANA",
    observedAt: "2026-09-09T15:39:34.480Z",
    referencePairAddress: "pool-1",
    requestedNotionalUsd: 10,
    simulatedTokenUnits: 90_000_000,
    simulatedTokenAmountBaseUnits: "90000000000",
    tokenDecimals: 3,
    effectiveEntryPriceUsd: 0.0000001014,
    estimatedEntryFeeUsd: 0.001,
    buyRouteId: "jupiter:Raydium CLMM",
    source: "EXECUTABLE_BUY_QUOTE",
  }

  await assert.rejects(
    retireLegacyShadowPosition(portfolio(), basis([modernBasis]), {
      positionId: "legacy-wpond-1",
      retiredAt: "2026-09-10T03:30:00Z",
    }),
    /modern shadow position cannot be retired as legacy/
  )
})

test("rejects non-open and differently invalidated positions", async () => {
  const proposed = { ...openPosition(), status: "PROPOSED" as const, openedAt: null }
  await assert.rejects(
    retireLegacyShadowPosition(portfolio(proposed), basis(), {
      positionId: "legacy-wpond-1",
      retiredAt: "2026-09-10T03:30:00Z",
    }),
    /only an open legacy position can be retired/
  )

  const invalidated = {
    ...openPosition(),
    status: "INVALIDATED" as const,
    invalidationReason: "OTHER_REASON",
  }
  await assert.rejects(
    retireLegacyShadowPosition(portfolio(invalidated), basis(), {
      positionId: "legacy-wpond-1",
      retiredAt: "2026-09-10T03:30:00Z",
    }),
    /only an open legacy position can be retired/
  )
})
