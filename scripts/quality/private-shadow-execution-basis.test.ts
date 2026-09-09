import test from "node:test"
import assert from "node:assert/strict"
import {
  buildShadowExecutionBasis,
  loadShadowExecutionBasis,
  parseShadowExecutionBasisLedger,
  persistShadowExecutionBasis,
  type PrivateShadowExecutionBasisStore,
} from "../../src/private-alpha/shadow-execution-basis"
import {
  createShadowProposal,
  type MarketEvidence,
} from "../../src/private-alpha/shadow-portfolio"
import type { SizeAwareQuoteObservation } from "../../src/private-alpha/size-aware-quote"

const observedAt = "2026-09-09T15:39:34.480Z"

function evidence(): MarketEvidence {
  return {
    observedAt,
    baselineObservedAt: "2026-09-09T14:39:34.480Z",
    currentPairAddress: "raydium-pool",
    baselinePairAddress: "raydium-pool",
    marketContinuity: "SAME_PAIR",
    currentLiquidityUsd: 100_000,
    rollingVolumeUsd: 10_000,
    requestedLookbackHours: 24,
    actualLookbackHours: 24,
    sourceFresh: true,
    anomalies: [],
    estimatedPriceImpactPct: 0,
  }
}

function proposal() {
  return createShadowProposal({
    positionId: "wpond-shadow-1",
    tokenId: "wPOND",
    chain: "SOLANA",
    entryReferenceUsd: 0.0000001014,
    notionalUsd: 10,
    estimatedEntrySlippagePct: 0,
    estimatedFeesUsd: 0.001,
    evidence: evidence(),
    ruleVersion: "private-wpond-v1",
    operatorNote: null,
  })
}

function quote(): SizeAwareQuoteObservation {
  return {
    status: "MEASURED",
    tokenId: "wPOND",
    chain: "SOLANA",
    observedAt,
    referencePairAddress: "raydium-pool",
    requestedNotionalUsd: 10,
    referencePriceUsd: 0.0000001014,
    effectiveEntryPriceUsd: 0.000000102,
    effectiveExitPriceUsd: 0.000000099,
    estimatedEntryPriceImpactPct: 0.59,
    estimatedExitPriceImpactPct: 2.37,
    estimatedRoundTripLossPct: 2.9,
    estimatedEntryFeeUsd: 0.001,
    estimatedExitFeeUsd: 0.001,
    estimatedFeesUsd: 0.002,
    buyRouteId: "jupiter:Raydium CLMM",
    sellRouteId: "jupiter:Raydium CLMM",
    blockingReasons: [],
  }
}

class MemoryStore implements PrivateShadowExecutionBasisStore {
  value: string | null = null

  async read() {
    return this.value
  }

  async compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ) {
    const revision = this.value === null
      ? 0
      : parseShadowExecutionBasisLedger(this.value).revision
    if (revision !== expectedRevision) return false
    this.value = serializedLedger
    return true
  }
}

test("builds execution basis from a complete measured buy quote", () => {
  const basis = buildShadowExecutionBasis(proposal(), quote())

  assert.equal(basis.positionId, "wpond-shadow-1")
  assert.equal(basis.effectiveEntryPriceUsd, 0.000000102)
  assert.equal(basis.simulatedTokenUnits, 10 / 0.000000102)
  assert.equal(basis.buyRouteId, "jupiter:Raydium CLMM")
  assert.equal(basis.source, "EXECUTABLE_BUY_QUOTE")
})

test("persists execution basis idempotently and keeps it immutable", async () => {
  const store = new MemoryStore()
  const basis = buildShadowExecutionBasis(proposal(), quote())
  const first = await persistShadowExecutionBasis(
    store,
    basis,
    observedAt
  )
  const retry = await persistShadowExecutionBasis(
    store,
    basis,
    "2026-09-09T15:40:00Z"
  )

  assert.equal(first.changed, true)
  assert.equal(first.ledger.revision, 1)
  assert.equal(retry.changed, false)
  assert.equal(retry.ledger.revision, 1)
  assert.deepEqual(await loadShadowExecutionBasis(store), first.ledger)

  await assert.rejects(
    persistShadowExecutionBasis(
      store,
      { ...basis, simulatedTokenUnits: basis.simulatedTokenUnits + 1 },
      "2026-09-09T15:41:00Z"
    ),
    /execution basis is immutable/
  )
})

test("fails closed when an executable buy basis is incomplete", () => {
  assert.throws(
    () => buildShadowExecutionBasis(
      proposal(),
      {
        ...quote(),
        status: "UNAVAILABLE",
        effectiveEntryPriceUsd: null,
        buyRouteId: null,
      }
    ),
    /complete measured buy quote is required/
  )
})
