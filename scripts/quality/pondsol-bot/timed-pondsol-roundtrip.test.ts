import assert from "node:assert/strict"
import test from "node:test"

import {
  observeTimedPondsolRoundTrip,
} from "../../../src/private-alpha/pondsol-bot/timed-pondsol-roundtrip"

const RAYDIUM = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const METEORA = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

function leg(inputRaw: string, outputRaw: string, pool: string) {
  return {
    routeId: "jupiter:synthetic",
    venueIds: [pool],
    inputAmountBaseUnits: inputRaw,
    outputAmountBaseUnits: outputRaw,
    inputAmount: Number(inputRaw) / 1e9,
    outputAmount: Number(outputRaw) / 1e9,
    estimatedFeeUsd: 0,
  }
}

function clockValues(values: number[]) {
  let index = 0
  return () => values[index++]
}

test("records both legs and exact pondSOL continuity", async () => {
  const requests: string[] = []

  const reader = async (request: {
    inputAmountBaseUnits: string
  }) => {
    requests.push(request.inputAmountBaseUnits)

    return requests.length === 1
      ? leg("10000000", "6388167", RAYDIUM)
      : leg("6388167", "9800000", METEORA)
  }

  const result = await observeTimedPondsolRoundTrip(
    "10000000",
    reader as never,
    clockValues([100000, 100100, 100150, 100300])
  )

  assert.deepEqual(requests, ["10000000", "6388167"])
  assert.equal(result.cycleDurationMs, 300)
  assert.equal(result.liquidityClassification, "INDEPENDENT")
  assert.equal(result.tradeAllowed, false)
})

test("rejects cycles older than 30 seconds", async () => {
  let calls = 0

  const reader = async () => {
    calls++
    return calls === 1
      ? leg("10000000", "6388167", RAYDIUM)
      : leg("6388167", "9800000", METEORA)
  }

  await assert.rejects(
    () => observeTimedPondsolRoundTrip(
      "10000000",
      reader as never,
      clockValues([100000, 110000, 120000, 131000])
    ),
    /TIMED_ROUNDTRIP_TOO_OLD/
  )
})

test("shared liquidity never becomes independent", async () => {
  let calls = 0

  const reader = async () => {
    calls++
    return calls === 1
      ? leg("10000000", "6388167", RAYDIUM)
      : leg("6388167", "9800000", RAYDIUM)
  }

  const result = await observeTimedPondsolRoundTrip(
    "10000000",
    reader as never,
    clockValues([100000, 100100, 100150, 100300])
  )

  assert.equal(result.liquidityClassification, "SAME_LIQUIDITY")
  assert.equal(result.tradeAllowed, false)
})

test("failed exit rejects the entire cycle", async () => {
  let calls = 0

  const reader = async () => {
    calls++

    if (calls === 1) {
      return leg("10000000", "6388167", RAYDIUM)
    }

    throw new Error("EXIT_UNAVAILABLE")
  }

  await assert.rejects(
    () => observeTimedPondsolRoundTrip(
      "10000000",
      reader as never,
      clockValues([100000, 100100, 100150])
    ),
    /EXIT_UNAVAILABLE/
  )
})

test("rejects backwards sequencing", async () => {
  let calls = 0

  const reader = async () => {
    calls++
    return calls === 1
      ? leg("10000000", "6388167", RAYDIUM)
      : leg("6388167", "9800000", METEORA)
  }

  await assert.rejects(
    () => observeTimedPondsolRoundTrip(
      "10000000",
      reader as never,
      clockValues([100000, 100200, 100150, 100300])
    ),
    /TIMED_ROUNDTRIP_OVERLAP/
  )
})
