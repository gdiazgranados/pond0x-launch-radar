import assert from "node:assert/strict"
import test from "node:test"

import {
  coordinatePendingMaxAttentionOnchain,
} from "../../src/private-alpha/max-attention-onchain-coordinator"
import {
  persistMaxAttentionCandidates,
  updateMaxAttentionCandidateState,
  type MaxAttentionInboxStore,
} from "../../src/private-alpha/max-attention-inbox-repository"
import type {
  MaxAttentionOnchainStore,
} from "../../src/private-alpha/max-attention-onchain-repository"
import type {
  MaxTrendingAttentionCandidate,
  MaxTrendingOpportunityClassification,
} from "../../src/private-alpha/max-trending-opportunity-classifier"
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

class MemoryStore implements MaxAttentionInboxStore, MaxAttentionOnchainStore {
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

function candidate(
  mint: string,
  observedAt = "2026-09-17T02:00:00.000Z",
  network = "solana"
): MaxTrendingAttentionCandidate {
  const identityKey = `${network}:${mint}`
  return {
    candidateId: `max-attention:${observedAt}:${identityKey}`,
    trigger: "NEW",
    stage: "FIRST_SEEN",
    identityKey,
    network,
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
  const observedAt = candidates[0]?.lastSeenAt ??
    "2026-09-17T02:00:00.000Z"
  return {
    schemaVersion: 1,
    observedAt,
    status: candidates.length > 0 ? "EARLY_ATTENTION" : "NO_CHANGE",
    candidates,
    context: { moved: [], removed: [] },
    fastFollowUp: {
      recommended: candidates.length > 0,
      afterSeconds: candidates.length > 0 ? 30 : null,
    },
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

function validation(
  contractAddress: string,
  observedAt: string,
  status: SolanaMintValidation["status"] = "VERIFIED_ONCHAIN"
): SolanaMintValidation {
  return {
    schemaVersion: 1,
    observedAt,
    network: "solana",
    mintAddress: contractAddress,
    status,
    rpcSlot: status === "UNAVAILABLE" ? null : 100,
    ownerProgram: status === "UNAVAILABLE"
      ? null
      : "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    tokenProgram: status === "UNAVAILABLE" ? null : "TOKEN",
    executable: status === "UNAVAILABLE" ? null : false,
    initialized: status === "UNAVAILABLE" ? null : true,
    decimals: status === "UNAVAILABLE" ? null : 6,
    supplyRaw: status === "UNAVAILABLE" ? null : "123456",
    mintAuthority: null,
    freezeAuthority: null,
    accountAge: null,
    accountAgeReason: "UNAVAILABLE_FROM_MINT_ACCOUNT",
    consistency: status === "VERIFIED_ONCHAIN"
      ? "MATCHED"
      : "NOT_CHECKED",
    blockingReasons: status === "UNAVAILABLE"
      ? ["SOLANA_RPC_REQUEST_FAILED"]
      : [],
    caveats: [
      "MINT_ACCOUNT_DOES_NOT_PROVE_MARKET_LIQUIDITY",
      "MINT_ACCOUNT_DOES_NOT_PREDICT_TOKEN_SUCCESS",
    ],
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "SOLANA_RPC_MINT_VALIDATION",
  }
}

async function seed(
  store: MemoryStore,
  candidates: ReadonlyArray<MaxTrendingAttentionCandidate>
) {
  await persistMaxAttentionCandidates({
    store,
    opportunity: opportunity(candidates),
  })
}

test("does nothing when the attention inbox is empty", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  let calls = 0
  const result = await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl: "https://rpc.example.com",
    validateMint: async input => {
      calls += 1
      return validation(input.contractAddress, input.now!().toISOString())
    },
  })

  assert.equal(calls, 0)
  assert.equal(result.validatedCount, 0)
  assert.equal(result.persisted, false)
  assert.equal(onchainStore.writes, 0)
})

test("validates at most five pending candidates per run", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  await seed(inboxStore, MINTS.map(mint => candidate(mint)))
  let calls = 0
  const result = await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl: "https://rpc.example.com",
    validateMint: async input => {
      calls += 1
      return validation(input.contractAddress, input.now!().toISOString())
    },
    now: () => new Date("2026-09-17T02:01:00.000Z"),
  })

  assert.equal(result.eligibleCount, 6)
  assert.equal(result.selectedCount, 5)
  assert.equal(result.validatedCount, 5)
  assert.equal(result.remainingCount, 1)
  assert.equal(calls, 5)
  assert.equal(result.persisted, true)
})

test("uses definitive cached evidence for the same candidate event", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  await seed(inboxStore, [candidate(MINTS[0]!)])
  let calls = 0
  const validateMint = async (input: {
    contractAddress: string
    now?: () => Date
  }) => {
    calls += 1
    return validation(input.contractAddress, input.now!().toISOString())
  }
  await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl: "https://rpc.example.com",
    validateMint,
    now: () => new Date("2026-09-17T02:01:00.000Z"),
  })
  const cached = await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl: "https://rpc.example.com",
    validateMint,
    now: () => new Date("2026-09-17T03:01:00.000Z"),
  })

  assert.equal(calls, 1)
  assert.equal(cached.cachedCount, 1)
  assert.equal(cached.validatedCount, 0)
  assert.equal(cached.persisted, false)
})

test("retries unavailable evidence only after fifteen minutes", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  await seed(inboxStore, [candidate(MINTS[0]!)])
  let calls = 0
  const validateMint = async (input: {
    contractAddress: string
    now?: () => Date
  }) => {
    calls += 1
    return validation(
      input.contractAddress,
      input.now!().toISOString(),
      calls === 1 ? "UNAVAILABLE" : "VERIFIED_ONCHAIN"
    )
  }
  await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl: "https://rpc.example.com",
    validateMint,
    now: () => new Date("2026-09-17T02:01:00.000Z"),
  })
  const early = await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl: "https://rpc.example.com",
    validateMint,
    now: () => new Date("2026-09-17T02:10:00.000Z"),
  })
  const retried = await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl: "https://rpc.example.com",
    validateMint,
    now: () => new Date("2026-09-17T02:16:00.000Z"),
  })

  assert.equal(early.cachedCount, 1)
  assert.equal(retried.validatedCount, 1)
  assert.equal(retried.results[0]?.status, "VERIFIED_ONCHAIN")
  assert.equal(retried.ledgerRevision, 2)
  assert.equal(calls, 2)
})

test("excludes dismissed and unsupported-network candidates", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  const ethereum = candidate(
    "0x1111111111111111111111111111111111111111",
    "2026-09-17T02:00:00.000Z",
    "ethereum"
  )
  await seed(inboxStore, [candidate(MINTS[0]!), ethereum])
  await updateMaxAttentionCandidateState({
    store: inboxStore,
    identityKey: `solana:${MINTS[0]}`,
    state: "DISMISSED",
    dismissalReason: "Human review",
    updatedAt: "2026-09-17T02:01:00.000Z",
  })

  const result = await coordinatePendingMaxAttentionOnchain({
    inboxStore,
    onchainStore,
    rpcUrl: "https://rpc.example.com",
    validateMint: async input =>
      validation(input.contractAddress, input.now!().toISOString()),
    now: () => new Date("2026-09-17T02:02:00.000Z"),
  })

  assert.equal(result.dismissedCount, 1)
  assert.equal(result.unsupportedNetworkCount, 1)
  assert.equal(result.validatedCount, 0)
})

test("rejects unsafe limits and mismatched validator evidence", async () => {
  const inboxStore = new MemoryStore()
  const onchainStore = new MemoryStore()
  await seed(inboxStore, [candidate(MINTS[0]!)])

  await assert.rejects(
    coordinatePendingMaxAttentionOnchain({
      inboxStore,
      onchainStore,
      rpcUrl: "https://rpc.example.com",
      maxCandidates: 6,
    }),
    /between 1 and 5/
  )
  await assert.rejects(
    coordinatePendingMaxAttentionOnchain({
      inboxStore,
      onchainStore,
      rpcUrl: "https://rpc.example.com",
      validateMint: async input =>
        validation(MINTS[1]!, input.now!().toISOString()),
      now: () => new Date("2026-09-17T02:02:00.000Z"),
    }),
    /mismatched evidence/
  )
})
