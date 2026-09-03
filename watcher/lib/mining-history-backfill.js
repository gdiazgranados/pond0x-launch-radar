"use strict";

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 3) {
  const power = 10 ** digits;
  return Math.round(number(value) * power) / power;
}

function iso(timestamp) {
  const milliseconds = number(timestamp) * 1000;
  return milliseconds > 0 ? new Date(milliseconds).toISOString() : null;
}

function transferKey(transfer) {
  return `${transfer.signature}:${transfer.to}:${number(transfer.amount)}`;
}

function extractExternalClaims(transactions, { distributor, rewardWallet, wpondMint }) {
  const claims = [];

  for (const transaction of Array.isArray(transactions) ? transactions : []) {
    if (transaction?.transactionError || !transaction?.signature) continue;

    for (const transfer of Array.isArray(transaction?.tokenTransfers) ? transaction.tokenTransfers : []) {
      const from = transfer?.fromUserAccount || transfer?.fromTokenAccount || "";
      const to = transfer?.toUserAccount || transfer?.toTokenAccount || "";
      const amount = number(transfer?.tokenAmount);

      if (transfer?.mint !== wpondMint) continue;
      if (from !== distributor || !to || to === distributor || to === rewardWallet) continue;
      if (amount <= 0) continue;

      claims.push({
        signature: transaction.signature,
        timestamp: number(transaction.timestamp),
        time: iso(transaction.timestamp),
        from,
        to,
        amount,
        source: transaction.source || "UNKNOWN",
      });
    }
  }

  return claims;
}

function simulateLedgerMerge(existingLedger, claims, generatedAt) {
  const existingRecipients = Array.isArray(existingLedger?.recipients)
    ? existingLedger.recipients
    : [];
  const recipients = new Map(
    existingRecipients.filter((row) => row?.wallet).map((row) => [row.wallet, { ...row }])
  );
  const seen = new Set(
    Array.isArray(existingLedger?.seenTransferKeys) ? existingLedger.seenTransferKeys : []
  );

  let newTransfers = 0;
  let newRecipients = 0;
  let duplicates = 0;

  for (const claim of Array.isArray(claims) ? claims : []) {
    if (!claim?.signature || !claim?.to) continue;
    const key = transferKey(claim);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }

    seen.add(key);
    newTransfers += 1;
    const seenAt = claim.time || iso(claim.timestamp) || generatedAt;
    const current = recipients.get(claim.to);

    if (!current) {
      newRecipients += 1;
      recipients.set(claim.to, {
        wallet: claim.to,
        totalWPOND: round(claim.amount),
        transferCount: 1,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        lastSignature: claim.signature,
        frequencyClass: "NEW",
      });
      continue;
    }

    current.totalWPOND = round(number(current.totalWPOND) + number(claim.amount));
    current.transferCount = number(current.transferCount) + 1;
    current.frequencyClass = current.transferCount >= 5 ? "FREQUENT" : "REPEAT";
    if (!current.firstSeenAt || Date.parse(seenAt) < Date.parse(current.firstSeenAt)) {
      current.firstSeenAt = seenAt;
    }
    if (!current.lastSeenAt || Date.parse(seenAt) >= Date.parse(current.lastSeenAt)) {
      current.lastSeenAt = seenAt;
      current.lastSignature = claim.signature;
    }
    recipients.set(claim.to, current);
  }

  const rows = [...recipients.values()];
  const totalTransfers = rows.reduce((sum, row) => sum + number(row.transferCount), 0);
  const totalWPOND = round(rows.reduce((sum, row) => sum + number(row.totalWPOND), 0));

  return {
    summary: {
      existingTransfers: number(existingLedger?.totalTransfers),
      existingRecipients: number(existingLedger?.totalRecipients),
      candidateClaims: Array.isArray(claims) ? claims.length : 0,
      duplicates,
      newTransfers,
      newRecipients,
      projectedTransfers: totalTransfers,
      projectedRecipients: rows.length,
      projectedWPOND: totalWPOND,
    },
    projectedLedger: {
      ...existingLedger,
      updatedAt: generatedAt,
      totalRecipients: rows.length,
      totalTransfers,
      totalWPOND,
      recipients: rows,
      seenTransferKeys: [...seen],
    },
  };
}

function buildAuditReport(existingLedger, claims, generatedAt, context = {}) {
  const normalizedClaims = Array.isArray(claims)
    ? claims.map((claim) => ({
        signature: claim.signature,
        timestamp: number(claim.timestamp),
        time: claim.time || iso(claim.timestamp),
        from: claim.from,
        to: claim.to,
        amount: number(claim.amount),
        source: claim.source || "UNKNOWN",
        transferKey: transferKey(claim),
      }))
    : [];
  const orderedClaims = normalizedClaims.sort((a, b) => b.timestamp - a.timestamp);
  const uniqueKeys = new Set(orderedClaims.map((claim) => claim.transferKey));
  const validTimes = orderedClaims
    .map((claim) => claim.time)
    .filter(Boolean)
    .sort();
  const simulation = simulateLedgerMerge(existingLedger, orderedClaims, generatedAt);

  return {
    version: "1.0.0",
    generatedAt,
    mode: "DRY_RUN_AUDIT",
    scoreNeutral: true,
    ledgerWritesPerformed: false,
    request: context.request || {},
    coverage: context.coverage || {},
    integrity: {
      normalizedClaims: orderedClaims.length,
      uniqueTransferKeys: uniqueKeys.size,
      duplicateCandidateKeys: orderedClaims.length - uniqueKeys.size,
      missingTimestampClaims: orderedClaims.filter((claim) => !claim.time).length,
      nonPositiveAmountClaims: orderedClaims.filter((claim) => claim.amount <= 0).length,
      oldestObservedAt: validTimes.at(0) || null,
      newestObservedAt: validTimes.at(-1) || null,
    },
    summary: simulation.summary,
    candidates: orderedClaims,
    projectedLedger: simulation.projectedLedger,
  };
}

module.exports = {
  buildAuditReport,
  extractExternalClaims,
  simulateLedgerMerge,
  transferKey,
};
