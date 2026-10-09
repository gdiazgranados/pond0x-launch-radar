import assert from "node:assert/strict"
import { test } from "node:test"

import {
  classifyPoolLiquidity,
  type LiquidityQuote,
} from "../../../src/private-alpha/pondsol-bot/liquidity-classifier"

const noBins: LiquidityQuote[] = [
  { input: "WSOL", status: "NO_BIN_ARRAYS" },
  { input: "pondSOL", status: "NO_BIN_ARRAYS" },
]

test("Meteora pools without bin arrays", () => {
  const result = classifyPoolLiquidity(noBins)

  assert.equal(result.classification, "NO_QUOTE")
  assert.equal(result.tradeAllowed, false)
})

test("Meteora one-way pool", () => {
  const result = classifyPoolLiquidity([
    {
      input: "WSOL",
      status: "QUOTED",
      outAmount: "2247374",
    },
    {
      input: "pondSOL",
      status: "FAILED",
      error: "Insufficient liquidity in binArrays for swapQuote",
    },
  ])

  assert.equal(result.classification, "ONE_WAY_ONLY")
  assert.equal(result.buy, "QUOTABLE")
  assert.equal(result.sell, "INSUFFICIENT_LIQUIDITY")
  assert.equal(result.tradeAllowed, false)
})

test("two-way quotes never authorize execution", () => {
  const result = classifyPoolLiquidity([
    {
      input: "WSOL",
      status: "QUOTED",
      outAmount: "1000",
    },
    {
      input: "pondSOL",
      status: "QUOTED",
      outAmount: "1000",
    },
  ])

  assert.equal(result.classification, "TWO_WAY_QUOTABLE")
  assert.equal(result.tradeAllowed, false)
})

test("missing observations remain unknown", () => {
  const result = classifyPoolLiquidity([])

  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.tradeAllowed, false)
})

test("malformed quoted output fails closed", () => {
  const result = classifyPoolLiquidity([
    {
      input: "WSOL",
      status: "QUOTED",
      outAmount: "not-a-number",
    },
    {
      input: "pondSOL",
      status: "NO_BIN_ARRAYS",
    },
  ])

  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.tradeAllowed, false)
})

test("generic SDK failure is not insufficient liquidity", () => {
  const result = classifyPoolLiquidity([
    {
      input: "WSOL",
      status: "FAILED",
      error: "RPC timeout",
    },
    {
      input: "pondSOL",
      status: "NO_BIN_ARRAYS",
    },
  ])

  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.tradeAllowed, false)
})

test("explicit insufficient liquidity is classified", () => {
  const result = classifyPoolLiquidity([
    {
      input: "WSOL",
      status: "FAILED",
      error: "Insufficient liquidity in binArrays for swapQuote",
    },
    {
      input: "pondSOL",
      status: "NO_BIN_ARRAYS",
    },
  ])

  assert.equal(
    result.classification,
    "INSUFFICIENT_LIQUIDITY"
  )
  assert.equal(result.tradeAllowed, false)
})

test("zero output is not a valid quote", () => {
  const result = classifyPoolLiquidity([
    {
      input: "WSOL",
      status: "QUOTED",
      outAmount: "0",
    },
    {
      input: "pondSOL",
      status: "QUOTED",
      outAmount: "1000",
    },
  ])

  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.buy, "UNKNOWN")
  assert.equal(result.tradeAllowed, false)
})

test("RPC failure cannot be hidden by a valid quote", () => {
  const result = classifyPoolLiquidity([
    { input: "WSOL", status: "QUOTED", outAmount: "1000" },
    { input: "WSOL", status: "FAILED", error: "RPC timeout" },
    { input: "pondSOL", status: "QUOTED", outAmount: "1000" },
  ])

  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.tradeAllowed, false)
})

test("unknown direction cannot become one-way liquidity", () => {
  const result = classifyPoolLiquidity([
    { input: "WSOL", status: "QUOTED", outAmount: "1000" },
    { input: "pondSOL", status: "FAILED", error: "RPC timeout" },
  ])

  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.tradeAllowed, false)
})

test("mixed successful and insufficient quotes fail closed", () => {
  const result = classifyPoolLiquidity([
    { input: "WSOL", status: "QUOTED", outAmount: "1000" },
    {
      input: "WSOL",
      status: "FAILED",
      error: "Insufficient liquidity in binArrays for swapQuote",
    },
    { input: "pondSOL", status: "QUOTED", outAmount: "1000" },
  ])

  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.tradeAllowed, false)
})
