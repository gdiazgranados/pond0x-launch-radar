import test from "node:test"
import assert from "node:assert/strict"
import {
  coordinateShadowCandidate,
  loadShadowDecisionAudit,
  loadShadowSimulationState,
  parseShadowDecisionAuditLedger,
  persistShadowSimulationTransition,
  type PrivateShadowDecisionStore,
} from "../../src/private-alpha/shadow-simulation-coordinator"
import { buildShadowCandidate } from "../../src/private-alpha/shadow-candidate-pipeline"
import {
  parseShadowPortfolioLedger,
  type PrivateShadowPortfolioStore,
} from "../../src/private-alpha/shadow-portfolio-repository"
import { openShadowPosition } from "../../src/private-alpha/shadow-portfolio"
import { buildSizeAwareQuote } from "../../src/private-alpha/size-aware-quote"

const generatedAt = "2026-09-07T04:30:00Z"

class MemoryStore
  implements PrivateShadowPortfolioStore, PrivateShadowDecisionStore
{
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
        : Number(JSON.parse(this.value).revision)
    if (currentRevision !== expectedRevision) return false
    this.value = serializedLedger
    return true
  }
}

function snapshot() {
  return {
    generatedAt,
    status: "LIVE",
    scoreNeutral: true,
    tokens: [{
      symbol: "PAPER",
      chain: "solana",
      status: "OBSERVED",
      primaryMarket: {
        pairAddress: "pair-1",
        priceUsd: 0.72,
        liquidityUsd: 1_000,
        volume: { h24: 250 },
      },
    }],
  }
}

function trends() {
  return {
    generatedAt,
    status: "LIVE",
    scoreNeutral: true,
    tokens: {
      paper: {
        symbol: "PAPER",
        chain: "solana",
        status: "OBSERVED",
        windows: {
          "6h": {
            status: "OBSERVED",
            requestedHours: 6,
            baselineAt: "2026-09-06T22:30:00Z",
            actualHours: 6,
            baselineQuality: "ALIGNED",
            marketContinuity: {
              state: "SAME_PRIMARY_PAIR",
              currentPairAddress: "pair-1",
              previousPrimaryPairAddress: "pair-1",
              samePairObserved: true,
            },
            anomalies: [] as string[],
          },
        },
      },
    },
  }
}

function quote(pairAddress = "pair-1") {
  return buildSizeAwareQuote({
    tokenId: "PAPER",
    chain: "SOLANA",
    observedAt: generatedAt,
    referencePairAddress: pairAddress,
    requestedNotionalUsd: 100,
    referencePriceUsd: 0.72,
    buy: {
      routeId: "buy",
      inputAmount: 100,
      outputAmount: 130,
      estimatedFeeUsd: 0.2,
    },
    sell: {
      routeId: "sell",
      inputAmount: 130,
      outputAmount: 90,
      estimatedFeeUsd: 0.3,
    },
  })
}

function candidate(pairAddress = "pair-1") {
  return buildShadowCandidate({
    snapshot: snapshot(),
    trends: trends(),
    tokenId: "PAPER",
    windowKey: "6h",
    now: new Date("2026-09-07T04:35:00Z"),
    maxAgeMinutes: 15,
    sizeAwareQuote: quote(pairAddress),
    positionId: "paper-shadow-1",
    ruleVersion: "private-v1",
    operatorNote: null,
  })
}

function input(value = candidate()) {
  return {
    decisionId: "decision-1",
    evaluatedAt: generatedAt,
    tokenId: "PAPER" as const,
    positionId: "paper-shadow-1",
    ruleVersion: "private-v1",
    candidate: value,
  }
}

test("persists a proposed candidate and derives its evaluation", async () => {
  const portfolio = new MemoryStore()
  const decisions = new MemoryStore()
  const result = await coordinateShadowCandidate(
    portfolio,
    decisions,
    input()
  )

  assert.equal(result.changed, true)
  assert.equal(result.audit.revision, 1)
  assert.equal(result.audit.records[0].status, "PROPOSED")
  assert.equal(result.audit.records[0].portfolioRevision, 1)
  assert.equal(result.state.portfolio.positions.length, 1)
  assert.equal(result.state.evaluation.totalProposals, 1)
})

test("audits blocked candidates without creating positions", async () => {
  const portfolio = new MemoryStore()
  const decisions = new MemoryStore()
  const result = await coordinateShadowCandidate(
    portfolio,
    decisions,
    input(candidate("pair-2"))
  )

  assert.equal(result.audit.records[0].status, "BLOCKED")
  assert.ok(result.audit.records[0].blockingReasons.length > 0)
  assert.equal(result.audit.records[0].portfolioRevision, null)
  assert.equal(result.state.portfolio.positions.length, 0)
})

test("makes an identical decision retry idempotent", async () => {
  const portfolio = new MemoryStore()
  const decisions = new MemoryStore()
  await coordinateShadowCandidate(portfolio, decisions, input())
  const retry = await coordinateShadowCandidate(
    portfolio,
    decisions,
    input()
  )

  assert.equal(retry.changed, false)
  assert.equal(retry.audit.revision, 1)
  assert.equal(retry.state.portfolio.revision, 1)
})

test("rejects decision identifier reuse with another result", async () => {
  const portfolio = new MemoryStore()
  const decisions = new MemoryStore()
  await coordinateShadowCandidate(portfolio, decisions, input())

  await assert.rejects(
    coordinateShadowCandidate(
      portfolio,
      decisions,
      input(candidate("pair-2"))
    ),
    /decisionId already has another result/
  )
})

test("persists lifecycle transitions and refreshes evaluation", async () => {
  const portfolio = new MemoryStore()
  const decisions = new MemoryStore()
  const coordinated = await coordinateShadowCandidate(
    portfolio,
    decisions,
    input()
  )
  const opened = openShadowPosition(
    coordinated.state.portfolio.positions[0],
    "2026-09-07T04:31:00Z"
  )
  const state = await persistShadowSimulationTransition(
    portfolio,
    opened,
    {
      updatedAt: "2026-09-07T04:31:00Z",
      expectedRevision: 1,
    }
  )

  assert.equal(state.portfolio.revision, 2)
  assert.equal(state.portfolio.positions[0].status, "OPEN")
  assert.equal(state.evaluation.openedSimulations, 1)
})

test("fails closed on malformed audit and concurrent writes", async () => {
  assert.throws(
    () => parseShadowDecisionAuditLedger("{bad"),
    /invalid private shadow decision JSON/
  )

  const portfolio = new MemoryStore()
  const decisions = new MemoryStore()
  decisions.rejectNextWrite = true
  await assert.rejects(
    coordinateShadowCandidate(portfolio, decisions, input()),
    /shadow decision concurrent write rejected/
  )

  assert.equal(
    (await loadShadowSimulationState(portfolio)).portfolio.positions
      .length,
    1
  )
  assert.equal(
    (await loadShadowDecisionAudit(decisions)).records.length,
    0
  )
  assert.equal(
    parseShadowPortfolioLedger(portfolio.value!).revision,
    1
  )
})
