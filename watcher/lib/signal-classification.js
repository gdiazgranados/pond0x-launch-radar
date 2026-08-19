"use strict";

function buildSignalClassification({ ensureArray }) {
  if (typeof ensureArray !== "function") {
    throw new TypeError("ensureArray must be a function");
  }

  function evaluateAlpha(latest) {
    const score = Number(
      latest.scorePercent ?? latest.score ?? 0
    );
    const movementPct = Number(latest.movementPct || 0);
    const trend = Number(latest.trend || 0);
    const activationProbability = Number(latest.activationProbability || 0);
    const positiveTrend = Math.max(0, trend);

    const tags = latest.tags || [];
    const signals = latest.signals || [];
    const discovery = latest.discovery || {};
    const backendSignals = latest.backendSignals || [];

    let alphaRaw =
      score * 0.25 +
      movementPct * 0.25 +
      positiveTrend * 1.25 +
      activationProbability * 0.15;

    const hasRewards =
      tags.includes("REWARDS") ||
      signals.includes("reward") ||
      signals.includes("claim") ||
      signals.includes("payout") ||
      signals.includes("eligible") ||
      signals.includes("canclaim");

    const hasWalletStack =
      (signals.includes("connect") || signals.includes("wallet")) &&
      (signals.includes("ethereum") || signals.includes("solana"));

    const hasAuth =
      tags.includes("AUTH") ||
      signals.includes("verify") ||
      signals.includes("account") ||
      signals.includes("auth") ||
      signals.includes("signin") ||
      signals.includes("signmessage") ||
      signals.includes("verifysignature") ||
      signals.includes("nonce");

    const hasActivation =
      signals.includes("enabled") ||
      signals.includes("isenabled") ||
      signals.includes("active");

    const structuralSignals = [
      hasRewards,
      hasWalletStack,
      hasAuth,
      hasActivation,
    ].filter(Boolean).length;

    if (structuralSignals >= 3) {
      alphaRaw += 12;
    } else if (structuralSignals === 2) {
      alphaRaw += 7;
    } else if (structuralSignals === 1) {
      alphaRaw += 3;
    }
    const discoverySignals = [
      ensureArray(discovery.newApiRoutes).length > 0,
      ensureArray(discovery.criticalKeywords).length >= 2,
      String(discovery.keyFunctionCandidate || "").startsWith("api:"),
      String(discovery.keyFunctionCandidate || "").startsWith("critical:"),
    ].filter(Boolean).length;

    if (discoverySignals >= 2) {
      alphaRaw += 8;
    } else if (discoverySignals === 1) {
      alphaRaw += 4;
    }

    const backendEvidenceCount = [
      backendSignals.includes("eligible_true"),
      backendSignals.includes("canclaim_true"),
      backendSignals.includes("enabled_true"),
      backendSignals.includes("active_true"),
      backendSignals.includes("rewards_array"),
    ].filter(Boolean).length;

    if (backendEvidenceCount >= 3) {
      alphaRaw += 18;
    } else if (backendEvidenceCount === 2) {
      alphaRaw += 12;
    } else if (backendEvidenceCount === 1) {
      alphaRaw += 6;
    }

    const alphaScore = Math.max(0, Math.min(100, Math.round(alphaRaw)));

    let alphaClass = "NOISE";
    if (alphaScore >= 85) alphaClass = "CRITICAL";
    else if (alphaScore >= 70) alphaClass = "ACTIONABLE";
    else if (alphaScore >= 50) alphaClass = "SETUP";
    else if (alphaScore >= 25) alphaClass = "WATCH";

    let triggerState = "IDLE";
    if (alphaScore >= 85) triggerState = "TRIGGERED";
    else if (alphaScore >= 70) triggerState = "ARMED";
    else if (alphaScore >= 25) triggerState = "WATCHING";

    let suggestedAction = "Ignore noise and continue baseline monitoring.";

    if (alphaClass === "WATCH") {
      suggestedAction = "Watch closely and wait for confirmation.";
    } else if (alphaClass === "SETUP") {
      suggestedAction = "Track closely, compare against previous sweeps, and prepare alerts.";
    } else if (alphaClass === "ACTIONABLE") {
      suggestedAction = "High-conviction setup. Escalate alerts and monitor aggressively.";
    } else if (alphaClass === "CRITICAL") {
      suggestedAction = "Critical signal. Treat as imminent event candidate and escalate immediately.";
    }

    return {
      alphaScore,
      alphaClass,
      triggerState,
      suggestedAction,
    };
  }

  function detectEventType(latest) {
    const tags = latest.tags || [];
    const signals = latest.signals || [];
    const discovery = latest.discovery || {};
    const backendSignals = latest.backendSignals || [];
    const score = Number(latest.score || 0);
    const movementPct = Number(latest.movementPct || 0);
    const level = latest.level || "LOW";

    const hasRewards =
      tags.includes("REWARDS") ||
      signals.includes("reward") ||
      signals.includes("claim") ||
      signals.includes("payout") ||
      signals.includes("airdrop") ||
      signals.includes("eligible") ||
      signals.includes("canclaim");

    const hasWallet =
      signals.includes("connect") ||
      signals.includes("wallet") ||
      signals.includes("ethereum") ||
      signals.includes("solana") ||
      tags.includes("CHAIN");

    const hasAuth =
      tags.includes("AUTH") ||
      signals.includes("verify") ||
      signals.includes("account") ||
      signals.includes("auth") ||
      signals.includes("signin") ||
      signals.includes("signmessage") ||
      signals.includes("verifysignature") ||
      signals.includes("nonce");

    const hasPortal = tags.includes("SYSTEM") || signals.includes("portal");

    const hasActivation =
      signals.includes("enabled") ||
      signals.includes("isenabled") ||
      signals.includes("active");

    const discoveryApiRoutes = ensureArray(discovery.newApiRoutes);
    const hasClaimApi = discoveryApiRoutes.some((x) => String(x).includes("claim"));
    const hasRewardApi = discoveryApiRoutes.some((x) => String(x).includes("reward"));
    const hasAccountApi = discoveryApiRoutes.some(
      (x) => String(x).includes("account") || String(x).includes("user") || String(x).includes("wallet")
    );

    const hasEligibleTrue = backendSignals.includes("eligible_true");
    const hasCanClaimTrue = backendSignals.includes("canclaim_true");
    const hasEnabledTrue = backendSignals.includes("enabled_true");
    const hasActiveTrue = backendSignals.includes("active_true");
    const hasRewardsArray = backendSignals.includes("rewards_array");

    if ((hasEligibleTrue && hasCanClaimTrue) || (hasEnabledTrue && hasRewardsArray && score >= 70)) {
      return "REWARD ACTIVATION";
    }

    if (
      (hasClaimApi || hasRewardApi || hasEligibleTrue) &&
      (signals.includes("claim") || signals.includes("eligible") || signals.includes("canclaim") || hasCanClaimTrue) &&
      score >= 60
    ) {
      return "CLAIM READINESS";
    }

    if (hasRewards && hasWallet && hasAuth && hasActivation && score >= 70) {
      return "REWARD ACTIVATION";
    }

    if (hasWallet && (hasAuth || hasAccountApi) && movementPct >= 10) {
      return "WALLET ENABLEMENT";
    }

    if (hasAuth && score >= 45) {
      return "AUTH STACK CHANGE";
    }

    if (hasPortal && movementPct >= 10) {
      return "PORTAL ARMING";
    }

    if (level === "VERY HIGH") {
      return "HIGH-PRIORITY SYSTEM EVENT";
    }

    if (level === "HIGH") {
      return "ELEVATED SIGNAL EVENT";
    }

    return "NOISE";
  }

  function classifySignalRegime(latest, alpha, eventType) {
    const score = Number(latest.score || 0);
    const movementPct = Number(latest.movementPct || 0);
    const trend = Number(latest.trend || 0);
    const tags = latest.tags || [];
    const signals = latest.signals || [];
    const backendSignals = latest.backendSignals || [];

    const hasRewards =
      tags.includes("REWARDS") ||
      signals.includes("reward") ||
      signals.includes("claim") ||
      signals.includes("payout") ||
      signals.includes("airdrop") ||
      signals.includes("eligible") ||
      signals.includes("canclaim");

    const hasWallet =
      signals.includes("connect") ||
      signals.includes("wallet") ||
      signals.includes("ethereum") ||
      signals.includes("solana") ||
      tags.includes("CHAIN");

    const hasAuth =
      tags.includes("AUTH") ||
      signals.includes("verify") ||
      signals.includes("account") ||
      signals.includes("auth") ||
      signals.includes("signin") ||
      signals.includes("signmessage") ||
      signals.includes("verifysignature") ||
      signals.includes("nonce");

    const backendActivation =
      backendSignals.includes("eligible_true") ||
      backendSignals.includes("canclaim_true") ||
      backendSignals.includes("enabled_true") ||
      backendSignals.includes("active_true");

    if (
      alpha.triggerState === "TRIGGERED" &&
      alpha.alphaClass === "CRITICAL" &&
      (
        eventType === "REWARD ACTIVATION" ||
        eventType === "CLAIM READINESS" ||
        backendActivation ||
        (hasRewards && hasWallet && hasAuth) ||
        (score >= 75 && movementPct >= 15 && trend >= 3)
      )
    ) {
      return "PRE-LAUNCH REAL";
    }

    if (
      alpha.alphaClass === "ACTIONABLE" ||
      alpha.triggerState === "ARMED" ||
      eventType === "WALLET ENABLEMENT" ||
      eventType === "PORTAL ARMING" ||
      eventType === "CLAIM READINESS"
    ) {
      return "HIGH-CONVICTION SETUP";
    }

    if (alpha.alphaClass === "SETUP" || alpha.alphaClass === "WATCH" || hasAuth) {
      return "TRANSITIONAL SIGNAL";
    }

    return "NOISE DISGUISED AS SIGNAL";
  }

  function detectSignalFusion(latest, alpha, eventType) {
    const tags = latest.tags || [];
    const signals = latest.signals || [];
    const discovery = latest.discovery || {};
    const backendSignals = latest.backendSignals || [];
    const score = Number(latest.score || 0);
    const movementPct = Number(latest.movementPct || 0);
    const patternBoost = Number(latest?.breakdown?.patternBoost || 0);

    const hasRewards =
      tags.includes("REWARDS") ||
      signals.includes("reward") ||
      signals.includes("claim") ||
      signals.includes("payout") ||
      signals.includes("airdrop") ||
      signals.includes("eligible") ||
      signals.includes("canclaim");

    const hasWallet =
      signals.includes("connect") ||
      signals.includes("wallet") ||
      signals.includes("ethereum") ||
      signals.includes("solana") ||
      tags.includes("CHAIN");

    const hasAuth =
      tags.includes("AUTH") ||
      signals.includes("verify") ||
      signals.includes("account") ||
      signals.includes("auth") ||
      signals.includes("signin") ||
      signals.includes("signmessage") ||
      signals.includes("verifysignature") ||
      signals.includes("nonce");

    const hasActivation =
      signals.includes("enabled") ||
      signals.includes("isenabled") ||
      signals.includes("active");

    const hasApiSurface = ensureArray(discovery.newApiRoutes).length > 0;
    const backendActivation =
      backendSignals.includes("eligible_true") ||
      backendSignals.includes("canclaim_true") ||
      backendSignals.includes("enabled_true") ||
      backendSignals.includes("active_true");

    const strongAlpha =
      alpha.alphaClass === "CRITICAL" ||
      alpha.alphaClass === "ACTIONABLE" ||
      alpha.triggerState === "TRIGGERED" ||
      alpha.triggerState === "ARMED";

    if (
      hasRewards &&
      hasWallet &&
      hasAuth &&
      (hasActivation || backendActivation) &&
      strongAlpha &&
      score >= 70 &&
      patternBoost >= 20
    ) {
      return "FULL ACTIVATION STACK";
    }

    if (hasRewards && hasWallet && hasAuth && hasApiSurface) {
      return "REWARD + WALLET + AUTH CLUSTER";
    }

    if (eventType !== "NOISE" && (score >= 45 || movementPct >= 10 || Number(latest.trend || 0) >= 3)) {
      return "ELEVATED MULTI-SIGNAL EVENT";
    }

    return "UNCLASSIFIED SIGNAL MIX";
  }

  function getPriority(latest) {
    const tags = latest.tags || [];

    if (tags.includes("LAUNCH_IMMINENT")) return "CRITICAL";
    if (tags.includes("CONFIRMED_ACTIVATION")) return "CRITICAL";
    if (latest.level === "VERY HIGH") return "VERY HIGH";
    if (latest.level === "HIGH") return "HIGH";
    if (latest.level === "MEDIUM") return "MEDIUM";
    return "LOW";
  }

  function getEta(latest) {
    const tags = latest.tags || [];
    const score = Number(latest.score || 0);
    const movementPct = Number(latest.movementPct || 0);
    const trend = String(latest.trendDirection || "FLAT");

    if (tags.includes("LAUNCH_IMMINENT")) return "< 2h";
    if (tags.includes("CONFIRMED_ACTIVATION")) return "< 6h";
    if (score >= 80 && movementPct >= 20 && trend === "UP") return "< 24h";
    if (score >= 65) return "24h - 72h";
    if (score >= 45) return "monitoring";
    return "unknown";
  }

  return {
    evaluateAlpha,
    detectEventType,
    classifySignalRegime,
    detectSignalFusion,
    getPriority,
    getEta,
  };
}

module.exports = {
  buildSignalClassification,
};
