import assert from "node:assert/strict"
import test from "node:test"

import {
  observePondsolJupiterRoundTrip,
} from "../../../src/private-alpha/pondsol-bot/jupiter-pondsol-roundtrip"

const RAYDIUM = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const METEORA = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

function leg(
  inputRaw: string,
  outputRaw: string,
  pool: string
) {
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

test("uses exact received pondSOL amount for exit quote", async () => {
  const requests: string[] = []

  const reader = async (request: {
    inputAmountBaseUnits: string
  }) => {
    requests.push(request.inputAmountBaseUnits)

    return requests.length === 1
      ? leg("10000000", "6388167", RAYDIUM)
      : leg("6388167", "9800000", METEORA)
  }

  const result = await observePondsolJupiterRoundTrip(
    "10000000",
    reader as never
  )

  assert.deepEqual(requests, ["10000000", "6388167"])
  assert.equal(result.liquidityClassification, "INDEPENDENT")
  assert.equal(result.grossPnlPct, -2)
  assert.equal(result.tradeAllowed, false)
})

test("shared underlying pool is not independent", async () => {
  let calls = 0

  const reader = async () => {
    calls++

    return calls === 1
      ? leg("10000000", "6388167", RAYDIUM)
      : leg("6388167", "9800000", RAYDIUM)
  }

  const result = await observePondsolJupiterRoundTrip(
    "10000000",
    reader as never
  )

  assert.equal(result.liquidityClassification, "SAME_LIQUIDITY")
  assert.equal(result.tradeAllowed, false)
})

test("failed entry never requests exit", async () => {
  let calls = 0

  const reader = async () => {
    calls++
    throw new Error("QUOTE_UNAVAILABLE")
  }

  await assert.rejects(
    () => observePondsolJupiterRoundTrip(
      "10000000",
      reader as never
    ),
    /QUOTE_UNAVAILABLE/
  )

  assert.equal(calls, 1)
})

test("failed exit rejects the entire observation", async () => {
  let calls = 0

  const reader = async () => {
    calls++

    if (calls === 1) {
      return leg("10000000", "6388167", RAYDIUM)
    }

    throw new Error("EXIT_UNAVAILABLE")
  }

  await assert.rejects(
    () => observePondsolJupiterRoundTrip(
      "10000000",
      reader as never
    ),
    /EXIT_UNAVAILABLE/
  )

  assert.equal(calls, 2)
})
