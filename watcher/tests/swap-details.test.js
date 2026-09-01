"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDetails, responseEvidence } = require("../lib/swap-details");
const target = "https://www.pond0x.com/swap/solana";
const observation = (hour, status = "OBSERVED") => ({ target, checkedAt: `2026-08-31T${hour}:00:00Z`, status });
const controls = (label, disabled = false) => [{ role: "button", label, disabled, selected: null }];

test("new instrumentation starts a baseline; ordering and numeric counters do not create changes", () => {
  const first = buildDetails(undefined, observation("10"), controls("Swap 1,200.50 SOL"), ["GET /api/modes → 200"], false);
  assert.equal(first.comparison.state, "BASELINE");
  const next = buildDetails(first, observation("11"), controls("Swap 2,000.00 SOL"), ["GET /api/modes → 200", "GET /api/modes → 200"], false);
  assert.equal(next.comparison.state, "UNCHANGED");
  assert.equal(next.history.length, 2);
});
test("control availability and response changes retain before/after evidence", () => {
  const first = buildDetails(null, observation("10"), controls("Claim", true), ["GET /api/claim → 404"], false);
  const next = buildDetails(first, observation("11"), controls("Claim"), ["GET /api/claim → 200"], false);
  assert.equal(next.comparison.state, "CHANGED");
  assert.equal(JSON.parse(next.comparison.controls.removed[0]).disabled, true);
  assert.equal(JSON.parse(next.comparison.controls.added[0]).disabled, false);
  assert.deepEqual(next.comparison.responses.removed, ["GET /api/claim → 404"]);
  assert.equal(next.changes.length, 1);
});
test("failed or truncated captures do not replace the successful baseline", () => {
  const first = buildDetails(null, observation("10"), controls("Swap"), [], false);
  for (const [status, truncated] of [["CAPTURE_ERROR", false], ["OBSERVED", true]]) {
    const failed = buildDetails(first, observation("11", status), [], [], truncated);
    assert.equal(failed.lastSuccessful, first.lastSuccessful);
    assert.notEqual(failed.comparison.state, "CHANGED");
    const recovery = buildDetails(failed, observation("12"), controls("Swap"), [], false);
    assert.equal(recovery.comparison.state, "UNCHANGED");
  }
  assert.equal(buildDetails(first, observation("18"), controls("Claim"), [], false).comparison.state, "BASELINE");
});
test("responses exclude other origins and strip queries and fragments", () => {
  assert.equal(responseEvidence("https://third.party/api?token=secret", target, "GET", 200), null);
  assert.equal(responseEvidence("https://www.pond0x.com/api/modes?token=secret#secret", target, "GET", 200), "GET /api/modes → 200");
});
test("change history remains bounded and survives unchanged observations", () => {
  let report;
  for (let i = 0; i < 100; i++) report = buildDetails(report, { target, status: "OBSERVED", checkedAt: new Date(Date.UTC(2026, 7, 31, 0, i)).toISOString() }, controls(i % 2 ? "Claim" : "Swap"), [], false);
  assert.equal(report.history.length, 48);
  assert.equal(report.changes.length, 48);
  const next = buildDetails(report, { target, status: "OBSERVED", checkedAt: "2026-08-31T02:00:00Z" }, controls("Claim"), [], false);
  assert.equal(next.comparison.state, "UNCHANGED");
  assert.equal(next.changes.length, 48);
});
