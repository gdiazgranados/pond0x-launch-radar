import assert from "node:assert/strict"
import { test } from "node:test"

import {
  evaluateQuoteOpportunity,
  type QuoteLeg,
} from "../../../src/private-alpha/pondsol-bot/quote-adapter"

const now = 1_800_000_000_000

const entry: QuoteLeg = {
  routeId: "synthetic-entry",
  inputAsset: "USD",
  outputAsset: "pondSOL",
  inputAmount: 10,
  outputAmount: 2,
  quotedAtMs: now - 1000,
  estimatedFeeUsd: 0.02,
}

const exit: QuoteLeg = {
  routeId: "synthetic-exit",
  inputAsset: "pondSOL",
  outputAsset: "USD",
  inputAmount: 2,
  outputAmount: 10.30,
  quotedAtMs: now - 1000,
  estimatedFeeUsd: 0.02,
}

test("valid synthetic opportunity", () => {
  const result = evaluateQuoteOpportunity(
    entry, exit, now, 0.01
  )

  assert.equal(result.decision, "SIMULATE")
  assert.ok(result.estimatedNetProfitUsd! > 0)
})

test("missing exit quote", () => {
  assert.equal(
    evaluateQuoteOpportunity(entry, null, now, 0.01).decision,
    "NO_TRADE"
  )
})

test("stale quote", () => {
  const result = evaluateQuoteOpportunity(
    { ...entry, quotedAtMs: now - 31_000 },
    exit,
    now,
    0.01
  )

  assert.deepEqual(result.reasons, ["STALE_QUOTE"])
})

test("asset mismatch", () => {
  const result = evaluateQuoteOpportunity(
    entry,
    { ...exit, inputAsset: "wPOND" },
    now,
    0.01
  )

  assert.deepEqual(result.reasons, ["ROUTE_ASSET_MISMATCH"])
})

test("amount mismatch", () => {
  const result = evaluateQuoteOpportunity(
    entry,
    { ...exit, inputAmount: 1.5 },
    now,
    0.01
  )

  assert.deepEqual(result.reasons, ["ROUTE_AMOUNT_MISMATCH"])
})

test("negative net profit remains visible", () => {
  const result = evaluateQuoteOpportunity(
    entry,
    { ...exit, outputAmount: 9.50 },
    now,
    0.01
  )

  assert.ok(result.estimatedNetProfitUsd! < 0)
  assert.equal(result.decision, "NO_TRADE")
})

test("below minimum net profit is rejected", () => {
  const result = evaluateQuoteOpportunity(
    entry,
    { ...exit, outputAmount: 10.10 },
    now,
    0.01
  )

  assert.equal(result.decision, "NO_TRADE")
  assert.deepEqual(result.reasons, ["BELOW_MIN_NET_PROFIT"])
})

test("future quote is rejected", () => {
  const result = evaluateQuoteOpportunity(
    { ...entry, quotedAtMs: now + 1000 },
    exit,
    now,
    0.01
  )

  assert.deepEqual(result.reasons, ["FUTURE_QUOTE"])
})

test("unsupported numeraire is rejected", () => {
  const result = evaluateQuoteOpportunity(
    { ...entry, inputAsset: "SOL" },
    { ...exit, outputAsset: "SOL" },
    now,
    0.01
  )

  assert.deepEqual(result.reasons, ["UNSUPPORTED_NUMERAIRE"])
})
test("malformed route identity must fail closed", () => {
  const malformed = {
    ...entry,
    routeId: null,
  } as unknown as QuoteLeg

  let result

  try {
    result = evaluateQuoteOpportunity(
      malformed, exit, now, 0.01
    )
  } catch {
    assert.fail("Adapter must not throw on malformed quote")
  }

  assert.equal(result.decision, "NO_TRADE")
})
test("malformed input asset must fail closed", () => {
  const malformed = {
    ...entry,
    inputAsset: null,
  } as unknown as QuoteLeg

  const result = evaluateQuoteOpportunity(
    malformed, exit, now, 0.01
  )

  assert.equal(result.decision, "NO_TRADE")
  assert.deepEqual(result.reasons, ["INVALID_QUOTE"])
})

test("malformed output asset must fail closed", () => {
  const malformed = {
    ...exit,
    outputAsset: 123,
  } as unknown as QuoteLeg

  const result = evaluateQuoteOpportunity(
    entry, malformed, now, 0.01
  )

  assert.equal(result.decision, "NO_TRADE")
  assert.deepEqual(result.reasons, ["INVALID_QUOTE"])
})