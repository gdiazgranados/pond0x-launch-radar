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
    };
  }

  const generatedAtMs = new Date(chain.generatedAt).getTime();
  const ageMs = nowMs - generatedAtMs;

  const fresh =
    Number.isFinite(generatedAtMs) &&
    ageMs >= 0 &&
    ageMs <= 15 * 60 * 1000;

  if (!fresh) {
    return {
      status: "UNKNOWN",
      available: true,
      fresh: false,
      hasOnchainMovement: undefined,
      onchainScore: 0,
      onchain: [],
    };
  }

  const w5 = chain.windows?.["5m"] || {};
  const w15 = chain.windows?.["15m"] || {};

  const rewardTransfers5m = Number(
    w5.rewardTransfers ?? w5.rewards ?? 0
  );

  const fundingActive15m =
    chain.fundingStatus?.active15m === true ||
    chain.fundingDetected === true;

  const rewardActivity5m =
    rewardTransfers5m >= 3;

  const hasOnchainMovement =
    fundingActive15m ||
    rewardActivity5m;

  const evidence = [];

  if (rewardTransfers5m > 0) {
    evidence.push(`reward_transfers_5m:${rewardTransfers5m}`);
  }

  if (fundingActive15m) {
    evidence.push("funding_active_15m");
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
  };
}

module.exports = {
  normalizeOnchainState,
};
