"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAuditReport,
  extractExternalClaims,
  simulateLedgerMerge,
} = require("../lib/mining-history-backfill");

const entities = {
  distributor: "distributor",
  rewardWallet: "reward-wallet",
  wpondMint: "wpond",
};

function transaction(signature, transfer, overrides = {}) {
  return {
    signature,
    timestamp: 1_700_000_000,
    source: "SYSTEM_PROGRAM",
    tokenTransfers: [transfer],
    ...overrides,
  };
}

test("extracts only successful external wPOND distributor transfers", () => {
  const valid = { mint: "wpond", fromUserAccount: "distributor", toUserAccount: "external", tokenAmount: 25 };
  const transactions = [
    transaction("valid", valid),
    transaction("reward", { ...valid, toUserAccount: "reward-wallet" }),
    transaction("other-mint", { ...valid, mint: "other" }),
    transaction("wrong-source", { ...valid, fromUserAccount: "someone-else" }),
    transaction("failed", valid, { transactionError: { error: "failed" } }),
  ];

  const claims = extractExternalClaims(transactions, entities);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].signature, "valid");
  assert.equal(claims[0].to, "external");
});

test("simulates a merge without mutating the input ledger", () => {
  const ledger = {
    totalRecipients: 1,
    totalTransfers: 1,
    totalWPOND: 10,
    recipients: [{ wallet: "wallet-a", totalWPOND: 10, transferCount: 1 }],
    seenTransferKeys: ["old:wallet-a:10"],
  };
  const snapshot = structuredClone(ledger);
  const claims = [
    { signature: "old", to: "wallet-a", amount: 10 },
    { signature: "new-a", to: "wallet-a", amount: 20, time: "2026-01-01T00:00:00.000Z" },
    { signature: "new-b", to: "wallet-b", amount: 30, time: "2026-01-02T00:00:00.000Z" },
  ];

  const result = simulateLedgerMerge(ledger, claims, "2026-01-03T00:00:00.000Z");
  assert.deepEqual(ledger, snapshot);
  assert.equal(result.summary.duplicates, 1);
  assert.equal(result.summary.newTransfers, 2);
  assert.equal(result.summary.newRecipients, 1);
  assert.equal(result.summary.projectedTransfers, 3);
  assert.equal(result.summary.projectedRecipients, 2);
  assert.equal(result.summary.projectedWPOND, 60);
});

test("is idempotent when the projected ledger is simulated again", () => {
  const claim = { signature: "same", to: "wallet-a", amount: 50, time: "2026-01-01T00:00:00.000Z" };
  const first = simulateLedgerMerge({}, [claim], "2026-01-02T00:00:00.000Z");
  const second = simulateLedgerMerge(first.projectedLedger, [claim], "2026-01-03T00:00:00.000Z");

  assert.equal(first.summary.newTransfers, 1);
  assert.equal(second.summary.newTransfers, 0);
  assert.equal(second.summary.duplicates, 1);
  assert.equal(second.summary.projectedTransfers, 1);
  assert.equal(second.summary.projectedWPOND, 50);
});

test("builds an auditable report with bounded coverage and normalized keys", () => {
  const claims = [
    {
      signature: "newer",
      timestamp: 1_700_000_100,
      time: "2023-11-14T22:15:00.000Z",
      from: "distributor",
      to: "wallet-b",
      amount: 20,
      source: "SYSTEM_PROGRAM",
    },
    {
      signature: "older",
      timestamp: 1_700_000_000,
      time: "2023-11-14T22:13:20.000Z",
      from: "distributor",
      to: "wallet-a",
      amount: 10,
      source: "SYSTEM_PROGRAM",
    },
  ];
  const report = buildAuditReport({}, claims, "2026-01-01T00:00:00.000Z", {
    request: { pages: 20, transactionsFetched: 2000 },
    coverage: { historyExhausted: false, pageLimitReached: true },
  });

  assert.equal(report.mode, "DRY_RUN_AUDIT");
  assert.equal(report.ledgerWritesPerformed, false);
  assert.equal(report.integrity.normalizedClaims, 2);
  assert.equal(report.integrity.uniqueTransferKeys, 2);
  assert.equal(report.integrity.duplicateCandidateKeys, 0);
  assert.equal(report.integrity.nonPositiveAmountClaims, 0);
  assert.equal(report.candidates[0].signature, "newer");
  assert.equal(report.candidates[1].transferKey, "older:wallet-a:10");
  assert.equal(report.coverage.pageLimitReached, true);
  assert.equal(report.projectedLedger.totalTransfers, 2);
});
