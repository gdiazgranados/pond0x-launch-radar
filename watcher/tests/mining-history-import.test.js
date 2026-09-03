"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAuditReport } = require("../lib/mining-history-backfill");
const { buildImportedLedger, sha256, validateAuditReport } = require("../lib/mining-history-import");

function reviewedFixture() {
  const existingLedger = {
    version: "1.0.0",
    totalTransfers: 1,
    totalRecipients: 1,
    totalWPOND: 10,
    newTransfersThisSweep: 0,
    newRecipientsThisSweep: 0,
    recipients: [{ wallet: "wallet-a", totalWPOND: 10, transferCount: 1 }],
    seenTransferKeys: ["old:wallet-a:10"],
  };
  const candidates = [
    { signature: "old", timestamp: 1, to: "wallet-a", amount: 10, source: "SOLANA_PROGRAM_LIBRARY" },
    { signature: "new", timestamp: 2, to: "wallet-b", amount: 20, source: "SOLANA_PROGRAM_LIBRARY" },
  ];
  const report = buildAuditReport(existingLedger, candidates, "2026-01-01T00:00:00.000Z", {
    request: { pages: 20, pageSize: 100, transactionsFetched: 2000 },
    coverage: { historyExhausted: false, pageLimitReached: true },
  });
  return { existingLedger, report };
}

test("builds a reversible projected ledger with neutral baseline provenance", () => {
  const { existingLedger, report } = reviewedFixture();
  const imported = buildImportedLedger(existingLedger, report, {
    importedAt: "2026-01-02T00:00:00.000Z",
    reportSha256: "a".repeat(64),
  });

  assert.equal(imported.version, "1.1.0");
  assert.equal(imported.totalTransfers, 2);
  assert.equal(imported.totalRecipients, 2);
  assert.equal(imported.newTransfersThisSweep, 0);
  assert.equal(imported.newRecipientsThisSweep, 0);
  assert.equal(imported.historicalBaseline.scoreNeutral, true);
  assert.equal(imported.historicalBaseline.historyExhausted, false);
  assert.equal(imported.historicalBaseline.sourceReportSha256, "a".repeat(64));
  assert.equal(existingLedger.totalTransfers, 1);
});

test("rejects a stale input ledger instead of silently merging it", () => {
  const { existingLedger, report } = reviewedFixture();
  assert.throws(
    () => buildImportedLedger({ ...existingLedger, totalTransfers: 2 }, report, {
      importedAt: "2026-01-02T00:00:00.000Z",
      reportSha256: "b".repeat(64),
    }),
    /Input ledger changed after the audit/
  );
});

test("rejects incomplete or misleading audit contracts", () => {
  const { report } = reviewedFixture();
  assert.throws(() => validateAuditReport({ ...report, scoreNeutral: false }), /score-neutral/);
  assert.throws(
    () => validateAuditReport({ ...report, coverage: { historyExhausted: true, pageLimitReached: false } }),
    /bounded page-limit coverage/
  );
});

test("computes stable SHA-256 digests", () => {
  assert.equal(sha256("pond0x"), "8730742b61b5ca483ae0575f3bf7e8515407848f04760e6eaf7c9407aa6f3fef");
});
