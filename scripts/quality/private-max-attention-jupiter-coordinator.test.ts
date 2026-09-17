import assert from "node:assert/strict"
import test from "node:test"

import {
  coordinatePendingMaxAttentionJupiter,
} from "../../src/private-alpha/max-attention-jupiter-coordinator"
import type {
  MaxAttentionJupiterStore,
} from "../../src/private-alpha/max-attention-jupiter-repository"
import {
  persistMaxAttentionCandidates,
  updateMaxAttentionCandidateState,
  type MaxAttentionInboxStore,
} from "../../src/private-alpha/max-attention-inbox-repository"
import {
  persistMaxAttentionOnchainValidations,
  type MaxAttentionOnchainStore,
} from "../../src/private-alpha/max-attention-onchain-repository"
import type {
  MaxTrendingAttentionCandidate,
  MaxTrendingOpportunityClassification,
} from "../../src/private-alpha/max-trending-opportunity-classifier"
import type {
  MaxAttentionJupiterValidation,
} from "../../src/private-alpha/max-attention-jupiter-validator"
import type {
  SolanaMintValidation,
} from "../../src/private-alpha/solana-mint-validator"

const MINTS = [
  "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
  "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk",
  "HcRLc9VDgjLeK154xDawfb1dmVJ98DoSqcwTHGqiDeJR",
  "3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG",
]

class MemoryStore implements MaxAttentionInboxStore,
  MaxAttentionOnchainStore, MaxAttentionJupiterStore {
  serialized: string | null = null
  writes = 0

  async read() {
    return this.serialized
  }

  async compareAndSet(expectedRevision: number, next: string) {
    const revision = this.serialized === null
      ? 0
      : JSON.parse(this.serialized).revision
    if (revision !== expectedRevision) return false
    this.serialized = next
    this.writes += 1
    return true
  }
}

function candidate(mint: string): MaxTrendingAttentionCandidate {
  const observedAt = "2026-09-17T02:00:00.000Z"
  const identityKey = `solana:${mint}`
  return {
    candidateId: `max-attention:${observedAt}:${identityKey}`,
    trigger: "NEW",
    stage: "FIRST_SEEN",
    identityKey,
    network: "solana",
    contractAddress: mint,
    symbol: "TEST",
    name: "Test",
    position: 1,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    observationCount: 1,
    priority: "IMMEDIATE_REVIEW",
    successProbability: null,
    investmentRecommendation: null,
    requiresHumanDecision: true,
  }
}

function opportunity(
  candidates: ReadonlyArray<MaxTrendingAttentionCandidate>
): MaxTrendingOpportunityClassification {
  return {
    schemaVersion: 1,
    observedAt: "2026-09-17T02:00:00.000Z",
    status: "EARLY_ATTENTION",
    candidates,
    context: { moved: [], removed: [] },
    fastFollowUp: { recommended: true, afterSeconds: 10 },
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

function onchain(
  mint: string,
  observedAt = "2026-09-17T02:01:00.000Z"
): SolanaMintValidation {
  return {
    schemaVersion: 1,
    observedAt,
    network: "solana",
    mintAddress: mint,
    status: "VERIFIED_ONCHAIN",
    rpcSlot: 100,
    ownerProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    tokenProgram: "TOKEN",
    executable: false,
    initialized: true,
    decimals: 6,
    supplyRaw: "123456",
    mintAuthority: null,
    freezeAuthority: null,
    accountAge: null,
    accountAgeReason: "UNAVAILABLE_FROM_MINT_ACCOUNT",
    consistency: "MATCHED",
    blockingReasons: [],
    caveats: [],
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "SOLANA_RPC_MINT_VALIDATION",
  }
}

function route(
  mint: string,
  observedAt: string,
  status: MaxAttentionJupiterValidation["status"] = "ROUTE_AVAILABLE"
): MaxAttentionJupiterValidation {
  return {
    schemaVersion: 1,
    observedAt,
    network: "solana",
    mintAddress: mint,
    status,
    diagnosticInputLamports: "10000000",
    quote: status === "ROUTE_AVAILABLE" ? {
      routeId: "jupiter:Meteora",
      venueIds: ["market"],
      inputAmountBaseUnits: "10000000",
      outputAmountBaseUnits: "123456",
      inputAmount: 0.01,
      outputAmount: 0.123456,
      estimatedFeeUsd: 0,
    } : null,
    blockingReasons: status === "UNAVAILABLE"
      ? ["JUPITER_READ_ONLY_QUOTE_UNAVAILABLE"]
      : [],
    caveats: ["QUOTE_IS_DIAGNOSTIC_AND_MAY_EXPIRE"],
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "JUPITER_READ_ONLY_QUOTE",
  }
}

async function seed(
  inboxStore: MemoryStore,
  onchainStore: MemoryStore,
  candidates: ReadonlyArray<MaxTrendingAttentionCandidate>
) {
  await persistMaxAttentionCandidates({
    store: inboxStore,
    opportunity: opportunity(candidates),
  })
  await persistMaxAttentionOnchainValidations({
    store: onchainStore,
    entries: candidates.map(item => ({
      identityKey: item.identityKey,
      candidateId: item.candidateId,
      validatedAt: "2026-09-17T02:01:00.000Z",
      validation: onchain(item.contractAddress),
    })),
  })
}

test("does not call Jupiter without verified matching on-chain evidence", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  const jupiterStore = new MemoryStore()
  await persistMaxAttentionCandidates({
    store: inboxStore,
    opportunity: opportunity([candidate(MINTS[0]!)]),
  })
  let calls = 0
  const result = await coordinatePendingMaxAttentionJupiter({
    inboxStore,
    onchainStore,
    jupiterStore,
    validateRoute: async input => {
      calls += 1
      return route(input.contractAddress, input.now!().toISOString())
    },
  })

  assert.equal(calls, 0)
  assert.equal(result.eligibleCount, 0)
  assert.equal(result.unverifiedOnchainCount, 1)
  assert.equal(jupiterStore.writes, 0)
})

test("validates and persists at most five verified routes", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  const jupiterStore = new MemoryStore()
  const candidates = MINTS.map(candidate)
  await seed(inboxStore, onchainStore, candidates)
  let calls = 0
  const result = await coordinatePendingMaxAttentionJupiter({
    inboxStore,
    onchainStore,
    jupiterStore,
    validateRoute: async input => {
      calls += 1
      return route(input.contractAddress, input.now!().toISOString())
    },
    now: () => new Date("2026-09-17T02:02:00.000Z"),
  })

  assert.equal(result.eligibleCount, 6)
  assert.equal(result.validatedCount, 5)
  assert.equal(result.remainingCount, 1)
  assert.equal(result.persisted, true)
  assert.equal(calls, 5)
})

test("caches a route and retries only unavailable evidence after fifteen minutes", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  const jupiterStore = new MemoryStore()
  await seed(inboxStore, onchainStore, [candidate(MINTS[0]!)])
  let calls = 0
  const validateRoute = async (input: {
    contractAddress: string
    now?: () => Date
  }) => {
    calls += 1
    return route(
      input.contractAddress,
      input.now!().toISOString(),
      calls === 1 ? "UNAVAILABLE" : "ROUTE_AVAILABLE"
    )
  }
  await coordinatePendingMaxAttentionJupiter({
    inboxStore, onchainStore, jupiterStore, validateRoute,
    now: () => new Date("2026-09-17T02:02:00.000Z"),
  })
  const early = await coordinatePendingMaxAttentionJupiter({
    inboxStore, onchainStore, jupiterStore, validateRoute,
    now: () => new Date("2026-09-17T02:10:00.000Z"),
  })
  const retried = await coordinatePendingMaxAttentionJupiter({
    inboxStore, onchainStore, jupiterStore, validateRoute,
    now: () => new Date("2026-09-17T02:17:00.000Z"),
  })

  assert.equal(early.cachedCount, 1)
  assert.equal(retried.results[0]?.status, "ROUTE_AVAILABLE")
  assert.equal(calls, 2)
})

test("excludes a candidate dismissed by human review", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  const jupiterStore = new MemoryStore()
  const item = candidate(MINTS[0]!)
  await seed(inboxStore, onchainStore, [item])
  await updateMaxAttentionCandidateState({
    store: inboxStore,
    identityKey: item.identityKey,
    state: "DISMISSED",
    dismissalReason: "Human review",
    updatedAt: "2026-09-17T02:02:00.000Z",
  })

  const result = await coordinatePendingMaxAttentionJupiter({
    inboxStore,
    onchainStore,
    jupiterStore,
    validateRoute: async input =>
      route(input.contractAddress, input.now!().toISOString()),
  })

  assert.equal(result.dismissedCount, 1)
  assert.equal(result.validatedCount, 0)
  assert.equal(jupiterStore.writes, 0)
})
