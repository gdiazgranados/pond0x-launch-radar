import assert from "node:assert/strict"
import test from "node:test"

import {
  coordinateMaxTrendingOpportunityCycle,
} from "../../src/private-alpha/max-trending-opportunity-cycle"
import type {
  MaxAttentionInboxStore,
} from "../../src/private-alpha/max-attention-inbox-repository"
import type {
  MaxAttentionOnchainStore,
} from "../../src/private-alpha/max-attention-onchain-repository"
import type {
  MaxTrendingAsset,
  MaxTrendingSnapshot,
} from "../../src/private-alpha/max-trending-client"
import type {
  MaxTrendingStore,
} from "../../src/private-alpha/max-trending-snapshot-repository"
import type {
  SolanaMintValidation,
} from "../../src/private-alpha/solana-mint-validator"

const MINT_A = "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq"
const MINT_B = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx"

class MemoryStore implements MaxTrendingStore, MaxAttentionInboxStore,
  MaxAttentionOnchainStore {
  serialized: string | null = null
  rejectWrite = false
  writes = 0

  async read() {
    return this.serialized
  }

  async compareAndSet(expectedRevision: number, next: string) {
    if (this.rejectWrite) return false
    const revision = this.serialized === null
      ? 0
      : JSON.parse(this.serialized).revision
    if (revision !== expectedRevision) return false
    this.serialized = next
    this.writes += 1
    return true
  }
}

function asset(
  mint: string,
  symbol: string,
  position: number
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

function snapshot(
  observedAt: string,
  trending: ReadonlyArray<MaxTrendingAsset>
): MaxTrendingSnapshot {
  return {
    schemaVersion: 1,
    observedAt,
    status: trending.length === 0 ? "EMPTY" : "OBSERVED",
    query: { q: "", verified: false, network: "all" },
    tokenCount: 4,
    trending,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "PONDOX_MAX_SEARCH",
  }
}

function validation(
  contractAddress: string,
  observedAt: string
): SolanaMintValidation {
  return {
    schemaVersion: 1,
    observedAt,
    network: "solana",
    mintAddress: contractAddress,
    status: "VERIFIED_ONCHAIN",
    rpcSlot: 100,
    ownerProgram:
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
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

function stores() {
  return {
    observationStore: new MemoryStore(),
    attentionInboxStore: new MemoryStore(),
    onchainStore: new MemoryStore(),
  }
}

test("keeps a baseline out of both opportunity ledgers", async () => {
  const state = stores()
  let calls = 0
  const result = await coordinateMaxTrendingOpportunityCycle({
    ...state,
    rpcUrl: "https://rpc.example.com",
    observe: async () => snapshot(
      "2026-09-17T01:00:00.000Z",
      [asset(MINT_A, "BASE", 1)]
    ),
    validateMint: async input => {
      calls += 1
      return validation(input.contractAddress, input.now!().toISOString())
    },
    now: () => new Date("2026-09-17T01:00:01.000Z"),
  })

  assert.equal(result.status, "BASELINE")
  assert.equal(result.attentionInbox.totalCandidates, 0)
  assert.equal(result.onchainValidation.validatedCount, 0)
  assert.equal(calls, 0)
})

test("persists and validates a new candidate in one cycle", async () => {
  const state = stores()
  await coordinateMaxTrendingOpportunityCycle({
    ...state,
    rpcUrl: "https://rpc.example.com",
    observe: async () => snapshot(
      "2026-09-17T01:00:00.000Z",
      [asset(MINT_A, "BASE", 1)]
    ),
    validateMint: async input =>
      validation(input.contractAddress, input.now!().toISOString()),
    now: () => new Date("2026-09-17T01:00:01.000Z"),
  })
  const result = await coordinateMaxTrendingOpportunityCycle({
    ...state,
    rpcUrl: "https://rpc.example.com",
    observe: async () => snapshot(
      "2026-09-17T01:01:00.000Z",
      [
        asset(MINT_A, "BASE", 1),
        asset(MINT_B, "NEW", 2),
      ]
    ),
    validateMint: async input =>
      validation(input.contractAddress, input.now!().toISOString()),
    now: () => new Date("2026-09-17T01:01:01.000Z"),
  })

  assert.equal(result.opportunity.status, "EARLY_ATTENTION")
  assert.equal(result.attentionInbox.persisted, true)
  assert.equal(result.onchainValidation.persisted, true)
  assert.equal(result.onchainValidation.validatedCount, 1)
  assert.equal(
    result.onchainValidation.results[0]?.status,
    "VERIFIED_ONCHAIN"
  )
})

test("an unchanged cycle reuses definitive on-chain evidence", async () => {
  const state = stores()
  const baseline = snapshot(
    "2026-09-17T01:00:00.000Z",
    [asset(MINT_A, "BASE", 1)]
  )
  const changed = snapshot(
    "2026-09-17T01:01:00.000Z",
    [
      asset(MINT_A, "BASE", 1),
      asset(MINT_B, "NEW", 2),
    ]
  )
  let calls = 0
  const validateMint = async (input: {
    contractAddress: string
    now?: () => Date
  }) => {
    calls += 1
    return validation(input.contractAddress, input.now!().toISOString())
  }
  await coordinateMaxTrendingOpportunityCycle({
    ...state,
    rpcUrl: "https://rpc.example.com",
    observe: async () => baseline,
    validateMint,
    now: () => new Date("2026-09-17T01:00:01.000Z"),
  })
  await coordinateMaxTrendingOpportunityCycle({
    ...state,
    rpcUrl: "https://rpc.example.com",
    observe: async () => changed,
    validateMint,
    now: () => new Date("2026-09-17T01:01:01.000Z"),
  })
  const unchanged = await coordinateMaxTrendingOpportunityCycle({
    ...state,
    rpcUrl: "https://rpc.example.com",
    observe: async () => snapshot(
      "2026-09-17T01:02:00.000Z",
      changed.trending
    ),
    validateMint,
    now: () => new Date("2026-09-17T01:02:01.000Z"),
  })

  assert.equal(calls, 1)
  assert.equal(unchanged.status, "UNCHANGED")
  assert.equal(unchanged.onchainValidation.cachedCount, 1)
  assert.equal(unchanged.onchainValidation.validatedCount, 0)
})

test("fails visibly after preserving a recoverable inbox candidate", async () => {
  const state = stores()
  await coordinateMaxTrendingOpportunityCycle({
    ...state,
    rpcUrl: "https://rpc.example.com",
    observe: async () => snapshot(
      "2026-09-17T01:00:00.000Z",
      [asset(MINT_A, "BASE", 1)]
    ),
    validateMint: async input =>
      validation(input.contractAddress, input.now!().toISOString()),
  })
  state.onchainStore.rejectWrite = true

  await assert.rejects(
    coordinateMaxTrendingOpportunityCycle({
      ...state,
      rpcUrl: "https://rpc.example.com",
      observe: async () => snapshot(
        "2026-09-17T01:01:00.000Z",
        [
          asset(MINT_A, "BASE", 1),
          asset(MINT_B, "NEW", 2),
        ]
      ),
      validateMint: async input =>
        validation(input.contractAddress, input.now!().toISOString()),
      now: () => new Date("2026-09-17T01:01:01.000Z"),
    }),
    /on-chain concurrent write rejected/
  )
  assert.equal(state.attentionInboxStore.writes, 1)
  const inbox = JSON.parse(state.attentionInboxStore.serialized ?? "{}")
  assert.equal(inbox.candidates.length, 1)
})
