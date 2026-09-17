import assert from "node:assert/strict"
import test from "node:test"

import type {
  MaxAttentionInboxCandidate,
  MaxAttentionInboxLedger,
} from "../../src/private-alpha/max-attention-inbox-repository"
import {
  emptyMaxAttentionJupiterLedger,
} from "../../src/private-alpha/max-attention-jupiter-repository"
import {
  emptyMaxAttentionOnchainLedger,
} from "../../src/private-alpha/max-attention-onchain-repository"
import {
  buildMaxAttentionTopReport,
} from "../../src/private-alpha/max-attention-top-report"

function candidate(input: {
  identityKey: string
  symbol: string
  appearances: number
  reappearances: number
  position?: number
  observedAt: string
}): MaxAttentionInboxCandidate {
  const position = input.position ?? 5
  return {
    identityKey: input.identityKey,
    network: "solana",
    contractAddress: input.identityKey.slice("solana:".length),
    symbol: input.symbol,
    name: input.symbol,
    firstSeenAt: input.observedAt,
    lastSeenAt: input.observedAt,
    firstAttentionAt: input.observedAt,
    lastAttentionAt: input.observedAt,
    appearanceCount: input.appearances,
    newCount: input.appearances - input.reappearances,
    reappearedCount: input.reappearances,
    firstPosition: position,
    latestPosition: position,
    bestPosition: position,
    state: "PENDING_REVIEW",
    stateUpdatedAt: input.observedAt,
    dismissalReason: null,
    evidence: [{
      candidateId: `candidate:${input.identityKey}`,
      observedAt: input.observedAt,
      trigger:
        input.reappearances > 0 ? "REAPPEARED" : "NEW",
      position,
    }],
    requiresHumanDecision: true,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

function inbox(
  candidates: ReadonlyArray<MaxAttentionInboxCandidate>
): MaxAttentionInboxLedger {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: "2026-09-17T22:00:00.000Z",
    candidates,
  }
}

test("ranks repeated Pond0x attention before newer single appearances", () => {
  const report = buildMaxAttentionTopReport({
    inbox: inbox([
      candidate({
        identityKey: "solana:single",
        symbol: "SINGLE",
        appearances: 1,
        reappearances: 0,
        observedAt: "2026-09-17T21:00:00.000Z",
      }),
      candidate({
        identityKey: "solana:repeat",
        symbol: "REPEAT",
        appearances: 4,
        reappearances: 3,
        observedAt: "2026-09-17T20:00:00.000Z",
      }),
    ]),
    onchain: emptyMaxAttentionOnchainLedger(),
    jupiter: emptyMaxAttentionJupiterLedger(),
    now: () => new Date("2026-09-17T22:00:00.000Z"),
  })

  assert.deepEqual(
    report.entries.map(entry => entry.symbol),
    ["REPEAT", "SINGLE"]
  )
  assert.equal(report.entries[0]?.rank, 1)
  assert.equal(report.entries[0]?.successProbability, null)
  assert.equal(report.entries[0]?.investmentRecommendation, null)
})

test("uses best position, reappearances, recency and identity as stable ties", () => {
  const report = buildMaxAttentionTopReport({
    inbox: inbox([
      candidate({
        identityKey: "solana:z",
        symbol: "Z",
        appearances: 2,
        reappearances: 1,
        position: 5,
        observedAt: "2026-09-17T20:00:00.000Z",
      }),
      candidate({
        identityKey: "solana:a",
        symbol: "A",
        appearances: 2,
        reappearances: 2,
        position: 4,
        observedAt: "2026-09-17T19:00:00.000Z",
      }),
    ]),
    onchain: emptyMaxAttentionOnchainLedger(),
    jupiter: emptyMaxAttentionJupiterLedger(),
  })

  assert.deepEqual(
    report.entries.map(entry => entry.symbol),
    ["A", "Z"]
  )
})

test("bounds the report to ten and reports unfilled positions honestly", () => {
  const report = buildMaxAttentionTopReport({
    inbox: inbox([
      candidate({
        identityKey: "solana:one",
        symbol: "ONE",
        appearances: 1,
        reappearances: 0,
        observedAt: "2026-09-17T20:00:00.000Z",
      }),
    ]),
    onchain: emptyMaxAttentionOnchainLedger(),
    jupiter: emptyMaxAttentionJupiterLedger(),
  })

  assert.equal(report.returnedCount, 1)
  assert.equal(report.vacancies, 9)
  assert.equal(report.watchOnly, true)
  assert.equal(report.approvalGranted, false)
  assert.equal(report.transactionRequested, false)
  assert.throws(
    () => buildMaxAttentionTopReport({
      inbox: inbox([]),
      onchain: emptyMaxAttentionOnchainLedger(),
      jupiter: emptyMaxAttentionJupiterLedger(),
      limit: 11,
    }),
    /limit must be from 1 to 10/
  )
})
