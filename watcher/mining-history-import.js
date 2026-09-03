"use strict";

const fs = require("fs-extra");
const path = require("node:path");
const { buildImportedLedger, sha256 } = require("./lib/mining-history-import");

function requiredOption(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  const value = argument?.slice(prefix.length);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

async function main() {
  const auditPath = path.resolve(requiredOption("audit"));
  const ledgerPath = path.resolve(requiredOption("ledger"));
  const outputPath = path.resolve(requiredOption("output"));
  const expectedSha256 = requiredOption("expected-sha256").toLowerCase();

  if (outputPath === ledgerPath) throw new Error("Output path must not overwrite the input ledger");
  if (outputPath === auditPath) throw new Error("Output path must not overwrite the audit report");
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("Expected SHA-256 must contain 64 hex characters");

  const serializedAudit = await fs.readFile(auditPath, "utf8");
  const actualSha256 = sha256(serializedAudit);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Audit SHA-256 mismatch: expected ${expectedSha256}, received ${actualSha256}`);
  }

  const report = JSON.parse(serializedAudit);
  const existingLedger = await fs.readJson(ledgerPath);
  const importedAt = new Date().toISOString();
  const projectedLedger = buildImportedLedger(existingLedger, report, {
    importedAt,
    reportSha256: actualSha256,
  });
  const serializedOutput = `${JSON.stringify(projectedLedger, null, 2)}\n`;
  await fs.outputFile(outputPath, serializedOutput, "utf8");

  console.log(JSON.stringify({
    version: projectedLedger.version,
    mode: "PROJECTED_LEDGER_COPY",
    inputLedgerOverwritten: false,
    auditReportOverwritten: false,
    auditReportSha256: actualSha256,
    outputSha256: sha256(serializedOutput),
    outputPath,
    totalTransfers: projectedLedger.totalTransfers,
    totalRecipients: projectedLedger.totalRecipients,
    totalWPOND: projectedLedger.totalWPOND,
    newTransfersThisSweep: projectedLedger.newTransfersThisSweep,
    newRecipientsThisSweep: projectedLedger.newRecipientsThisSweep,
    historicalBaseline: projectedLedger.historicalBaseline,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Mining history import failed: ${error.message}`);
  process.exitCode = 1;
});
