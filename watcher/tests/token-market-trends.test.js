const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTrends } = require("../token-market-trends");

function token(pairAddress, priceUsd, liquidity, volume, quote = "USDC") {
  const pair = {
    pairAddress,
    dexId: "test-dex",
    quoteToken: { symbol: quote },
    priceUsd
  };
  return {
    id: "paper",
    symbol: "PAPER",
    chain: "solana",
    status: "OBSERVED",
    primaryMarket: pair,
    topMarkets: [pair],
    aggregateObservedLiquidityUsd: liquidity,
    aggregateObservedVolume24hUsd: volume
  };
}

test("same pair produces comparable price, liquidity and rolling-volume changes", () => {
  const result = buildTrends({ observations: [
    { generatedAt: "2026-09-05T00:00:00.000Z", tokens: [token("pair-a", 1, 100, 50)] },
    { generatedAt: "2026-09-05T01:00:00.000Z", tokens: [token("pair-a", 1.1, 120, 40)] }
  ] });
  const window = result.tokens.paper.windows["1h"];
  assert.equal(window.marketContinuity.state, "SAME_PRIMARY_PAIR");
  assert.equal(Math.round(window.changes.samePairPriceUsdPct), 10);
  assert.equal(Math.round(window.changes.aggregateObservedLiquidityUsdPct), 20);
  assert.equal(Math.round(window.changes.aggregateObservedVolume24hUsdPct), -20);
  assert.deepEqual(window.anomalies, []);
});

test("pool replacement is flagged and suppresses a false price comparison", () => {
  const result = buildTrends({ observations: [
    { generatedAt: "2026-09-05T00:00:00.000Z", tokens: [token("paper-sol", 0.07, 20, 5, "SOL")] },
    { generatedAt: "2026-09-05T01:00:00.000Z", tokens: [token("paper-usdc", 1, 1200, 80)] }
  ] });
  const window = result.tokens.paper.windows["1h"];
  assert.equal(window.marketContinuity.state, "NOT_COMPARABLE");
  assert.equal(window.changes.samePairPriceUsdPct, null);
  assert.deepEqual(window.anomalies, [
    "PRIMARY_MARKET_CHANGED",
    "CURRENT_PAIR_NOT_PRESENT_IN_BASELINE"
  ]);
});

test("missing lookback history remains explicit", () => {
  const result = buildTrends({ observations: [
    { generatedAt: "2026-09-05T01:00:00.000Z", tokens: [token("pair-a", 1, 100, 50)] }
  ] });
  assert.equal(result.tokens.paper.windows["24h"].status, "INSUFFICIENT_HISTORY");
});
