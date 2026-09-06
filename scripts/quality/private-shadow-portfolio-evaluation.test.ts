import test from "node:test"
import assert from "node:assert/strict"
import {
  closeShadowPosition,
  createShadowProposal,
  invalidateShadowPosition,
  openShadowPosition,
  type ShadowChain,
  type ShadowToken,
} from "../../src/private-alpha/shadow-portfolio"
import { evaluateShadowPortfolio } from "../../src/private-alpha/shadow-portfolio-evaluation"

const evidence = {
  observedAt: "2026-09-06T00:00:00Z",
  baselineObservedAt: "2026-09-05T18:00:00Z",
  currentPairAddress: "pair-1",
  baselinePairAddress: "pair-1",
  marketContinuity: "SAME_PAIR" as const,
  currentLiquidityUsd: 100_000,
  rollingVolumeUsd: 25_000,
  requestedLookbackHours: 6,
  actualLookbackHours: 6,
  sourceFresh: true,
  anomalies: [],
  estimatedPriceImpactPct: 1,
}

function proposal(
  positionId: string,
  tokenId: ShadowToken = "PNDC",
  chain: ShadowChain = "ETHEREUM",
  ruleVersion = "private-v1"
) {
  return createShadowProposal({
    positionId,
    tokenId,
    chain,
    entryReferenceUsd: 1,
    notionalUsd: 100,
    estimatedEntrySlippagePct: 1,
    estimatedFeesUsd: 1,
    evidence,
    ruleVersion,
    operatorNote: null,
  })
}

function closed(
  positionId: string,
  exitReferenceUsd: number,
  closedAt: string,
  tokenId: ShadowToken = "PNDC",
  chain: ShadowChain = "ETHEREUM",
  ruleVersion = "private-v1"
) {
  const opened = openShadowPosition(
    proposal(positionId, tokenId, chain, ruleVersion),
    "2026-09-06T00:01:00Z"
  )

  return closeShadowPosition(opened, {
    closedAt,
    exitReferenceUsd,
    estimatedExitSlippagePct: 1,
    additionalFeesUsd: 1,
    evidence: {
      ...evidence,
      observedAt: closedAt,
    },
  })
}

test("returns an explicit empty evaluation without inventing performance", () => {
  const evaluation = evaluateShadowPortfolio([])

  assert.equal(evaluation.totalProposals, 0)
  assert.equal(evaluation.winRatePct, null)
  assert.equal(evaluation.averageRoundTripSlippagePct, null)
  assert.equal(evaluation.netPnlUsd, 0)
  assert.equal(evaluation.noActionBaselinePnlUsd, 0)
})

test("calculates gross and net performance, win rate and drawdown", () => {
  const win = closed(
    "win",
    1.1,
    "2026-09-06T01:00:00Z"
  )
  const loss = closed(
    "loss",
    0.9,
    "2026-09-06T02:00:00Z"
  )
  const evaluation = evaluateShadowPortfolio([win, loss])

  assert.equal(evaluation.totalProposals, 2)
  assert.equal(evaluation.openedSimulations, 2)
  assert.equal(evaluation.closedSimulations, 2)
  assert.equal(evaluation.winRatePct, 50)
  assert.ok(Math.abs(evaluation.grossPnlUsd) < 1e-9)
  assert.ok(Math.abs(evaluation.netPnlUsd - -8) < 1e-9)
  assert.ok(Math.abs(evaluation.maximumDrawdownUsd - 14) < 1e-9)
  assert.equal(evaluation.averageRoundTripSlippagePct, 2)
  assert.ok(Math.abs(evaluation.excessVsNoActionUsd - -8) < 1e-9)
})

test("groups performance by token and private rule version", () => {
  const pndc = closed(
    "pndc",
    1.1,
    "2026-09-06T01:00:00Z"
  )
  const paper = closed(
    "paper",
    0.9,
    "2026-09-06T02:00:00Z",
    "PAPER",
    "SOLANA",
    "private-v2"
  )
  const invalidated = invalidateShadowPosition(
    proposal("invalid"),
    "pool continuity lost"
  )
  const evaluation = evaluateShadowPortfolio([
    pndc,
    paper,
    invalidated,
  ])

  assert.equal(evaluation.byToken.PNDC.positions, 2)
  assert.equal(evaluation.byToken.PNDC.closed, 1)
  assert.equal(evaluation.byToken.PAPER.positions, 1)
  assert.equal(evaluation.byToken.PAPER.closed, 1)
  assert.equal(evaluation.byRuleVersion["private-v1"].positions, 2)
  assert.equal(evaluation.byRuleVersion["private-v2"].positions, 1)
  assert.equal(evaluation.invalidationCount, 1)
  assert.deepEqual(evaluation.invalidationReasons, {
    "pool continuity lost": 1,
  })
})

test("rejects duplicate position identifiers", () => {
  const duplicate = proposal("same")

  assert.throws(
    () => evaluateShadowPortfolio([duplicate, duplicate]),
    /duplicate positionId/
  )
})
