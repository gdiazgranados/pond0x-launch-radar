import test from "node:test"
import assert from "node:assert/strict"

import {
  MAX_REPOPULATION_SIGNAL_VERSION,
  type MaxRepopulationSignal,
} from "../../src/private-alpha/max-repopulation-signal"

import {
  coordinateMaxRepopulationObservation,
  coordinateMaxRepopulationT0,
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
    previousObservation: null,
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
    previousObservation: null,
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
    previousObservation: null,
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
    previousObservation: null,
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

test("persists a new prospective T0 event with compare-and-set", async () => {
  let serialized: string | null = null
  const writes: Array<{
    expectedRevision: number
    serializedLedger: string
  }> = []

  const store = {
    async read() {
      return serialized
    },

    async compareAndSet(
      expectedRevision: number,
      serializedLedger: string
    ) {
      writes.push({
        expectedRevision,
        serializedLedger,
      })

      serialized = serializedLedger
      return true
    },
  }

  const result = await coordinateMaxRepopulationT0({
    store,
    signal: signal(),
  })

  assert.equal(result.changed, true)
  assert.equal(result.ledger.revision, 1)
  assert.equal(result.ledger.episodes.length, 1)

  assert.equal(writes.length, 1)
  assert.equal(writes[0].expectedRevision, 0)

  const persisted = parseMaxRepopulationLedger(
    writes[0].serializedLedger
  )

  assert.deepEqual(persisted, result.ledger)
})

test("does not write when the prospective T0 signal produces no change", async () => {
  const existing = recordMaxRepopulationT0({
    ledger: emptyMaxRepopulationLedger(),
    signal: signal(),
  })

  let writes = 0

  const store = {
    async read() {
      return JSON.stringify(existing)
    },

    async compareAndSet(
      _expectedRevision: number,
      _serializedLedger: string
    ) {
      writes += 1
      return true
    },
  }

  const duplicate = await coordinateMaxRepopulationT0({
    store,
    signal: signal(),
  })

  assert.equal(duplicate.changed, false)
  assert.deepEqual(duplicate.ledger, existing)
  assert.equal(writes, 0)

  const nonTriggered: MaxRepopulationSignal = {
    ...signal(),
    triggered: false,
    candidates: [],
  }

  const ignored = await coordinateMaxRepopulationT0({
    store,
    signal: nonTriggered,
  })

  assert.equal(ignored.changed, false)
  assert.deepEqual(ignored.ledger, existing)
  assert.equal(writes, 0)
})

test("rejects a concurrent prospective T0 write", async () => {
  let writes = 0

  const store = {
    async read() {
      return null
    },

    async compareAndSet(
      expectedRevision: number,
      _serializedLedger: string
    ) {
      writes += 1
      assert.equal(expectedRevision, 0)
      return false
    },
  }

  await assert.rejects(
    () =>
      coordinateMaxRepopulationT0({
        store,
        signal: signal(),
      }),
    /MAX repopulation concurrent write rejected/
  )

  assert.equal(writes, 1)
})
test("persists the latest raw observation independently of T0 episodes", async () => {
  let serialized: string | null = null

  const store = {
    async read() {
      return serialized
    },

    async compareAndSet(
      expectedRevision: number,
      serializedLedger: string
    ) {
      const revision = serialized === null
        ? 0
        : JSON.parse(serialized).revision

      if (revision !== expectedRevision) return false

      serialized = serializedLedger
      return true
    },
  }

  const first = await coordinateMaxRepopulationObservation({
    store,
    snapshot: {
      observedAt: "2026-09-19T01:00:00.000Z",
      trending: [],
    },
  })

  assert.equal(first.signal, null)
  assert.equal(first.ledger.revision, 1)
  assert.equal(first.ledger.episodes.length, 0)
  assert.equal(
    first.ledger.previousObservation?.observedAt,
    "2026-09-19T01:00:00.000Z"
  )
  assert.equal(
    first.ledger.previousObservation?.trendingCount,
    0
  )
})

test("records a T0 episode on an exact persisted zero-to-five transition", async () => {
  let serialized: string | null = null

  const store = {
    async read() {
      return serialized
    },

    async compareAndSet(
      expectedRevision: number,
      serializedLedger: string
    ) {
      const revision = serialized === null
        ? 0
        : JSON.parse(serialized).revision

      if (revision !== expectedRevision) return false

      serialized = serializedLedger
      return true
    },
  }

  await coordinateMaxRepopulationObservation({
    store,
    snapshot: {
      observedAt: "2026-09-19T01:00:00.000Z",
      trending: [],
    },
  })

  const second = await coordinateMaxRepopulationObservation({
    store,
    snapshot: {
      observedAt: "2026-09-19T01:01:00.000Z",
      trending: [
        {
          network: "solana",
          contractAddress: "address-1",
          symbol: "ONE",
          name: "ONE",
          position: 1,
          identityKey: "solana:address-1",
          price: 1,
          change24h: 1,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
        {
          network: "solana",
          contractAddress: "address-2",
          symbol: "TWO",
          name: "TWO",
          position: 2,
          identityKey: "solana:address-2",
          price: 1,
          change24h: 10,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
        {
          network: "solana",
          contractAddress: "address-3",
          symbol: "THREE",
          name: "THREE",
          position: 3,
          identityKey: "solana:address-3",
          price: 1,
          change24h: 19.99,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
        {
          network: "solana",
          contractAddress: "address-4",
          symbol: "FOUR",
          name: "FOUR",
          position: 4,
          identityKey: "solana:address-4",
          price: 1,
          change24h: 1,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
        {
          network: "solana",
          contractAddress: "address-5",
          symbol: "FIVE",
          name: "FIVE",
          position: 5,
          identityKey: "solana:address-5",
          price: 1,
          change24h: 1,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
      ],
    },
  })

  assert.equal(second.signal?.triggered, true)
  assert.equal(second.ledger.revision, 2)
  assert.equal(second.ledger.episodes.length, 1)

  assert.deepEqual(
    second.ledger.episodes[0]?.candidates.map(
      candidate => candidate.rank
    ),
    [2, 3]
  )

  assert.equal(
    second.ledger.previousObservation?.trendingCount,
    5
  )
})

test("does not record a T0 episode on five-to-five", async () => {
  let serialized = JSON.stringify({
    schemaVersion: 1,
    revision: 1,
    updatedAt: "2026-09-19T01:00:00.000Z",
    previousObservation: {
      observedAt: "2026-09-19T01:00:00.000Z",
      trendingCount: 5,
    },
    episodes: [],
  })

  const store = {
    async read() {
      return serialized
    },

    async compareAndSet(
      expectedRevision: number,
      serializedLedger: string
    ) {
      const revision = JSON.parse(serialized).revision

      if (revision !== expectedRevision) return false

      serialized = serializedLedger
      return true
    },
  }

  const result = await coordinateMaxRepopulationObservation({
    store,
    snapshot: {
      observedAt: "2026-09-19T01:01:00.000Z",
      trending: [
        {
          network: "solana",
          contractAddress: "address-1",
          symbol: "ONE",
          name: "ONE",
          position: 1,
          identityKey: "solana:address-1",
          price: 1,
          change24h: 1,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
        {
          network: "solana",
          contractAddress: "address-2",
          symbol: "TWO",
          name: "TWO",
          position: 2,
          identityKey: "solana:address-2",
          price: 1,
          change24h: 10,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
        {
          network: "solana",
          contractAddress: "address-3",
          symbol: "THREE",
          name: "THREE",
          position: 3,
          identityKey: "solana:address-3",
          price: 1,
          change24h: 19.99,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
        {
          network: "solana",
          contractAddress: "address-4",
          symbol: "FOUR",
          name: "FOUR",
          position: 4,
          identityKey: "solana:address-4",
          price: 1,
          change24h: 1,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
        {
          network: "solana",
          contractAddress: "address-5",
          symbol: "FIVE",
          name: "FIVE",
          position: 5,
          identityKey: "solana:address-5",
          price: 1,
          change24h: 1,
          liquidity: 100_000,
          marketCap: 1_000_000,
          volume24h: 50_000,
        },
      ],
    },
  })

  assert.equal(result.signal?.triggered, false)
  assert.equal(result.ledger.episodes.length, 0)
  assert.equal(result.ledger.revision, 2)
  assert.equal(
    result.ledger.previousObservation?.trendingCount,
    5
  )
})

test("rejects a stale raw MAX repopulation observation", async () => {
  const store = {
    async read() {
      return JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        updatedAt: "2026-09-19T01:01:00.000Z",
        previousObservation: {
          observedAt: "2026-09-19T01:01:00.000Z",
          trendingCount: 0,
        },
        episodes: [],
      })
    },

    async compareAndSet() {
      throw new Error("compareAndSet must not be called")
    },
  }

  await assert.rejects(
    coordinateMaxRepopulationObservation({
      store,
      snapshot: {
        observedAt: "2026-09-19T01:00:00.000Z",
        trending: [],
      },
    }),
    /stale MAX repopulation observation/
  )
})

test("rejects a concurrent raw MAX repopulation write", async () => {
  const store = {
    async read() {
      return null
    },

    async compareAndSet() {
      return false
    },
  }

  await assert.rejects(
    coordinateMaxRepopulationObservation({
      store,
      snapshot: {
        observedAt: "2026-09-19T01:00:00.000Z",
        trending: [],
      },
    }),
    /MAX repopulation concurrent write rejected/
  )
})

test("makes an identical raw MAX repopulation retry idempotent", async () => {
  let serialized: string | null = null
  let writes = 0

  const store = {
    async read() {
      return serialized
    },

    async compareAndSet(
      expectedRevision: number,
      serializedLedger: string
    ) {
      const revision = serialized === null
        ? 0
        : JSON.parse(serialized).revision

      if (revision !== expectedRevision) return false

      serialized = serializedLedger
      writes += 1
      return true
    },
  }

  const snapshot = {
    observedAt: "2026-09-19T03:00:00.000Z",
    trending: [],
  }

  const first = await coordinateMaxRepopulationObservation({
    store,
    snapshot,
  })

  const retry = await coordinateMaxRepopulationObservation({
    store,
    snapshot,
  })

  assert.equal(first.changed, true)
  assert.equal(first.ledger.revision, 1)

  assert.equal(retry.changed, false)
  assert.equal(retry.signal, null)
  assert.equal(retry.ledger.revision, 1)

  assert.equal(writes, 1)
})