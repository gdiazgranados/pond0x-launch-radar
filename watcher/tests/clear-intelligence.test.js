const test = require("node:test");
const assert = require("node:assert/strict");
const { buildClearIntelligence, quoteState } = require("../lib/clear-intelligence");

test("classifies the observed PAPER rail without creating a launch score", () => {
  const output = buildClearIntelligence({
    generatedAt: "2026-09-04T20:00:00.000Z",
    paperSupply: 14177.919116,
    ccpuSupply: 14362.240341,
    ccpuReserveBalance: 14178.416141,
    vaultUsdc: 12000,
    issuanceEvents: [{ signature: "example" }],
    quotes: { paperToUsdc: { outAmount: "0" } },
  });

  assert.equal(output.status, "LIVE_OBSERVATION");
  assert.equal(output.state, "ISSUANCE_OBSERVED");
  assert.equal(output.scoreNeutral, true);
  assert.equal(output.accounting.reservePaperDelta, 0.497025);
  assert.equal(output.accounting.supplyGap, 184.321225);
  assert.equal(output.activity.redemptionObserved, false);
  assert.equal(output.capabilities.find((item) => item.id === "redeem").state, "UNPROVEN");
});

test("separates quote availability from failed or empty probes", () => {
  assert.equal(quoteState(null), "NOT_TESTED");
  assert.equal(quoteState({ error: "NO_ROUTE" }), "NOT_TESTED");
  assert.equal(quoteState({ outAmount: "0" }), "NO_QUOTE");
  assert.equal(quoteState({ outAmount: "99830000" }), "QUOTE_AVAILABLE");
});
