import test from "node:test"
import assert from "node:assert/strict"
import {
  createShadowProposal,
  evidenceBlockingReasons,
  openShadowPosition,
} from "../../src/private-alpha/shadow-portfolio"
import { adaptPublicMarketEvidence } from "../../src/private-alpha/public-market-evidence-adapter"
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
        executableQuotes: {
          status: "NOT_MEASURED_V1",
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

function adapt(
  market = snapshot(),
  marketTrends = trends(),
  now = new Date("2026-09-06T00:35:00Z")
) {
  return adaptPublicMarketEvidence(
    market,
    marketTrends,
    "PAPER",
    "6h",
    { now, maxAgeMinutes: 15 }
  )
}

test("maps factual same-pair observations without inventing a quote", () => {
  const adapted = adapt()

  assert.equal(adapted.tokenId, "PAPER")
  assert.equal(adapted.chain, "SOLANA")
  assert.equal(adapted.currentReferenceUsd, 0.72)
  assert.equal(adapted.evidence.marketContinuity, "SAME_PAIR")
  assert.equal(adapted.evidence.currentLiquidityUsd, 1_000)
  assert.equal(adapted.evidence.rollingVolumeUsd, 250)
  assert.equal(adapted.evidence.actualLookbackHours, 6)
  assert.equal(adapted.evidence.sourceFresh, true)
  assert.equal(adapted.evidence.estimatedPriceImpactPct, null)
  assert.deepEqual(
    adapted.evidence.anomalies.map((item) => item.code),
    ["SIZE_AWARE_QUOTE_NOT_MEASURED"]
  )
})

test("current public artifacts remain blocked until size-aware quotes exist", () => {
  const adapted = adapt()
  const proposal = createShadowProposal({
    positionId: "paper-shadow",
    tokenId: adapted.tokenId,
    chain: adapted.chain,
    entryReferenceUsd: adapted.currentReferenceUsd!,
    notionalUsd: 100,
    estimatedEntrySlippagePct: 0,
    estimatedFeesUsd: 0,
    evidence: adapted.evidence,
    ruleVersion: "private-v1",
    operatorNote: null,
  })

  assert.ok(
    evidenceBlockingReasons(adapted.evidence).includes(
      "PRICE_IMPACT_UNAVAILABLE"
    )
  )
  assert.throws(
    () => openShadowPosition(proposal, generatedAt),
    /proposal evidence is blocked/
  )
})

test("marks stale and replacement-pool evidence explicitly", () => {
  const changed = trends()
  changed.tokens.paper.windows["6h"].marketContinuity = {
    state: "NOT_COMPARABLE",
    currentPairAddress: "pair-2",
    previousPrimaryPairAddress: "pair-1",
    samePairObserved: false,
  }
  changed.tokens.paper.windows["6h"].anomalies = [
    "CURRENT_PAIR_NOT_PRESENT_IN_BASELINE",
  ]

  const adapted = adapt(
    snapshot(),
    changed,
    new Date("2026-09-06T01:30:00Z")
  )
  const reasons = evidenceBlockingReasons(adapted.evidence)

  assert.equal(adapted.evidence.sourceFresh, false)
  assert.equal(adapted.evidence.marketContinuity, "POOL_CHANGED")
  assert.ok(reasons.includes("STALE_SOURCE"))
  assert.ok(reasons.includes("PAIR_NOT_COMPARABLE"))
  assert.ok(reasons.includes("PAIR_ADDRESS_MISMATCH"))
  assert.ok(
    reasons.includes(
      "ANOMALY:TREND:CURRENT_PAIR_NOT_PRESENT_IN_BASELINE"
    )
  )
})

test("pins each supported token to its expected chain and flags bad input", () => {
  const market = snapshot()
  market.tokens[0].chain = "ethereum"

  const adapted = adapt(market)

  assert.equal(adapted.chain, "SOLANA")
  assert.ok(
    adapted.evidence.anomalies.some(
      (item) => item.code === "TOKEN_CHAIN_MISMATCH"
    )
  )
})

test("a fresh same-pair size-aware quote completes executable evidence", () => {
  const quote = buildSizeAwareQuote({
    tokenId: "PAPER",
    chain: "SOLANA",
    observedAt: generatedAt,
    referencePairAddress: "pair-1",
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
      estimatedFeeUsd: 0.2,
    },
  })
  const adapted = adaptPublicMarketEvidence(
    snapshot(),
    trends(),
    "PAPER",
    "6h",
    {
      now: new Date("2026-09-06T00:35:00Z"),
      maxAgeMinutes: 15,
      sizeAwareQuote: quote,
    }
  )

  assert.equal(adapted.evidence.anomalies.length, 0)
  assert.equal(
    adapted.evidence.estimatedPriceImpactPct,
    quote.estimatedEntryPriceImpactPct
  )
  assert.deepEqual(
    evidenceBlockingReasons(adapted.evidence),
    []
  )

  const proposal = createShadowProposal({
    positionId: "executable-paper-shadow",
    tokenId: adapted.tokenId,
    chain: adapted.chain,
    entryReferenceUsd: adapted.currentReferenceUsd!,
    notionalUsd: quote.requestedNotionalUsd,
    estimatedEntrySlippagePct:
      quote.estimatedEntryPriceImpactPct!,
    estimatedFeesUsd: quote.estimatedFeesUsd!,
    evidence: adapted.evidence,
    ruleVersion: "private-v1",
    operatorNote: null,
  })

  assert.equal(
    openShadowPosition(proposal, generatedAt).status,
    "OPEN"
  )
})

