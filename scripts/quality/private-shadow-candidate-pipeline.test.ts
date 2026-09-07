import test from "node:test"
import assert from "node:assert/strict"
import { buildShadowCandidate } from "../../src/private-alpha/shadow-candidate-pipeline"
import { buildSizeAwareQuote } from "../../src/private-alpha/size-aware-quote"

const generatedAt = "2026-09-06T00:30:00Z"

function snapshot() {
  return {
    generatedAt,
    status: "LIVE",
    scoreNeutral: true,
    tokens: [
      {
        symbol: "PAPER",
        chain: "solana",
        status: "OBSERVED",
        primaryMarket: {
          pairAddress: "pair-1",
          priceUsd: 0.72,
          liquidityUsd: 1_000,
          volume: { h24: 250 },
        },
      },
    ],
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
            baselineAt: "2026-09-05T18:30:00Z",
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
      routeId: "buy-route",
      inputAmount: 100,
      outputAmount: 130,
      estimatedFeeUsd: 0.2,
    },
    sell: {
      routeId: "sell-route",
      inputAmount: 130,
      outputAmount: 90,
      estimatedFeeUsd: 0.3,
    },
  })
}

function candidate(
  sizeAwareQuote = quote(),
  now = new Date("2026-09-06T00:35:00Z")
) {
  return buildShadowCandidate({
    snapshot: snapshot(),
    trends: trends(),
    tokenId: "PAPER",
    windowKey: "6h",
    now,
    maxAgeMinutes: 15,
    sizeAwareQuote,
    positionId: "paper-private-shadow-1",
    ruleVersion: "private-v1",
    operatorNote: null,
  })
}

test("creates only a simulation proposal from complete executable evidence", () => {
  const result = candidate()

  assert.equal(result.status, "PROPOSED")
  assert.equal(result.simulationOnly, true)
  assert.deepEqual(result.blockingReasons, [])
  assert.equal(result.proposal.status, "PROPOSED")
  assert.equal(result.proposal.openedAt, null)
  assert.equal(result.proposal.notionalUsd, 100)
})

test("records only the entry fee and leaves the exit fee for closing", () => {
  const result = candidate()

  assert.equal(result.status, "PROPOSED")
  assert.equal(result.proposal.estimatedFeesUsd, 0.2)
})

test("blocks stale evidence without creating a proposal", () => {
  const result = candidate(
    quote(),
    new Date("2026-09-06T01:30:00Z")
  )

  assert.equal(result.status, "BLOCKED")
  assert.equal(result.simulationOnly, true)
  assert.equal(result.proposal, null)
  assert.ok(result.blockingReasons.includes("STALE_SOURCE"))
})

test("blocks a quote from a different pool", () => {
  const result = candidate(quote("pair-2"))

  assert.equal(result.status, "BLOCKED")
  assert.equal(result.proposal, null)
  assert.ok(
    result.blockingReasons.includes("QUOTE_PAIR_MISMATCH")
  )
  assert.ok(
    result.blockingReasons.includes(
      "ANOMALY:SIZE_AWARE_QUOTE_NOT_MEASURED"
    )
  )
})
