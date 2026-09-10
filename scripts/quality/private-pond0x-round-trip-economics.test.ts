import test from "node:test"
import assert from "node:assert/strict"
import {
  evaluatePond0xRoundTripEconomics,
} from "../../src/private-alpha/pond0x-round-trip-economics"
import type {
  Pond0xUnderlyingQuote,
} from "../../src/private-alpha/pond0x-portal-observation"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

function ultraQuote(
  overrides: Partial<Pond0xUnderlyingQuote> = {}
): Pond0xUnderlyingQuote {
  return {
    provider: "JUPITER_ULTRA",
    sourceHost: "ultra-api.jup.ag",
    sourcePath: "/order",
    httpStatus: 200,
    inputMint: WRAPPED_SOL_MINT,
    inAmount: "10000000",
    outputMint: WPOND_MINT,
    outAmount: "6400000000",
    otherAmountThreshold: "6400000000",
    priceImpactPct: "0",
    swapMode: null,
    routeLabels: ["Raydium CLMM"],
    router: "metis",
    feeBps: 91,
    feeMint: WRAPPED_SOL_MINT,
    feeAmount: null,
    referralAccount:
      "9VjBWxGnJMzDaRxFHLWjDwRZcCpcH5cq8G5V4o1ymecj",
    referralFeeBps: 91,
    signatureFeeLamports: "0",
    prioritizationFeeLamports: "0",
    rentFeeLamports: "0",
    ...overrides,
  }
}

function evaluate(input: {
  entry?: Pond0xUnderlyingQuote | null
  exit?: Pond0xUnderlyingQuote | null
  entryDisplayed?: string | null
  exitDisplayed?: string | null
} = {}) {
  const entry = input.entry === undefined
    ? ultraQuote()
    : input.entry
  const exit = input.exit === undefined
    ? ultraQuote({
        inputMint: WPOND_MINT,
        inAmount: "6400000000",
        outputMint: WRAPPED_SOL_MINT,
        outAmount: "9800000",
        otherAmountThreshold: "9800000",
      })
    : input.exit

  return evaluatePond0xRoundTripEconomics({
    observedAt: "2026-09-10T21:00:00.000Z",
    entry: {
      observedAt: "2026-09-10T21:00:00.000Z",
      portalDisplayedAmountBaseUnits:
        input.entryDisplayed === undefined
          ? "6400000000"
          : input.entryDisplayed,
      quote: entry,
    },
    exit: {
      observedAt: "2026-09-10T21:00:10.000Z",
      portalDisplayedAmountBaseUnits:
        input.exitDisplayed === undefined
          ? "9800000"
          : input.exitDisplayed,
      quote: exit,
    },
  })
}

test("measures exact Pond0x round-trip break-even economics", () => {
  const result = evaluate({
    entry: ultraQuote({
      routeLabels: ["Raydium AMM", "Raydium CLMM"],
      router: "dflow",
    }),
  })

  assert.equal(result.status, "MEASURED")
  assert.equal(result.entryInputLamports, "10000000")
  assert.equal(
    result.acquiredTokenAmountBaseUnits,
    "6400000000"
  )
  assert.equal(
    result.exitInputTokenAmountBaseUnits,
    "6400000000"
  )
  assert.equal(result.exitOutputLamports, "9800000")
  assert.equal(result.roundTripLossLamports, "200000")
  assert.equal(result.roundTripLossBps, 200)
  assert.ok(
    Math.abs(
      (result.breakEvenAppreciationBps ?? 0) - 204.0816
    ) < 0.0001
  )
  assert.equal(result.totalDeclaredFeeBps, 182)
  assert.deepEqual(result.blockingReasons, [])
  assert.equal(result.walletConnected, false)
  assert.equal(result.transactionRequested, false)
})

test("blocks an exit that does not sell exact entry units", () => {
  const result = evaluate({
    exit: ultraQuote({
      inputMint: WPOND_MINT,
      inAmount: "6399999999",
      outputMint: WRAPPED_SOL_MINT,
      outAmount: "9800000",
      otherAmountThreshold: "9800000",
    }),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_EXIT_INPUT_NOT_EXACT_ENTRY_OUTPUT"
    )
  )
  assert.equal(result.roundTripLossBps, null)
})

test("fails closed on missing or unreconciled portal evidence", () => {
  const missing = evaluate({ exit: null })
  assert.equal(missing.status, "BLOCKED")
  assert.ok(
    missing.blockingReasons.includes(
      "PONDOX_EXIT_QUOTE_UNAVAILABLE"
    )
  )

  const mismatch = evaluate({
    entryDisplayed: "6399999999",
    exitDisplayed: "9799999",
  })
  assert.equal(mismatch.status, "BLOCKED")
  assert.ok(
    mismatch.blockingReasons.includes(
      "PONDOX_ENTRY_DISPLAY_MISMATCH"
    )
  )
  assert.ok(
    mismatch.blockingReasons.includes(
      "PONDOX_EXIT_DISPLAY_MISMATCH"
    )
  )
})


test("blocks foreign referral and stale quote combinations", () => {
  const foreign = evaluate({
    exit: ultraQuote({
      inputMint: WPOND_MINT,
      inAmount: "6400000000",
      outputMint: WRAPPED_SOL_MINT,
      outAmount: "9800000",
      otherAmountThreshold: "9800000",
      referralAccount: "foreign-referral",
    }),
  })
  assert.equal(foreign.status, "BLOCKED")
  assert.ok(
    foreign.blockingReasons.includes(
      "PONDOX_EXIT_REFERRAL_MISMATCH"
    )
  )

  const stale = evaluatePond0xRoundTripEconomics({
    observedAt: "2026-09-10T21:05:00.000Z",
    entry: {
      observedAt: "2026-09-10T21:00:00.000Z",
      portalDisplayedAmountBaseUnits: "6400000000",
      quote: ultraQuote(),
    },
    exit: {
      observedAt: "2026-09-10T21:05:00.000Z",
      portalDisplayedAmountBaseUnits: "9800000",
      quote: ultraQuote({
        inputMint: WPOND_MINT,
        inAmount: "6400000000",
        outputMint: WRAPPED_SOL_MINT,
        outAmount: "9800000",
        otherAmountThreshold: "9800000",
      }),
    },
  })
  assert.equal(stale.status, "BLOCKED")
  assert.ok(
    stale.blockingReasons.includes(
      "PONDOX_ROUND_TRIP_QUOTE_WINDOW_INVALID"
    )
  )
})


test("blocks a route outside observed Pond0x Raydium venues", () => {
  const result = evaluate({
    entry: ultraQuote({
      routeLabels: ["unknown venue"],
    }),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_ENTRY_ROUTE_NOT_ALLOWED"
    )
  )
})
