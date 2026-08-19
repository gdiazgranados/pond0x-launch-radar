"use strict";

function buildSignalBuilder({
  includesAny,
  uniqueSortedStrings,
  ensureArray,
}) {
  if (typeof includesAny !== "function") {
    throw new TypeError("includesAny must be a function");
  }

  if (typeof uniqueSortedStrings !== "function") {
    throw new TypeError("uniqueSortedStrings must be a function");
  }

  if (typeof ensureArray !== "function") {
    throw new TypeError("ensureArray must be a function");
  }

  function buildSignals({
    combinedText = "",
    changedFiles = [],
    movementPct = 0,
    recentChangesCount = 0,
    discovery = {},
    backendSignals = [],
    onchain = {},
  }) {
    const frontendHits = [];
    const infraHits = [];
    const rewardsHits = [];
    const behaviorHits = [];

    const walletKeywords = [
      "wallet",
      "connect wallet",
      "solana",
      "ethereum",
      "phantom",
      "metamask",
      "account",
    ];

    const rewardKeywords = [
      "reward",
      "rewards",
      "claim",
      "claim now",
      "distribution",
      "points",
      "epoch",
      "airdrop",
      "payout",
      "eligible",
      "available rewards",
    ];

    const rewardActivationKeywords = [
      "claim",
      "claim now",
      "eligible",
      "available rewards",
      "canclaim",
      "isenabled",
      "active",
    ];

    const authKeywords = [
      "verify",
      "signin",
      "signmessage",
      "verifysignature",
      "nonce",
      "account",
    ];

    const ctaKeywords = [
      "connect",
      "launch",
      "enter",
      "start",
      "claim now",
      "portal",
      "available rewards",
    ];

    const disabledKeywords = [
      "disabled",
      "aria-disabled",
      "pointer-events-none",
      "opacity-50",
    ];

    const enabledKeywords = [
      "enabled",
      "isenabled",
      "active",
      "canclaim",
    ];

    const discoveryKeywords = uniqueSortedStrings(discovery.criticalKeywords);
    const discoveryApiRoutes = uniqueSortedStrings(discovery.newApiRoutes);
    const discoveryCandidate = String(discovery.keyFunctionCandidate || "").toLowerCase();
    const backendSignalsText = uniqueSortedStrings(backendSignals).join(" ");

    const discoveryText = [
      combinedText,
      discoveryKeywords.join(" "),
      discoveryApiRoutes.join(" "),
      discoveryCandidate,
      backendSignalsText,
    ].join("\n");

    const hasWalletStrings = includesAny(discoveryText, walletKeywords);
    const hasRewardLogic = includesAny(discoveryText, rewardKeywords);
    const hasRewardActivation = includesAny(discoveryText, rewardActivationKeywords);
    const hasAuthSignals = includesAny(discoveryText, authKeywords);
    const hasConnectUI = includesAny(discoveryText, ctaKeywords);
    const hasDisabledState = includesAny(discoveryText, disabledKeywords);
    const hasEnabledState = includesAny(discoveryText, enabledKeywords);
    const hasVisibleCTAChange = includesAny(discoveryText, ["connect", "claim", "launch", "portal"]);
    const hasClaimSignal = includesAny(discoveryText, ["claim", "claim now", "canclaim"]);
    const hasEligibilitySignal = includesAny(discoveryText, ["eligible", "available rewards", "eligible_true"]);
    const hasActiveSignal = includesAny(discoveryText, ["active", "enabled", "isenabled", "active_true", "enabled_true"]);
    const hasApiSurface = discoveryApiRoutes.length > 0;
    const hasClaimApi = discoveryApiRoutes.some((x) => x.includes("claim"));
    const hasRewardApi = discoveryApiRoutes.some((x) => x.includes("reward"));
    const hasAuthApi = discoveryApiRoutes.some((x) => x.includes("auth") || x.includes("verify") || x.includes("nonce"));
    const hasAccountApi = discoveryApiRoutes.some((x) => x.includes("account") || x.includes("user") || x.includes("wallet"));

    const hasEligibleTrue = backendSignals.includes("eligible_true");
    const hasCanClaimTrue = backendSignals.includes("canclaim_true");
    const hasEnabledTrue = backendSignals.includes("enabled_true");
    const hasActiveTrue = backendSignals.includes("active_true");
    const hasRewardsArray = backendSignals.includes("rewards_array");

    if (hasWalletStrings) frontendHits.push("wallet_strings");
    if (hasConnectUI) frontendHits.push("connect_ui");
    if (hasDisabledState) frontendHits.push("disabled_state");
    if (hasEnabledState) frontendHits.push("enabled_state");
    if (hasVisibleCTAChange) frontendHits.push("cta_change");
    if (hasAuthSignals) frontendHits.push("auth_flow");
    if (hasApiSurface) frontendHits.push("api_surface");

    const hasNewChunks = changedFiles.some(
      (file) => file.includes("_next/static") || file.endsWith(".js") || file.endsWith(".css")
    );

    if (hasNewChunks) infraHits.push("new_chunks");
    if (changedFiles.some((file) => file.endsWith(".css"))) infraHits.push("css_change");
    if (changedFiles.some((file) => file.endsWith(".js"))) infraHits.push("js_change");
    if (hasClaimApi) infraHits.push("claim_api");
    if (hasRewardApi) infraHits.push("reward_api");
    if (hasAuthApi) infraHits.push("auth_api");
    if (hasAccountApi) infraHits.push("account_api");

    if (changedFiles.length >= 4) behaviorHits.push("multi_file_burst");

    if (hasRewardLogic) rewardsHits.push("reward_logic");
    if (hasRewardActivation) rewardsHits.push("reward_activation");
    if (hasClaimSignal) rewardsHits.push("claim_signal");
    if (hasEligibilitySignal) rewardsHits.push("eligibility_signal");
    if (hasActiveSignal) rewardsHits.push("active_signal");
    if (hasClaimApi) rewardsHits.push("claim_api_signal");
    if (hasRewardApi) rewardsHits.push("reward_api_signal");
    if (hasEligibleTrue) rewardsHits.push("eligible_true_signal");
    if (hasCanClaimTrue) rewardsHits.push("canclaim_true_signal");
    if (hasEnabledTrue) rewardsHits.push("enabled_true_signal");
    if (hasActiveTrue) rewardsHits.push("active_true_signal");
    if (hasRewardsArray) rewardsHits.push("rewards_array_signal");

    if (movementPct >= 10) behaviorHits.push("movement_spike");
    if (recentChangesCount >= 3) behaviorHits.push("recent_change_cluster");
    if (hasEnabledState && !hasDisabledState) behaviorHits.push("enabled_without_disabled");
    if (hasClaimSignal && hasEligibilitySignal) behaviorHits.push("claim_eligibility_convergence");
    if (hasWalletStrings && hasAuthSignals && hasRewardActivation) {
      behaviorHits.push("wallet_auth_reward_convergence");
    }
    if (discoveryKeywords.length >= 2) behaviorHits.push("discovery_keyword_cluster");
    if (hasApiSurface && discoveryCandidate) behaviorHits.push("api_surface_candidate");
    if (hasEligibleTrue && hasCanClaimTrue) behaviorHits.push("backend_claim_activation");
    if (hasEnabledTrue || hasActiveTrue) behaviorHits.push("backend_enabled_state");
    if (hasRewardsArray) behaviorHits.push("backend_rewards_payload");

    const frontendScore = Math.min(frontendHits.length * 20, 100);
    const infraScore = Math.min(infraHits.length * 20, 100);
    const rewardsScore = Math.min(rewardsHits.length * 25, 100);
    const behaviorScore = Math.min(behaviorHits.length * 25, 100);

    return {
      frontend: frontendHits,
      infra: infraHits,
      rewards: rewardsHits,
      behavior: behaviorHits,
      frontendScore,
      infraScore,
      rewardsScore,
      behaviorScore,
      movementPct,
      recentChangesCount,
      onchainStatus: onchain.status || "UNKNOWN",
      onchainAvailable: onchain.available === true,
      onchainFresh: onchain.fresh === true,
      hasOnchainMovement: onchain.hasOnchainMovement,
      onchainScore: Number(onchain.onchainScore || 0),
      onchain: ensureArray(onchain.onchain),
      hasWalletStrings,
      hasConnectUI,
      hasDisabledState,
      hasEnabledState,
      hasRewardLogic,
      hasRewardActivation,
      hasAuthSignals,
      hasClaimSignal,
      hasEligibilitySignal,
      hasActiveSignal,
      hasApiSurface,
      hasClaimApi,
      hasRewardApi,
      hasAuthApi,
      hasAccountApi,
      hasEligibleTrue,
      hasCanClaimTrue,
      hasEnabledTrue,
      hasActiveTrue,
      hasRewardsArray,
      hasNewChunks,
      hasVisibleCTAChange,
    };
  }

  return {
    buildSignals,
  };
}

module.exports = {
  buildSignalBuilder,
};
