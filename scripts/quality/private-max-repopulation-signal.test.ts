import test from "node:test"
import assert from "node:assert/strict"

import {
  detectMaxRepopulationSignal,
} from "../../src/private-alpha/max-repopulation-signal"

const token = (
  symbol: string,
  address: string,
  change24h: number | null,
  position?: number
) => {
  const inferredPosition = Number(address.match(/-(\d+)$/)?.[1])
  const resolvedPosition =
    position ??
    (Number.isInteger(inferredPosition) && inferredPosition > 0
      ? inferredPosition
      : 1)

  return {
    network: "solana",
    contractAddress: address,
    symbol,
    name: symbol,
    position: resolvedPosition,
    identityKey: `solana:${address}`,
    price: 1,
    change24h,
    liquidity: 100_000,
    marketCap: 1_000_000,
    volume24h: 50_000,
  }
}

test("detects only frozen MAX_REPOP_V1 rank 2-3 candidates", () => {
  const previous = {
    observedAt: "2026-09-19T00:00:00.000Z",
    trending: [],
  }

  const current = {
    observedAt: "2026-09-19T01:00:00.000Z",
    trending: [
      token("ONE", "address-1", 5),
      token("TWO", "address-2", 4),
      token("THREE", "address-3", 19.99),
      token("FOUR", "address-4", 2),
      token("FIVE", "address-5", 1),
    ],
  }

  const result = detectMaxRepopulationSignal({
    previous,
    current,
  })

  assert.equal(result.signalVersion, "MAX_REPOP_V1")
  assert.equal(result.triggered, true)
  assert.equal(result.watchOnly, true)
  assert.equal(result.approvalGranted, false)
  assert.equal(result.transactionRequested, false)

  assert.deepEqual(
    result.candidates.map(candidate => ({
      symbol: candidate.symbol,
      rank: candidate.rank,
      address: candidate.contractAddress,
    })),
    [
      {
        symbol: "TWO",
        rank: 2,
        address: "address-2",
      },
      {
        symbol: "THREE",
        rank: 3,
        address: "address-3",
      },
    ]
  )
})

test("requires an exact empty-to-five transition", () => {
  const current = {
    observedAt: "2026-09-19T01:00:00.000Z",
    trending: [
      token("ONE", "address-1", 5),
      token("TWO", "address-2", 4),
      token("THREE", "address-3", 3),
      token("FOUR", "address-4", 2),
      token("FIVE", "address-5", 1),
    ],
  }

  const notEmpty = detectMaxRepopulationSignal({
    previous: {
      observedAt: "2026-09-19T00:00:00.000Z",
      trending: [token("OLD", "old-address", 1)],
    },
    current,
  })

  assert.equal(notEmpty.triggered, false)
  assert.deepEqual(notEmpty.candidates, [])

  const onlyFour = detectMaxRepopulationSignal({
    previous: {
      observedAt: "2026-09-19T00:00:00.000Z",
      trending: [],
    },
    current: {
      ...current,
      trending: current.trending.slice(0, 4),
    },
  })

  assert.equal(onlyFour.triggered, false)
  assert.deepEqual(onlyFour.candidates, [])
})

test("rejects rank 2-3 candidates at or above 20 percent momentum", () => {
  const result = detectMaxRepopulationSignal({
    previous: {
      observedAt: "2026-09-19T00:00:00.000Z",
      trending: [],
    },
    current: {
      observedAt: "2026-09-19T01:00:00.000Z",
      trending: [
        token("ONE", "address-1", 1),
        token("TWO", "address-2", 20),
        token("THREE", "address-3", 50),
        token("FOUR", "address-4", 1),
        token("FIVE", "address-5", 1),
      ],
    },
  })

  assert.equal(result.triggered, true)
  assert.deepEqual(result.candidates, [])
})

test("freezes the momentum boundary below 20 percent", () => {
  const previous = {
    observedAt: "2026-09-19T00:00:00.000Z",
    trending: [],
  }

  const current = {
    observedAt: "2026-09-19T01:00:00.000Z",
    trending: [
      token("ONE", "address-1", 1),
      token("BELOW", "address-2", 19.999),
      token("BOUNDARY", "address-3", 20),
      token("FOUR", "address-4", 1),
      token("FIVE", "address-5", 1),
    ],
  }

  const result = detectMaxRepopulationSignal({
    previous,
    current,
  })

  assert.equal(result.triggered, true)

  assert.deepEqual(
    result.candidates.map(candidate => ({
      symbol: candidate.symbol,
      rank: candidate.rank,
      change24h: candidate.change24h,
    })),
    [
      {
        symbol: "BELOW",
        rank: 2,
        change24h: 19.999,
      },
    ]
  )
})

test("does not trigger on any transition other than zero-to-five", () => {
  const five = [
    token("ONE", "address-1", 1),
    token("TWO", "address-2", 2),
    token("THREE", "address-3", 3),
    token("FOUR", "address-4", 4),
    token("FIVE", "address-5", 5),
  ]

  const cases = [
    {
      name: "zero-to-zero",
      previous: [],
      current: [],
    },
    {
      name: "five-to-zero",
      previous: five,
      current: [],
    },
    {
      name: "five-to-five",
      previous: five,
      current: five,
    },
  ]

  for (const transition of cases) {
    const result = detectMaxRepopulationSignal({
      previous: {
        observedAt: "2026-09-19T00:00:00.000Z",
        trending: transition.previous,
      },
      current: {
        observedAt: "2026-09-19T01:00:00.000Z",
        trending: transition.current,
      },
    })

    assert.equal(
      result.triggered,
      false,
      `${transition.name} must not trigger MAX_REPOP_V1`
    )

    assert.deepEqual(
      result.candidates,
      [],
      `${transition.name} must not produce candidates`
    )
  }
})

test("does not classify a candidate when change24h is unavailable", () => {
  const previous = {
    observedAt: "2026-09-19T00:00:00.000Z",
    trending: [],
  }

  const current = {
    observedAt: "2026-09-19T01:00:00.000Z",
    trending: [
      token("ONE", "address-1", 1),
      {
        ...token("UNKNOWN", "address-2", 1),
        change24h: null,
      },
      token("THREE", "address-3", 3),
      token("FOUR", "address-4", 4),
      token("FIVE", "address-5", 5),
    ],
  }

  const result = detectMaxRepopulationSignal({
    previous,
    current,
  })

  assert.equal(result.triggered, true)

  assert.deepEqual(
    result.candidates.map(candidate => candidate.symbol),
    ["THREE"]
  )
})


