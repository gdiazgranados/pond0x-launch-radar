"use strict";

function normalizeOnchainState(chain, nowMs = Date.now()) {
  if (!chain || !chain.generatedAt) {
    return {
      status: "UNKNOWN",
      available: false,
      fresh: false,
      hasOnchainMovement: undefined,
      onchainScore: 0,
      onchain: [],
      fundingActive15m: false,
      rewardTransfers5m: 0,
      externalClaimTransfer: false,
      newExternalTransfers: 0,
      newExternalRecipients: 0,
      externalClaimLastObservedAt: null,
    };
  }

  const generatedAtMs = new Date(chain.generatedAt).getTime();
  const ageMs = nowMs - generatedAtMs;

  const fresh =
    Number.isFinite(generatedAtMs) &&
    ageMs >= 0 &&
    ageMs <= 15 * 60 * 1000;

  const recipientLedger = chain.recipientLedger || {};
  const newExternalTransfers = Number(recipientLedger.newTransfersThisSweep || 0);
  const newExternalRecipients = Number(recipientLedger.newRecipientsThisSweep || 0);
  const externalClaimLastObservedAt = recipientLedger.lastObservedAt || null;

  if (!fresh) {
    return {
      status: "UNKNOWN",
      available: true,
      fresh: false,
      hasOnchainMovement: undefined,
      onchainScore: 0,
      onchain: [],
      fundingActive15m: false,
      rewardTransfers5m: 0,
      externalClaimTransfer: false,
      newExternalTransfers: 0,
      newExternalRecipients: 0,
      externalClaimLastObservedAt,
    };
  }

  const w5 = chain.windows?.["5m"] || {};

  const rewardTransfers5m = Number(
    w5.rewardTransfers ?? w5.rewards ?? 0
  );

  const fundingActive15m =
    chain.fundingStatus?.active15m === true ||
    chain.fundingDetected === true;

  const rewardActivity5m = rewardTransfers5m >= 3;
  const externalClaimTransfer = newExternalTransfers > 0;

  const hasOnchainMovement =
    fundingActive15m ||
    rewardActivity5m ||
    externalClaimTransfer;

  const evidence = [];

  if (rewardTransfers5m > 0) {
    evidence.push(`reward_transfers_5m:${rewardTransfers5m}`);
  }

  if (fundingActive15m) {
    evidence.push("funding_active_15m");
  }

  if (externalClaimTransfer) {
    evidence.push(`external_claim_transfers:${newExternalTransfers}`);
  }

  if (newExternalRecipients > 0) {
    evidence.push(`new_external_recipients:${newExternalRecipients}`);
  }

  return {
    status: hasOnchainMovement ? "ACTIVE" : "QUIET",
    available: true,
    fresh: true,
    hasOnchainMovement,
    onchainScore: hasOnchainMovement
      ? Number(chain.chainConfirmationScore || 0)
      : 0,
    onchain: evidence,
    fundingActive15m,
    rewardTransfers5m,
    externalClaimTransfer,
    newExternalTransfers,
    newExternalRecipients,
    externalClaimLastObservedAt,
  };
}

module.exports = {
  normalizeOnchainState,
};
