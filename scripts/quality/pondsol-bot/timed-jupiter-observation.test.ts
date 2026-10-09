import assert from "node:assert/strict"
import test from "node:test"

import {
  readTimedPondsolJupiterQuote,
} from "../../../src/private-alpha/pondsol-bot/timed-jupiter-observation"

const POOL = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"

function quote() {
  return {
    routeId: "jupiter:synthetic",
    venueIds: [POOL],
    inputAmountBaseUnits: "10000000",
    outputAmountBaseUnits: "6388167",
    inputAmount: 0.01,
    outputAmount: 0.006388167,
    estimatedFeeUsd: 0,
  }
}

function clockValues(values: number[]) {
  let index = 0

  return () => values[index++]
}

test("records request and response timestamps", async () => {
  const result = await readTimedPondsolJupiterQuote(
    "WSOL_TO_PONDSOL",
    "10000000",
    async () => quote(),
    clockValues([100000, 100250])
  )

  assert.equal(result.requestStartedAtMs, 100000)
  assert.equal(result.responseReceivedAtMs, 100250)
  assert.equal(result.durationMs, 250)
  assert.equal(result.tradeAllowed, false)
})

test("rejects responses slower than quote age limit", async () => {
  await assert.rejects(
    () => readTimedPondsolJupiterQuote(
      "WSOL_TO_PONDSOL",
      "10000000",
      async () => quote(),
      clockValues([100000, 131000])
    ),
    /QUOTE_RESPONSE_TOO_SLOW/
  )
})

test("rejects backwards clock", async () => {
  await assert.rejects(
    () => readTimedPondsolJupiterQuote(
      "WSOL_TO_PONDSOL",
      "10000000",
      async () => quote(),
      clockValues([100000, 99999])
    ),
    /INVALID_QUOTE_OBSERVATION_CLOCK/
  )
})

test("does not fabricate timestamp after failed quote", async () => {
  let calls = 0

  const clock = () => {
    calls++
    return 100000
  }

  await assert.rejects(
    () => readTimedPondsolJupiterQuote(
      "WSOL_TO_PONDSOL",
      "10000000",
      async () => {
        throw new Error("PROVIDER_UNAVAILABLE")
      },
      clock
    ),
    /PROVIDER_UNAVAILABLE/
  )

  assert.equal(calls, 1)
})
