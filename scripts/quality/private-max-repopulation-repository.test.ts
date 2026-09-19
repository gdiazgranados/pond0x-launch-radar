import test from "node:test"
import assert from "node:assert/strict"

import {
  MAX_REPOPULATION_SIGNAL_VERSION,
  type MaxRepopulationSignal,
} from "../../src/private-alpha/max-repopulation-signal"

import {
  emptyMaxRepopulationLedger,
  parseMaxRepopulationLedger,
  recordMaxRepopulationT0,
  type MaxRepopulationLedger,
} from "../../src/private-alpha/max-repopulation-repository"

function signal(): MaxRepopulationSignal {
  return {
    signalVersion: MAX_REPOPULATION_SIGNAL_VERSION,
    observedAt: "2026-09-19T01:00:00.000Z",
    triggered: true,
    previousTrendingCount: 0,
    currentTrendingCount: 5,
    candidates: [
      {
        identityKey: "solana:address-2",
        network: "solana",
        contractAddress: "address-2",
        symbol: "TWO",
        name: "Token Two",
        rank: 2,
        observedAt: "2026-09-19T01:00:00.000Z",
        price: 1.25,
        change24h: 4,
        liquidity: 100_000,
        marketCap: 1_000_000,
        volume24h: 50_000,
      },
      {
        identityKey: "solana:address-3",
        network: "solana",
        contractAddress: "address-3",
        symbol: "THREE",
        name: "Token Three",
        rank: 3,
        observedAt: "2026-09-19T01:00:00.000Z",
        price: 2.5,
        change24h: 19.99,
        liquidity: 200_000,
        marketCap: 2_000_000,
        volume24h: 75_000,
      },
    ],
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

test("records immutable T0 evidence for a triggered MAX_REPOP_V1 event", () => {
  const initial: MaxRepopulationLedger = {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    episodes: [],
  }

  const next = recordMaxRepopulationT0({
    ledger: initial,
    signal: signal(),
  })

  assert.equal(next.schemaVersion, 1)
  assert.equal(next.revision, 1)
  assert.equal(next.updatedAt, "2026-09-19T01:00:00.000Z")
  assert.equal(next.episodes.length, 1)

  const episode = next.episodes[0]

  assert.equal(
    episode.eventId,
    "MAX_REPOP_V1:2026-09-19T01:00:00.000Z"
  )
  assert.equal(episode.signalVersion, "MAX_REPOP_V1")
  assert.equal(episode.observedAt, "2026-09-19T01:00:00.000Z")
  assert.equal(episode.candidates.length, 2)

  assert.deepEqual(episode.candidates[0], {
    candidateId:
      "MAX_REPOP_V1:2026-09-19T01:00:00.000Z:solana:address-2",
    identityKey: "solana:address-2",
    network: "solana",
    contractAddress: "address-2",
    symbol: "TWO",
    name: "Token Two",
    rank: 2,
    price: 1.25,
    change24h: 4,
    liquidity: 100_000,
    marketCap: 1_000_000,
    volume24h: 50_000,
  })

  assert.equal(episode.watchOnly, true)
  assert.equal(episode.approvalGranted, false)
  assert.equal(episode.transactionRequested, false)
})

test("does not duplicate the same prospective T0 event", () => {
  const initial: MaxRepopulationLedger = {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    episodes: [],
  }

  const first = recordMaxRepopulationT0({
    ledger: initial,
    signal: signal(),
  })

  const second = recordMaxRepopulationT0({
    ledger: first,
    signal: signal(),
  })

  assert.equal(first.episodes.length, 1)
  assert.equal(second.episodes.length, 1)

  assert.equal(
    second.episodes[0].eventId,
    "MAX_REPOP_V1:2026-09-19T01:00:00.000Z"
  )

  assert.equal(second.revision, first.revision)
  assert.equal(second.updatedAt, first.updatedAt)

  assert.deepEqual(second, first)
})

test("does not record non-triggered or candidate-empty signals", () => {
  const initial: MaxRepopulationLedger = {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    episodes: [],
  }

  const nonTriggered: MaxRepopulationSignal = {
    ...signal(),
    triggered: false,
    candidates: [],
  }

  const afterNonTriggered = recordMaxRepopulationT0({
    ledger: initial,
    signal: nonTriggered,
  })

  assert.deepEqual(afterNonTriggered, initial)

  const candidateEmpty: MaxRepopulationSignal = {
    ...signal(),
    triggered: true,
    candidates: [],
  }

  const afterCandidateEmpty = recordMaxRepopulationT0({
    ledger: initial,
    signal: candidateEmpty,
  })

  assert.deepEqual(afterCandidateEmpty, initial)
})

test("creates and parses an empty prospective ledger", () => {
  const empty = emptyMaxRepopulationLedger()

  assert.deepEqual(empty, {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    episodes: [],
  })

  const parsed = parseMaxRepopulationLedger(
    JSON.stringify(empty)
  )

  assert.deepEqual(parsed, empty)
})

test("rejects malformed or invalid prospective ledgers", () => {
  assert.throws(
    () => parseMaxRepopulationLedger("{not-json"),
    /invalid MAX repopulation ledger/
  )

  assert.throws(
    () =>
      parseMaxRepopulationLedger(
        JSON.stringify({
          schemaVersion: 2,
          revision: -1,
          updatedAt: "not-a-timestamp",
          episodes: "not-an-array",
        })
      ),
    /invalid MAX repopulation ledger/
  )
})

test("rejects corrupted candidate evidence inside an otherwise valid ledger", () => {
  const valid = recordMaxRepopulationT0({
    ledger: emptyMaxRepopulationLedger(),
    signal: signal(),
  })

  const corruptedRank = JSON.parse(
    JSON.stringify(valid)
  )
  corruptedRank.episodes[0].candidates[0].rank = 4

  assert.throws(
    () =>
      parseMaxRepopulationLedger(
        JSON.stringify(corruptedRank)
      ),
    /invalid MAX repopulation ledger/
  )

  const corruptedMomentum = JSON.parse(
    JSON.stringify(valid)
  )
  corruptedMomentum.episodes[0].candidates[0].change24h = null

  assert.throws(
    () =>
      parseMaxRepopulationLedger(
        JSON.stringify(corruptedMomentum)
      ),
    /invalid MAX repopulation ledger/
  )
})
