"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRecipientLedger } = require("../chain-intelligence");

const baseline = {
  classification: "BOUNDED_EXTERNAL_CLAIM_CANDIDATE_BASELINE",
  scoreNeutral: true,
  sourceReportSha256: "reviewed-audit-sha256",
  historyExhausted: false,
  pageLimitReached: true,
};

test("preserves historical baseline provenance across ordinary sweeps", () => {
  const existing = {
    version: "1.1.0",
    totalRecipients: 1,
    totalTransfers: 1,
    totalWPOND: 100,
    lastObservedAt: "2026-08-27T15:40:03.000Z",
    recipients: [{
      wallet: "recipient-one",
      totalWPOND: 100,
      transferCount: 1,
      firstSeenAt: "2026-08-27T15:40:03.000Z",
      lastSeenAt: "2026-08-27T15:40:03.000Z",
      lastSignature: "signature-one",
      frequencyClass: "NEW",
    }],
    seenTransferKeys: ["signature-one:recipient-one:100"],
    historicalBaseline: baseline,
  };

  const result = buildRecipientLedger(
    existing,
    [],
    "2026-09-03T04:00:00.000Z"
  );

  assert.equal(result.version, "1.1.0");
  assert.deepEqual(result.historicalBaseline, baseline);
  assert.notEqual(result.historicalBaseline, existing.historicalBaseline);
  assert.equal(result.newTransfersThisSweep, 0);
  assert.equal(result.newRecipientsThisSweep, 0);
  assert.equal(result.totalTransfers, 1);
});

test("keeps new ledgers on version 1.0.0 without inventing provenance", () => {
  const result = buildRecipientLedger(
    null,
    [],
    "2026-09-03T04:00:00.000Z"
  );

  assert.equal(result.version, "1.0.0");
  assert.equal("historicalBaseline" in result, false);
});
