import test from "node:test"
import assert from "node:assert/strict"
import {
  emptyShadowPortfolioLedger,
  loadShadowPortfolio,
  parseShadowPortfolioLedger,
  persistShadowPosition,
  type PrivateShadowPortfolioStore,
} from "../../src/private-alpha/shadow-portfolio-repository"
import {
  createShadowProposal,
  invalidateShadowPosition,
  openShadowPosition,
  type MarketEvidence,
} from "../../src/private-alpha/shadow-portfolio"

const observedAt = "2026-09-07T04:30:00Z"

function evidence(): MarketEvidence {
  return {
    observedAt,
    baselineObservedAt: "2026-09-06T22:30:00Z",
    currentPairAddress: "pair-1",
    baselinePairAddress: "pair-1",
    marketContinuity: "SAME_PAIR",
    currentLiquidityUsd: 1_000,
    rollingVolumeUsd: 250,
    requestedLookbackHours: 6,
    actualLookbackHours: 6,
    sourceFresh: true,
    anomalies: [],
    estimatedPriceImpactPct: 1,
  }
}

function proposal() {
  return createShadowProposal({
    positionId: "paper-shadow-1",
    tokenId: "PAPER",
    chain: "SOLANA",
    entryReferenceUsd: 0.72,
    notionalUsd: 100,
    estimatedEntrySlippagePct: 1,
    estimatedFeesUsd: 0.2,
    evidence: evidence(),
    ruleVersion: "private-v1",
    operatorNote: null,
  })
}

class MemoryStore implements PrivateShadowPortfolioStore {
  value: string | null = null
  rejectNextWrite = false

  async read() {
    return this.value
  }

  async compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ) {
    if (this.rejectNextWrite) {
      this.rejectNextWrite = false
      return false
    }
    const currentRevision =
      this.value === null
        ? 0
        : parseShadowPortfolioLedger(this.value).revision
    if (currentRevision !== expectedRevision) return false
    this.value = serializedLedger
    return true
  }
}

test("persists a new proposal in a private versioned ledger", async () => {
  const store = new MemoryStore()
  const result = await persistShadowPosition(store, proposal(), {
    updatedAt: observedAt,
    expectedRevision: 0,
  })

  assert.equal(result.changed, true)
  assert.equal(result.ledger.revision, 1)
  assert.equal(result.ledger.positions.length, 1)
  assert.equal(result.ledger.positions[0].status, "PROPOSED")
  assert.deepEqual(await loadShadowPortfolio(store), result.ledger)
})

test("an identical retry is idempotent and does not advance revision", async () => {
  const store = new MemoryStore()
  await persistShadowPosition(store, proposal(), {
    updatedAt: observedAt,
  })
  const retry = await persistShadowPosition(store, proposal(), {
    updatedAt: "2026-09-07T04:31:00Z",
  })

  assert.equal(retry.changed, false)
  assert.equal(retry.ledger.revision, 1)
  assert.equal(retry.ledger.updatedAt, observedAt)
})

test("allows an audited proposal-to-open transition", async () => {
  const store = new MemoryStore()
  const proposed = proposal()
  await persistShadowPosition(store, proposed, {
    updatedAt: observedAt,
  })
  const opened = openShadowPosition(
    proposed,
    "2026-09-07T04:31:00Z"
  )
  const result = await persistShadowPosition(store, opened, {
    updatedAt: "2026-09-07T04:31:00Z",
    expectedRevision: 1,
  })

  assert.equal(result.ledger.revision, 2)
  assert.equal(result.ledger.positions[0].status, "OPEN")
})

test("rejects identity mutation and terminal rewrites", async () => {
  const store = new MemoryStore()
  const proposed = proposal()
  await persistShadowPosition(store, proposed, {
    updatedAt: observedAt,
  })

  await assert.rejects(
    persistShadowPosition(
      store,
      { ...proposed, notionalUsd: 200 },
      { updatedAt: "2026-09-07T04:31:00Z" }
    ),
    /notionalUsd is immutable/
  )

  const invalidated = invalidateShadowPosition(
    proposed,
    "evidence expired"
  )
  await persistShadowPosition(store, invalidated, {
    updatedAt: "2026-09-07T04:32:00Z",
  })
  await assert.rejects(
    persistShadowPosition(
      store,
      { ...invalidated, operatorNote: "rewritten" },
      { updatedAt: "2026-09-07T04:33:00Z" }
    ),
    /terminal shadow position is immutable/
  )
})

test("fails closed on corrupt, duplicate or non-proposed stored input", async () => {
  assert.throws(
    () => parseShadowPortfolioLedger("{bad-json"),
    /invalid private shadow portfolio JSON/
  )

  const position = proposal()
  assert.throws(
    () =>
      parseShadowPortfolioLedger(
        JSON.stringify({
          ...emptyShadowPortfolioLedger(),
          positions: [position, position],
        })
      ),
    /duplicate shadow positionId/
  )

  const store = new MemoryStore()
  await assert.rejects(
    persistShadowPosition(
      store,
      openShadowPosition(position, observedAt),
      { updatedAt: observedAt }
    ),
    /new shadow position must be proposed/
  )
})

test("rejects stale revisions and concurrent writes", async () => {
  const store = new MemoryStore()
  await persistShadowPosition(store, proposal(), {
    updatedAt: observedAt,
  })

  await assert.rejects(
    persistShadowPosition(store, proposal(), {
      updatedAt: observedAt,
      expectedRevision: 0,
    }),
    /revision conflict/
  )

  const secondStore = new MemoryStore()
  secondStore.rejectNextWrite = true
  await assert.rejects(
    persistShadowPosition(secondStore, proposal(), {
      updatedAt: observedAt,
    }),
    /concurrent write rejected/
  )
})
