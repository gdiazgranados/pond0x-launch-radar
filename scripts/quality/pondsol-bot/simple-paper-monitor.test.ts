import { test } from "node:test"
import { strict as assert } from "node:assert"
import { assessPaperRoundTrip } from "../../../src/private-alpha/pondsol-bot/simple-paper-monitor"
import type { TimedPondsolRoundTrip } from "../../../src/private-alpha/pondsol-bot/timed-pondsol-roundtrip"
const now = 1_800_000_000_000
function cycle(last = "25500000", classification: TimedPondsolRoundTrip["liquidityClassification"] = "INDEPENDENT"): TimedPondsolRoundTrip {
  const make = (direction: "WSOL_TO_PONDSOL" | "PONDSOL_TO_WSOL", input: string, output: string, at: number) => ({
    observation: { direction, poolIds: [direction === "WSOL_TO_PONDSOL" ? "11111111111111111111111111111111" : "22222222222222222222222222222222"],
      quote: { routeId: "jupiter:synthetic", venueIds: ["11111111111111111111111111111111"], inputAmountBaseUnits: input,
        outputAmountBaseUnits: output, inputAmount: Number(input) / 1e9, outputAmount: Number(output) / 1e9, estimatedFeeUsd: 0 },
      tradeAllowed: false as const, mode: "SIMULATION" as const },
    requestStartedAtMs: at, responseReceivedAtMs: at + 10, durationMs: 10,
    tradeAllowed: false as const, mode: "SIMULATION" as const,
  })
  return { entry: make("WSOL_TO_PONDSOL", "25000000", "23000000", now - 100),
    exit: make("PONDSOL_TO_WSOL", "23000000", last, now - 80),
    liquidityClassification: classification, cycleDurationMs: 30,
    tradeAllowed: false, mode: "SIMULATION" }
}
test("profitable synthetic quotes stay paper-only", () => {
  const result = assessPaperRoundTrip(cycle(), 100, 0.01, 2.5, now)
  assert.equal(result.decision, "PAPER_CANDIDATE")
  assert.equal(result.tradeAllowed, false)
  assert.ok(Math.abs((result.estimatedNetUsd ?? 0) - 0.04) < 1e-8)
})
test("cost buffer can eliminate candidate", () => {
  assert.equal(assessPaperRoundTrip(cycle(), 100, 0.15, 2.5, now).decision, "NO_TRADE")
})
test("same liquidity is blocked", () => {
  assert.equal(assessPaperRoundTrip(cycle(undefined, "SAME_LIQUIDITY"), 100, 0.01, 2.5, now).decision, "NO_TRADE")
})
test("stale quotes are blocked", () => {
  assert.equal(assessPaperRoundTrip(cycle(), 100, 0.01, 2.5, now + 31_000).decision, "NO_TRADE")
})
test("missing or invalid price is blocked", () => {
  assert.equal(assessPaperRoundTrip(cycle(), 0, 0.01, 2.5, now).decision, "NO_TRADE")
})
test("mismatched amounts are blocked", () => {
  const c = cycle(); c.exit.observation.quote.inputAmountBaseUnits = "7000000"
  assert.equal(assessPaperRoundTrip(c, 100, 0.15, 10, now).decision, "NO_TRADE")
})
