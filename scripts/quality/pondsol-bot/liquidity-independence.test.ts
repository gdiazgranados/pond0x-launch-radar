import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyLiquidityIndependence,
} from "../../../src/private-alpha/pondsol-bot/liquidity-independence"

const RAYDIUM = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const METEORA = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

test("same pool is not independent liquidity", () => {
  const result = classifyLiquidityIndependence(
    [RAYDIUM],
    [RAYDIUM]
  )

  assert.equal(result.classification, "SAME_LIQUIDITY")
  assert.deepEqual(result.sharedPoolIds, [RAYDIUM])
  assert.equal(result.tradeAllowed, false)
})

test("distinct reported pools are classified independently", () => {
  const result = classifyLiquidityIndependence(
    [RAYDIUM],
    [METEORA]
  )

  assert.equal(result.classification, "INDEPENDENT")
  assert.equal(result.tradeAllowed, false)
})

test("overlapping multi-hop routes are not independent", () => {
  const result = classifyLiquidityIndependence(
    [RAYDIUM, METEORA],
    [METEORA]
  )

  assert.equal(result.classification, "SAME_LIQUIDITY")
})

test("missing pool identity fails closed", () => {
  const result = classifyLiquidityIndependence([], [METEORA])
  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.tradeAllowed, false)
})

test("invalid pool identity fails closed", () => {
  const result = classifyLiquidityIndependence(
    ["jupiter:Raydium CLMM"],
    [METEORA]
  )

  assert.equal(result.classification, "UNKNOWN")
})

test("malformed inputs fail closed", () => {
  const result = classifyLiquidityIndependence(
    null,
    [METEORA]
  )

  assert.equal(result.classification, "UNKNOWN")
})
