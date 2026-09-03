"use strict";

const crypto = require("node:crypto");
const { simulateLedgerMerge } = require("./mining-history-backfill");

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sha256(serialized) {
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function validateAuditReport(report) {
  const errors = [];
  const candidates = Array.isArray(report?.candidates) ? report.candidates : [];
  const integrity = report?.integrity || {};

  if (report?.version !== "1.1.0") errors.push("audit version must be 1.1.0");
  if (report?.mode !== "DRY_RUN_AUDIT") errors.push("audit mode must be DRY_RUN_AUDIT");
  if (report?.ledgerWritesPerformed !== false) errors.push("audit must declare zero ledger writes");
  if (report?.scoreNeutral !== true) errors.push("audit must be score-neutral");
  if (report?.request?.pages !== 20) errors.push("audit must use the reviewed 20-page scope");
  if (report?.request?.transactionsFetched !== 2000) errors.push("audit must contain 2,000 fetched transactions");
  if (report?.coverage?.pageLimitReached !== true) errors.push("audit must declare bounded page-limit coverage");
  if (report?.coverage?.historyExhausted !== false) errors.push("audit must not claim complete history");
  if (number(integrity.normalizedClaims) !== candidates.length) errors.push("normalized claim count mismatch");
  if (number(integrity.uniqueTransferKeys) !== candidates.length) errors.push("candidate keys are not unique");
  if (number(integrity.duplicateCandidateKeys) !== 0) errors.push("audit contains duplicate candidate keys");
  if (number(integrity.missingTimestampClaims) !== 0) errors.push("audit contains missing timestamps");
  if (number(integrity.nonPositiveAmountClaims) !== 0) errors.push("audit contains non-positive amounts");
  if (number(report?.summary?.candidateClaims) !== candidates.length) errors.push("summary candidate count mismatch");

  if (errors.length) throw new Error(`Invalid audit report: ${errors.join("; ")}`);
  return report;
}

function buildImportedLedger(existingLedger, report, { importedAt, reportSha256 }) {
  validateAuditReport(report);

  if (number(existingLedger?.totalTransfers) !== number(report.summary.existingTransfers) ||
      number(existingLedger?.totalRecipients) !== number(report.summary.existingRecipients)) {
    throw new Error("Input ledger changed after the audit; generate a fresh dry-run report");
  }

  const simulation = simulateLedgerMerge(existingLedger, report.candidates, importedAt);
  const expected = report.summary;
  if (simulation.summary.projectedTransfers !== number(expected.projectedTransfers) ||
      simulation.summary.projectedRecipients !== number(expected.projectedRecipients) ||
      simulation.summary.projectedWPOND !== number(expected.projectedWPOND)) {
    throw new Error("Recomputed ledger totals do not match the reviewed audit projection");
  }

  return {
    ...simulation.projectedLedger,
    version: "1.1.0",
    updatedAt: importedAt,
    newTransfersThisSweep: 0,
    newRecipientsThisSweep: 0,
    historicalBaseline: {
      classification: "BOUNDED_EXTERNAL_CLAIM_CANDIDATE_BASELINE",
      scoreNeutral: true,
      importedAt,
      sourceReportSha256: reportSha256,
      pagesInspected: number(report.request.pages),
      transactionsInspected: number(report.request.transactionsFetched),
      historyExhausted: false,
      pageLimitReached: true,
      candidateTransfers: report.candidates.length,
      outlierClaims: number(report.integrity?.amountProfile?.outlierClaims),
      minoritySourceClaims: number(report.integrity?.minoritySourceClaims),
      oldestObservedAt: report.integrity?.oldestObservedAt || null,
      newestObservedAt: report.integrity?.newestObservedAt || null,
      methodology:
        "Imported from a hash-verified, bounded dry-run audit. All records remain external claim candidates; statistical flags do not confirm rewards or launch state.",
    },
  };
}

module.exports = { buildImportedLedger, sha256, validateAuditReport };
