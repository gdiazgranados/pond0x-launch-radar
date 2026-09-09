import test from "node:test"
import assert from "node:assert/strict"
import type { PrivateShadowPortfolioStore } from "../../src/private-alpha/shadow-portfolio-repository"
import type { PrivateShadowDecisionStore } from "../../src/private-alpha/shadow-simulation-coordinator"
import { createShadowProposal } from "../../src/private-alpha/shadow-portfolio"
import { openAuditedShadowProposal } from "../../src/private-alpha/shadow-position-lifecycle"

class MemoryStore
  implements PrivateShadowPortfolioStore, PrivateShadowDecisionStore
{
  constructor(public value: string | null) {}

  async read() {
    return this.value
  }

  async compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ) {
    const revision = this.value === null
      ? 0
      : Number(JSON.parse(this.value).revision)
    if (revision !== expectedRevision) return false
    this.value = serializedLedger
    return true
  }
}

const evaluatedAt = "2026-09-09T15:39:34.480Z"

function stores(includeAudit = true) {
  const proposal = createShadowProposal({
    positionId: "wpond-shadow-1",
    tokenId: "wPOND",
    chain: "SOLANA",
    entryReferenceUsd: 0.000000109,
    notionalUsd: 10,
    estimatedEntrySlippagePct: 0.5,
    estimatedFeesUsd: 0.001,
    ruleVersion: "private-wpond-v1",
    operatorNote: "simulation only",
    evidence: {
      observedAt: "2026-09-09T15:33:23.514Z",
      baselineObservedAt: "2026-09-08T15:33:23.514Z",
      currentPairAddress: "wpond-pair",
      baselinePairAddress: "wpond-pair",
      marketContinuity: "SAME_PAIR",
      currentLiquidityUsd: 52_729.9,
      rollingVolumeUsd: 18_010.54,
      requestedLookbackHours: 24,
      actualLookbackHours: 24,
      sourceFresh: true,
      anomalies: [],
      estimatedPriceImpactPct: 0.5,
    },
  })
  const portfolio = new MemoryStore(JSON.stringify({
    schemaVersion: 1,
    revision: 1,
    updatedAt: evaluatedAt,
    positions: [proposal],
  }))
  const decisions = new MemoryStore(JSON.stringify({
    schemaVersion: 1,
    revision: includeAudit ? 1 : 0,
    updatedAt: includeAudit ? evaluatedAt : null,
    records: includeAudit ? [{
      decisionId: "decision-1",
      evaluatedAt,
      tokenId: "wPOND",
      positionId: proposal.positionId,
      ruleVersion: proposal.ruleVersion,
      status: "PROPOSED",
      blockingReasons: [],
      portfolioRevision: 1,
    }] : [],
  }))
  return { portfolio, decisions }
}

test("opens a proposal at its audited decision timestamp", async () => {
  const { portfolio, decisions } = stores()
  const result = await openAuditedShadowProposal(
    portfolio,
    decisions,
    {
      positionId: "wpond-shadow-1",
      confirmedAt: "2026-09-09T16:00:00Z",
    }
  )

  assert.equal(result.simulationOnly, true)
  assert.equal(result.position.status, "OPEN")
  assert.equal(result.position.openedAt, evaluatedAt)
  assert.equal(result.confirmedAt, "2026-09-09T16:00:00Z")
  assert.equal(result.state.portfolio.revision, 2)
  assert.equal(result.state.evaluation.openedSimulations, 1)
})

test("refuses to open a proposal without its audit record", async () => {
  const { portfolio, decisions } = stores(false)

  await assert.rejects(
    openAuditedShadowProposal(portfolio, decisions, {
      positionId: "wpond-shadow-1",
      confirmedAt: "2026-09-09T16:00:00Z",
    }),
    /audited proposal decision not found/
  )
  assert.equal(
    JSON.parse(portfolio.value!).positions[0].status,
    "PROPOSED"
  )
})
