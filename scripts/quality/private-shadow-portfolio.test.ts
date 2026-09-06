import test from "node:test"
import assert from "node:assert/strict"
import {
  closeShadowPosition,
  createShadowProposal,
  evidenceBlockingReasons,
  invalidateShadowPosition,
  observeShadowPrice,
  openShadowPosition,
  type MarketEvidence,
} from "../../src/private-alpha/shadow-portfolio"

const evidence: MarketEvidence = {
  observedAt: "2026-09-06T00:00:00Z",
  baselineObservedAt: "2026-09-05T18:00:00Z",
  currentPairAddress: "pair-1",
  baselinePairAddress: "pair-1",
  marketContinuity: "SAME_PAIR",
  currentLiquidityUsd: 100_000,
  rollingVolumeUsd: 25_000,
  requestedLookbackHours: 6,
  actualLookbackHours: 6,
  sourceFresh: true,
  anomalies: [],
  estimatedPriceImpactPct: 0.4,
}

function proposal() {
  return createShadowProposal({
    positionId: "shadow-1",
    tokenId: "PAPER",
    chain: "SOLANA",
    entryReferenceUsd: 0.001,
    notionalUsd: 100,
    estimatedEntrySlippagePct: 0.4,
    estimatedFeesUsd: 0.25,
    evidence,
    ruleVersion: "private-v1",
    operatorNote: null,
  })
}

test("creates a simulation-only long proposal with immutable evidence copy", () => {
  const input = structuredClone(evidence)
  const position = createShadowProposal({
    positionId: "shadow-1",
    tokenId: "PNDC",
    chain: "ETHEREUM",
    entryReferenceUsd: 0.000001,
    notionalUsd: 100,
    estimatedEntrySlippagePct: 0.5,
    estimatedFeesUsd: 1,
    evidence: input,
    ruleVersion: "private-v1",
    operatorNote: "private",
  })

  input.currentPairAddress = "mutated"

  assert.equal(position.status, "PROPOSED")
  assert.equal(position.side, "LONG")
  assert.equal(position.openedAt, null)
  assert.equal(position.realizedPnlUsd, null)
  assert.equal(position.evidenceRefs[0].currentPairAddress, "pair-1")
  assert.equal("transactionSignature" in position, false)
})

test("opens only when market evidence is fresh, comparable and executable", () => {
  const opened = openShadowPosition(proposal(), "2026-09-06T00:01:00Z")

  assert.equal(opened.status, "OPEN")
  assert.equal(opened.openedAt, "2026-09-06T00:01:00Z")
})

test("keeps blocked evidence explicit and refuses to open", () => {
  const blocked = createShadowProposal({
    ...proposal(),
    status: undefined,
    evidence: {
      ...evidence,
      sourceFresh: false,
      marketContinuity: "POOL_CHANGED",
      baselinePairAddress: "old-pair",
      estimatedPriceImpactPct: null,
      anomalies: [{ code: "QUOTE_FAILED", blocking: true }],
    },
  } as Parameters<typeof createShadowProposal>[0])

  assert.deepEqual(evidenceBlockingReasons(blocked.evidenceRefs[0]), [
    "STALE_SOURCE",
    "PAIR_NOT_COMPARABLE",
    "PAIR_ADDRESS_MISMATCH",
    "PRICE_IMPACT_UNAVAILABLE",
    "ANOMALY:QUOTE_FAILED",
  ])
  assert.throws(
    () => openShadowPosition(blocked, "2026-09-06T00:01:00Z"),
    /proposal evidence is blocked/
  )
})

test("invalidates a non-terminal simulation with an auditable reason", () => {
  const invalidated = invalidateShadowPosition(
    proposal(),
    "pool continuity lost"
  )

  assert.equal(invalidated.status, "INVALIDATED")
  assert.equal(invalidated.invalidationReason, "pool continuity lost")
  assert.throws(
    () => invalidateShadowPosition(invalidated, "again"),
    /terminal position/
  )
})

test("rejects unsupported token-chain combinations and real-money-like values", () => {
  assert.throws(
    () =>
      createShadowProposal({
        ...proposal(),
        status: undefined,
        chain: "ETHEREUM",
        evidence,
      } as Parameters<typeof createShadowProposal>[0]),
    /token and chain/
  )
  assert.throws(
    () =>
      createShadowProposal({
        ...proposal(),
        status: undefined,
        notionalUsd: 0,
        evidence,
      } as Parameters<typeof createShadowProposal>[0]),
    /notionalUsd/
  )
})

test("tracks favorable and adverse movement without changing the entry", () => {
  const opened = openShadowPosition(
    proposal(),
    "2026-09-06T00:01:00Z"
  )
  const favorable = observeShadowPrice(opened, 0.0012)
  const adverse = observeShadowPrice(favorable, 0.0008)

  assert.equal(adverse.entryReferenceUsd, 0.001)
  assert.ok(Math.abs(adverse.maxFavorableExcursionPct - 20) < 1e-9)
  assert.ok(Math.abs(adverse.maxAdverseExcursionPct - 20) < 1e-9)
})

test("closes on the same pair and calculates net simulated PnL after costs", () => {
  const opened = openShadowPosition(
    proposal(),
    "2026-09-06T00:01:00Z"
  )
  const closed = closeShadowPosition(opened, {
    closedAt: "2026-09-06T01:00:00Z",
    exitReferenceUsd: 0.0011,
    estimatedExitSlippagePct: 0.6,
    additionalFeesUsd: 0.25,
    evidence: {
      ...evidence,
      observedAt: "2026-09-06T01:00:00Z",
    },
  })

  assert.equal(closed.status, "CLOSED")
  assert.equal(closed.exitReferenceUsd, 0.0011)
  assert.ok(Math.abs(closed.realizedPnlUsd! - 8.5) < 1e-9)
  assert.ok(Math.abs(closed.realizedPnlPct! - 8.5) < 1e-9)
  assert.equal(closed.estimatedFeesUsd, 0.5)
  assert.equal(closed.evidenceRefs.length, 2)
})

test("refuses to close against a replacement pool", () => {
  const opened = openShadowPosition(
    proposal(),
    "2026-09-06T00:01:00Z"
  )

  assert.throws(
    () =>
      closeShadowPosition(opened, {
        closedAt: "2026-09-06T01:00:00Z",
        exitReferenceUsd: 0.0011,
        estimatedExitSlippagePct: 0.6,
        additionalFeesUsd: 0.25,
        evidence: {
          ...evidence,
          observedAt: "2026-09-06T01:00:00Z",
          currentPairAddress: "pair-2",
          baselinePairAddress: "pair-2",
        },
      }),
    /ENTRY_EXIT_PAIR_MISMATCH/
  )
})
