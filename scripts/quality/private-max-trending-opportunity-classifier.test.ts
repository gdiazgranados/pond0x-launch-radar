import test from "node:test"
import assert from "node:assert/strict"
import {
  classifyMaxTrendingOpportunity,
} from "../../src/private-alpha/max-trending-opportunity-classifier"
import type {
  MaxTrendingChange,
  MaxTrendingDetection,
} from "../../src/private-alpha/max-trending-change-detector"
import type {
  MaxTrendingAssetState,
} from "../../src/private-alpha/max-trending-snapshot-repository"
import type {
  MaxTrendingAsset,
} from "../../src/private-alpha/max-trending-client"

const MINT_A = "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq"
const MINT_B = "So11111111111111111111111111111111111111112"
const OBSERVED_AT = "2026-09-16T19:03:51.463Z"

function asset(
  mint: string,
  position: number,
  symbol: string
): MaxTrendingAsset {
  return {
    network: "solana",
    contractAddress: mint,
    symbol,
    name: symbol,
    position,
    identityKey: `solana:${mint}`,
  }
}

function change(
  type: MaxTrendingChange["type"],
  value: MaxTrendingAsset,
  previousPosition: number | null,
  currentPosition: number | null
): MaxTrendingChange {
  return {
    type,
    identityKey: value.identityKey,
    asset: value,
    previousPosition,
    currentPosition,
  }
}

function detection(
  changes: ReadonlyArray<MaxTrendingChange>
): MaxTrendingDetection {
  return {
    schemaVersion: 1,
    observedAt: OBSERVED_AT,
    previousObservedAt: "2026-09-16T18:51:46.483Z",
    status: changes.length > 0 ? "CHANGED" : "UNCHANGED",
    materialChange: changes.length > 0,
    snapshotHash: "a".repeat(64),
    changes,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

function state(
  value: MaxTrendingAsset,
  observationCount: number
): MaxTrendingAssetState {
  return {
    identityKey: value.identityKey,
    firstSeenAt: "2026-09-16T18:51:46.483Z",
    lastSeenAt: OBSERVED_AT,
    observationCount,
    lastPosition: value.position,
    active: true,
  }
}

test("suppresses attention candidates during baseline", () => {
  const value = asset(MINT_A, 1, "BASE")
  const result = classifyMaxTrendingOpportunity({
    detection: detection([change("NEW", value, null, 1)]),
    assetStates: [state(value, 1)],
    baseline: true,
  })

  assert.equal(result.status, "NO_CHANGE")
  assert.deepEqual(result.candidates, [])
  assert.equal(result.fastFollowUp.recommended, false)
})

test("classifies NEW as immediate attention without a financial claim", () => {
  const value = asset(MINT_A, 4, "NEW")
  const result = classifyMaxTrendingOpportunity({
    detection: detection([change("NEW", value, null, 4)]),
    assetStates: [state(value, 1)],
  })

  assert.equal(result.status, "EARLY_ATTENTION")
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0]?.trigger, "NEW")
  assert.equal(result.candidates[0]?.stage, "FIRST_SEEN")
  assert.equal(result.candidates[0]?.priority, "IMMEDIATE_REVIEW")
  assert.equal(result.candidates[0]?.successProbability, null)
  assert.equal(result.candidates[0]?.investmentRecommendation, null)
  assert.equal(result.fastFollowUp.recommended, true)
  assert.equal(result.fastFollowUp.afterSeconds, 10)
})

test("classifies REAPPEARED with its persisted history", () => {
  const value = asset(MINT_A, 2, "BACK")
  const result = classifyMaxTrendingOpportunity({
    detection: detection([change("REAPPEARED", value, null, 2)]),
    assetStates: [state(value, 3)],
  })

  assert.equal(result.status, "EARLY_ATTENTION")
  assert.equal(result.candidates[0]?.stage, "RETURNED")
  assert.equal(result.candidates[0]?.observationCount, 3)
  assert.equal(result.candidates[0]?.requiresHumanDecision, true)
})

test("keeps MOVED and REMOVED as context-only evidence", () => {
  const moved = asset(MINT_A, 2, "MOVE")
  const removed = asset(MINT_B, 3, "OUT")
  const result = classifyMaxTrendingOpportunity({
    detection: detection([
      change("MOVED", moved, 3, 2),
      change("REMOVED", removed, 3, null),
    ]),
    assetStates: [
      state(moved, 2),
      { ...state(removed, 1), active: false },
    ],
  })

  assert.equal(result.status, "CONTEXT_ONLY")
  assert.deepEqual(result.candidates, [])
  assert.equal(result.context.moved.length, 1)
  assert.equal(result.context.removed.length, 1)
  assert.equal(result.fastFollowUp.recommended, false)
  assert.equal(result.fastFollowUp.afterSeconds, null)
})

test("returns NO_CHANGE for neutral evidence", () => {
  const result = classifyMaxTrendingOpportunity({
    detection: detection([]),
    assetStates: [],
  })

  assert.equal(result.status, "NO_CHANGE")
  assert.deepEqual(result.candidates, [])
  assert.deepEqual(result.context, { moved: [], removed: [] })
})

test("fails closed when a candidate lacks active persisted state", () => {
  const value = asset(MINT_A, 1, "BAD")
  assert.throws(
    () => classifyMaxTrendingOpportunity({
      detection: detection([change("NEW", value, null, 1)]),
      assetStates: [],
    }),
    /lacks active persisted state/
  )
})
