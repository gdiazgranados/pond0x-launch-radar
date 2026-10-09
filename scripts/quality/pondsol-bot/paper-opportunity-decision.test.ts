import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluatePaperOpportunity,
  type PaperOpportunityInput,
} from "../../../src/private-alpha/pondsol-bot/paper-opportunity-decision"

const RAYDIUM = "H2ZuDrR5rvRuYkaqDXikLy1hmpc2Wqm57U9MyGXb1R1D"
const METEORA = "DTwb61H1cqjR7aqgpnCTUFzoQG9H72pC7mdUvHtonKqy"

const now = Date.now()

function validInput(): PaperOpportunityInput {
  return {
    entry: {
      routeId: "jupiter:Raydium",
      inputAsset: "USD",
      outputAsset: "pondSOL",
      inputAmount: 10,
      outputAmount: 100,
      quotedAtMs: now,
      estimatedFeeUsd: 0.01,
    },
    exit: {
      routeId: "meteora:DLMM",
      inputAsset: "pondSOL",
      outputAsset: "USD",
      inputAmount: 100,
      outputAmount: 10.5,
      quotedAtMs: now,
      estimatedFeeUsd: 0.01,
    },
    entryLiquidityQuotes: [
      { input: "WSOL", status: "QUOTED", outAmount: "1000" },
      { input: "pondSOL", status: "QUOTED", outAmount: "1000" },
    ],
    exitLiquidityQuotes: [
      { input: "WSOL", status: "QUOTED", outAmount: "1000" },
      { input: "pondSOL", status: "QUOTED", outAmount: "1000" },
    ],
    entryPoolIds: [RAYDIUM],
    exitPoolIds: [METEORA],
    nowMs: now,
    networkCostUsd: 0.01,
    worstCaseLossUsd: 1,
    state: {
      availableCapitalUsd: 50,
      dailyPnlUsd: 0,
      totalPnlUsd: 0,
      openPositions: 0,
    },
  }
}

test("valid synthetic inputs produce paper candidate only", () => {
  const result = evaluatePaperOpportunity(validInput())
  assert.equal(result.decision, "PAPER_CANDIDATE")
  assert.equal(result.tradeAllowed, false)
  assert.equal(result.mode, "SIMULATION")
})

test("shared liquidity blocks opportunity", () => {
  const input = validInput()
  input.exitPoolIds = [RAYDIUM]

  const result = evaluatePaperOpportunity(input)
  assert.equal(result.decision, "NO_TRADE")
  assert.ok(result.reasons.includes("LIQUIDITY_NOT_INDEPENDENT"))
})

test("one-way liquidity blocks opportunity", () => {
  const input = validInput()
  input.exitLiquidityQuotes = [
    { input: "WSOL", status: "QUOTED", outAmount: "1000" },
    { input: "pondSOL", status: "NO_BIN_ARRAYS" },
  ]

  const result = evaluatePaperOpportunity(input)
  assert.equal(result.decision, "NO_TRADE")
  assert.ok(result.reasons.includes("EXIT_LIQUIDITY_UNVERIFIED"))
})

test("unprofitable quotes are rejected by original algorithm", () => {
  const input = validInput()
  input.exit!.outputAmount = 9.5

  const result = evaluatePaperOpportunity(input)
  assert.equal(result.decision, "NO_TRADE")
  assert.ok(result.reasons.includes("BELOW_MIN_NET_PROFIT"))
})

test("risk limits are enforced by original trade guard", () => {
  const input = validInput()
  input.state.openPositions = 1

  const result = evaluatePaperOpportunity(input)
  assert.equal(result.decision, "NO_TRADE")
  assert.ok(result.reasons.includes("MAX_OPEN_POSITIONS"))
})

test("oversized trades are blocked", () => {
  const input = validInput()
  input.entry!.inputAmount = 20

  const result = evaluatePaperOpportunity(input)
  assert.equal(result.decision, "NO_TRADE")
  assert.ok(result.reasons.includes("INVALID_TRADE_SIZE"))
})

test("stale quotes are blocked", () => {
  const input = validInput()
  input.entry!.quotedAtMs = now - 60_000

  const result = evaluatePaperOpportunity(input)
  assert.equal(result.decision, "NO_TRADE")
  assert.ok(result.reasons.includes("STALE_QUOTE"))
})
