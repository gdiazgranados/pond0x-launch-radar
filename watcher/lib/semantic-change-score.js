"use strict";

const HIGH_VALUE_KEYWORDS = new Set([
  "claim",
  "eligible",
  "canclaim",
  "reward",
  "rewards",
  "verify",
  "nonce",
  "wallet",
  "account",
  "portal",
  "airdrop",
  "payout",
]);

const HIGH_VALUE_ROUTE_TERMS = [
  "claim",
  "reward",
  "eligible",
  "wallet",
  "account",
  "verify",
  "auth",
  "nonce",
  "portal",
  "airdrop",
  "payout",
  "leaderboard",
];

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(ensureArray(values).filter(Boolean))];
}

function routeWeight(route) {
  const lower = String(route || "").toLowerCase();
  let weight = lower.includes("/api/") ? 8 : 3;
  if (HIGH_VALUE_ROUTE_TERMS.some((term) => lower.includes(term))) {
    weight += lower.includes("/api/") ? 10 : 6;
  }
  return weight;
}

function keywordWeight(keyword) {
  return HIGH_VALUE_KEYWORDS.has(String(keyword || "").toLowerCase()) ? 8 : 2;
}

function flagWeight(flag) {
  const lower = String(flag || "").toLowerCase();
  if (lower.includes("reward") || lower.includes("leader") || lower.includes("unlock")) return 9;
  if (lower.includes("mining") || lower.includes("swap") || lower.includes("voting")) return 6;
  return 4;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function buildSemanticChangeScore({ bundleDiff = null, flagChanges = [], routeChanges = [] } = {}) {
  if (!bundleDiff?.comparable) {
    return {
      comparable: false,
      score: 0,
      level: "BASELINE",
      classification: "SEMANTIC_BASELINE",
      material: false,
      highValueEvidence: [],
      reasons: ["Bundle semantic baseline is not comparable yet."],
      components: {},
    };
  }

  const addedApiRoutes = unique(bundleDiff.addedApiRoutes);
  const removedApiRoutes = unique(bundleDiff.removedApiRoutes);
  const addedRoutes = unique(bundleDiff.addedRoutes);
  const removedRoutes = unique(bundleDiff.removedRoutes);
  const addedKeywords = unique(bundleDiff.addedKeywords);
  const removedKeywords = unique(bundleDiff.removedKeywords);
  const addedFlags = unique(bundleDiff.addedFlags);
  const removedFlags = unique(bundleDiff.removedFlags);
  const changedBundles = ensureArray(bundleDiff.changedBundles);
  const addedBundles = ensureArray(bundleDiff.addedBundles);
  const removedBundles = ensureArray(bundleDiff.removedBundles);

  let structural = 0;
  let semantic = 0;
  let activation = 0;
  const evidence = [];
  const reasons = [];

  structural += Math.min(12, changedBundles.length * 2);
  structural += Math.min(8, addedBundles.length * 2);
  structural += Math.min(6, removedBundles.length * 1.5);

  for (const route of addedRoutes) {
    const weight = routeWeight(route);
    semantic += weight;
    if (weight >= 8) evidence.push(`route:${route}`);
  }

  for (const route of addedApiRoutes) {
    const weight = routeWeight(route) + 5;
    semantic += weight;
    evidence.push(`api:${route}`);
  }

  for (const keyword of addedKeywords) {
    const weight = keywordWeight(keyword);
    semantic += weight;
    if (weight >= 8) evidence.push(`keyword:${keyword}`);
  }

  for (const flag of addedFlags) {
    const weight = flagWeight(flag);
    semantic += weight;
    if (weight >= 8) evidence.push(`flag:${flag}`);
  }

  for (const change of ensureArray(flagChanges)) {
    if (!change?.name || change.previous === change.current) continue;
    const isUnlock = change.previous === true && change.current === false;
    const weight = flagWeight(change.name) + (isUnlock ? 12 : 5);
    activation += weight;
    evidence.push(`${isUnlock ? "unlock" : "flag-change"}:${change.name}`);
  }

  for (const change of ensureArray(routeChanges)) {
    if (!change?.route) continue;
    if (change.becameReachable === true) {
      activation += 18 + routeWeight(change.route);
      evidence.push(`route-live:${change.route}`);
    } else if (change.referenceChanged === true && change.currentReferenced === true) {
      activation += 6;
    }
  }

  // Removals are informative, but do not count as activation evidence.
  const removals = removedApiRoutes.length + removedRoutes.length + removedKeywords.length + removedFlags.length;
  if (removals > 0) structural += Math.min(8, removals);

  const highValueEvidence = unique(evidence).slice(0, 24);
  const convergenceBonus = highValueEvidence.length >= 3 ? 12 : highValueEvidence.length >= 2 ? 6 : 0;
  const rawScore = structural + semantic + activation + convergenceBonus;
  const score = Math.round(clamp(rawScore) * 10) / 10;

  const level =
    score >= 80 ? "CRITICAL" :
    score >= 60 ? "HIGH" :
    score >= 35 ? "MEDIUM" :
    score >= 15 ? "LOW" :
    "TRIVIAL";

  const classification =
    activation >= 30 && highValueEvidence.length >= 2
      ? "ACTIVATION_RELEVANT_CHANGE"
      : semantic >= 25
        ? "SEMANTICALLY_MEANINGFUL_CHANGE"
        : structural >= 8
          ? "STRUCTURAL_BUNDLE_CHANGE"
          : bundleDiff.status === "DRIFT"
            ? "LOW_VALUE_BUNDLE_DRIFT"
            : "SEMANTICALLY_STABLE";

  if (changedBundles.length || addedBundles.length || removedBundles.length) {
    reasons.push(`${changedBundles.length} changed, ${addedBundles.length} added, ${removedBundles.length} removed bundles.`);
  }
  if (addedApiRoutes.length) reasons.push(`${addedApiRoutes.length} new API route(s) observed in first-party bundles.`);
  if (addedKeywords.length) reasons.push(`New semantic keywords: ${addedKeywords.slice(0, 8).join(", ")}.`);
  if (addedFlags.length) reasons.push(`New feature-flag references: ${addedFlags.slice(0, 8).join(", ")}.`);
  if (ensureArray(flagChanges).length) reasons.push(`${ensureArray(flagChanges).length} observed feature flag value transition(s).`);
  if (ensureArray(routeChanges).some((change) => change?.becameReachable)) reasons.push("At least one monitored route became reachable.");
  if (!reasons.length) reasons.push("No material semantic delta detected.");

  return {
    comparable: true,
    score,
    level,
    classification,
    material: score >= 35,
    highValueEvidence,
    reasons,
    components: {
      structural: Math.round(structural * 10) / 10,
      semantic: Math.round(semantic * 10) / 10,
      activation: Math.round(activation * 10) / 10,
      convergenceBonus,
    },
    counts: {
      changedBundles: changedBundles.length,
      addedBundles: addedBundles.length,
      removedBundles: removedBundles.length,
      addedRoutes: addedRoutes.length,
      addedApiRoutes: addedApiRoutes.length,
      addedKeywords: addedKeywords.length,
      addedFlags: addedFlags.length,
      flagTransitions: ensureArray(flagChanges).length,
      routeTransitions: ensureArray(routeChanges).length,
    },
  };
}

module.exports = {
  buildSemanticChangeScore,
};
