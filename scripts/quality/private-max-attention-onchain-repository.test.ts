import assert from "node:assert/strict"
import test from "node:test"

import {
  parseMaxAttentionOnchainLedger,
  persistMaxAttentionOnchainValidations,
  type MaxAttentionOnchainEntry,
  type MaxAttentionOnchainStore,
} from "../../src/private-alpha/max-attention-onchain-repository"
import type {
  SolanaMintValidation,
} from "../../src/private-alpha/solana-mint-validator"

class MemoryStore implements MaxAttentionOnchainStore {
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

function validation(
  mintAddress: string,
  observedAt: string
): SolanaMintValidation {
  return {
    schemaVersion: 1,
    observedAt,
    network: "solana",
    mintAddress,
    status: "VERIFIED_ONCHAIN",
    rpcSlot: 123,
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

function entry(input: {
  suffix?: string
  observedAt?: string
  candidateId?: string
} = {}): MaxAttentionOnchainEntry {
  const suffix = input.suffix ?? "001"
  const mintAddress = `mint-${suffix}`
  const observedAt = input.observedAt ?? "2026-09-17T02:00:00.000Z"
  return {
    identityKey: `solana:${mintAddress}`,
    candidateId:
      input.candidateId ?? `candidate:${observedAt}:${suffix}`,
    validatedAt: observedAt,
    validation: validation(mintAddress, observedAt),
  }
}

test("persists compact watch-only on-chain evidence", async () => {
  const store = new MemoryStore()
  const result = await persistMaxAttentionOnchainValidations({
    store,
    entries: [entry()],
  })

  assert.equal(result.changed, true)
  assert.equal(result.ledger.revision, 1)
  assert.equal(result.ledger.entries.length, 1)
  assert.equal(
    result.ledger.entries[0]?.validation.status,
    "VERIFIED_ONCHAIN"
  )
  assert.equal(
    result.ledger.entries[0]?.validation.transactionRequested,
    false
  )
})

test("deduplicates an identical candidate validation", async () => {
  const store = new MemoryStore()
  const current = entry()
  await persistMaxAttentionOnchainValidations({
    store,
    entries: [current],
  })
  const retry = await persistMaxAttentionOnchainValidations({
    store,
    entries: [structuredClone(current)],
  })

  assert.equal(retry.changed, false)
  assert.equal(retry.ledger.revision, 1)
  assert.equal(store.writes, 1)
})

test("replaces an identity only for a new candidate event", async () => {
  const store = new MemoryStore()
  await persistMaxAttentionOnchainValidations({
    store,
    entries: [entry()],
  })
  const latest = entry({
    observedAt: "2026-09-18T02:00:00.000Z",
    candidateId: "candidate:return:001",
  })
  const result = await persistMaxAttentionOnchainValidations({
    store,
    entries: [latest],
  })

  assert.equal(result.ledger.revision, 2)
  assert.equal(result.ledger.entries.length, 1)
  assert.equal(
    result.ledger.entries[0]?.candidateId,
    "candidate:return:001"
  )
})

test("keeps one hundred recent validations", async () => {
  const store = new MemoryStore()
  const entries = Array.from({ length: 101 }, (_, index) =>
    entry({ suffix: String(index).padStart(3, "0") })
  )
  const result = await persistMaxAttentionOnchainValidations({
    store,
    entries,
  })

  assert.equal(result.ledger.entries.length, 100)
})

test("prunes evidence older than thirty days", async () => {
  const store = new MemoryStore()
  await persistMaxAttentionOnchainValidations({
    store,
    entries: [entry({
      suffix: "old",
      observedAt: "2026-08-01T00:00:00.000Z",
    })],
  })
  const result = await persistMaxAttentionOnchainValidations({
    store,
    entries: [entry({
      suffix: "new",
      observedAt: "2026-09-17T00:00:00.000Z",
    })],
  })

  assert.deepEqual(
    result.ledger.entries.map(item => item.identityKey),
    ["solana:mint-new"]
  )
})

test("fails closed on conflicts, corruption and concurrent writes", async () => {
  const store = new MemoryStore()
  const current = entry()
  await persistMaxAttentionOnchainValidations({
    store,
    entries: [current],
  })
  const conflicting = structuredClone(current)
  conflicting.validation.supplyRaw = "999"
  await assert.rejects(
    persistMaxAttentionOnchainValidations({
      store,
      entries: [conflicting],
    }),
    /conflicts with on-chain evidence/
  )
  assert.throws(
    () => parseMaxAttentionOnchainLedger('{"revision":1}'),
    /invalid MAX attention on-chain ledger/
  )

  const blockedStore = new MemoryStore()
  blockedStore.rejectWrite = true
  await assert.rejects(
    persistMaxAttentionOnchainValidations({
      store: blockedStore,
      entries: [entry()],
    }),
    /concurrent write rejected/
  )
})
