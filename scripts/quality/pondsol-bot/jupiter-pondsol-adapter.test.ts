import assert from "node:assert/strict"
import test from "node:test"

import {
  readPondsolJupiterQuote,
  validatePondsolJupiterQuote,
  WSOL_MINT,
} from "../../../src/private-alpha/pondsol-bot/jupiter-pondsol-adapter"
import { PONDSOL_TOKEN_IDENTITY } from "../../../src/private-alpha/pondsol-bot/pondsol-token-identity"

const POOL = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"

function quote() {
  return {
    routeId: "jupiter:Raydium",
    venueIds: [POOL],
    inputAmountBaseUnits: "10000000",
    outputAmountBaseUnits: "6388167",
    inputAmount: 0.01,
    outputAmount: 0.006388167,
    estimatedFeeUsd: 0,
  }
}

test("accepts a consistent Jupiter pondSOL observation", () => {
  const result = validatePondsolJupiterQuote(
    "WSOL_TO_PONDSOL",
    "10000000",
    quote()
  )

  assert.deepEqual(result.poolIds, [POOL])
  assert.equal(result.tradeAllowed, false)
})

test("rejects mismatched input amounts", () => {
  assert.throws(
    () => validatePondsolJupiterQuote(
      "WSOL_TO_PONDSOL",
      "20000000",
      quote()
    ),
    /PONDSOL_INPUT_AMOUNT_MISMATCH/
  )
})

test("rejects missing pool identities", () => {
  assert.throws(
    () => validatePondsolJupiterQuote(
      "WSOL_TO_PONDSOL",
      "10000000",
      { ...quote(), venueIds: [] }
    ),
    /INVALID_PONDSOL_POOL_IDS/
  )
})

test("rejects duplicate pool identities", () => {
  assert.throws(
    () => validatePondsolJupiterQuote(
      "WSOL_TO_PONDSOL",
      "10000000",
      { ...quote(), venueIds: [POOL, POOL] }
    ),
    /DUPLICATE_PONDSOL_POOL_IDS/
  )
})

test("rejects inconsistent human units", () => {
  assert.throws(
    () => validatePondsolJupiterQuote(
      "WSOL_TO_PONDSOL",
      "10000000",
      { ...quote(), outputAmount: 999 }
    ),
    /PONDSOL_UNIT_MISMATCH/
  )
})

test("uses exact pondSOL mint and decimals", async () => {
  let captured: unknown

  const reader = async (request: unknown) => {
    captured = request
    return quote()
  }

  const result = await readPondsolJupiterQuote(
    "WSOL_TO_PONDSOL",
    "10000000",
    reader as typeof import("../../../src/private-alpha/read-only-quote-clients").readJupiterQuote
  )

  assert.equal(
    (captured as { inputToken: string }).inputToken,
    WSOL_MINT
  )
  assert.equal(
    (captured as { outputToken: string }).outputToken,
    PONDSOL_TOKEN_IDENTITY.mint
  )
  assert.equal(
    (captured as { inputDecimals: number }).inputDecimals,
    9
  )
  assert.equal(result.tradeAllowed, false)
})

test("rejects invalid direction", async () => {
  await assert.rejects(
    () => readPondsolJupiterQuote(
      "INVALID" as "WSOL_TO_PONDSOL",
      "10000000",
      async () => quote()
    ),
    /INVALID_PONDSOL_DIRECTION/
  )
})
