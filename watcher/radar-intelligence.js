const RADAR_KEYWORDS = {
  REWARDS: [
    "reward", "rewards", "bonus", "earn", "earning", "earnings",
    "redeem", "redemption", "airdrop", "distribution", "payout",
  ],
  AUTH: [
    "auth", "login", "log in", "sign-in", "sign in", "verify",
    "verification", "session", "credential", "access", "otp",
  ],
  WALLET: [
    "wallet", "connect", "disconnect", "address", "signature", "signed",
    "signedmessage", "signed message", "ethereum", "solana", "metamask", "phantom",
  ],
  ACCOUNT: [
    "account", "profile", "settings", "dashboard", "user", "identity", "member",
  ],
  SYSTEM: [
    "status", "health", "heartbeat", "monitor", "monitoring",
    "maintenance", "uptime", "portal", "launch", "enabled", "disabled",
  ],
  CLAIM: [
    "claim", "claims", "claimable", "redeem", "redeemable", "collect", "collectible",
  ],
  PORTAL: [
    "portal", "home", "landing", "surface", "entry", "terminal",
  ],
  TRADING: [
    "trade", "trading", "swap", "buy", "sell", "pair", "liquidity", "pool", "chart",
  ],
  XP: [
    "xp", "experience", "level", "rank", "badge", "progress", "streak",
  ],
  POINTS: [
    "point", "points", "score", "leaderboard", "rankings",
  ],
};

const RADAR_CHANGE_TYPE_KEYWORDS = {
  route: ["route", "path", "slug", "page", "screen", "navigate"],
  component: ["component", "widget", "card", "modal", "panel", "section"],
  text: ["text", "label", "copy", "message", "title", "subtitle", "description", "summary"],
  button: ["button", "cta", "click", "submit", "action"],
  form: ["form", "input", "field", "checkbox", "select", "dropdown"],
  api: ["api", "endpoint", "fetch", "request", "response", "graphql"],
  config: ["config", "setting", "env", "feature flag", "feature_flag", "toggle"],
  asset: ["image", "icon", "logo", "svg", "png", "jpg", "jpeg", "webp", "asset"],
  style: ["style", "css", "tailwind", "class", "theme", "spacing", "padding", "margin", "color"],
};

const SENSITIVITY_BONUS = {
  REWARDS: 20,
  AUTH: 15,
  WALLET: 15,
  ACCOUNT: 10,
  SYSTEM: 5,
  CLAIM: 20,
  PORTAL: 5,
  TRADING: 10,
  XP: 10,
  POINTS: 10,
};

function normalizeTokens(input) {
  return input
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .toLowerCase()
        .replace(/[_/.-]+/g, " ")
        .split(/\s+/)
    )
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildCorpus(snapshot) {
  const textSources = [
    ...(snapshot.signals || []),
    ...(snapshot.tags || []),
    ...(snapshot.filePaths || []),
    ...(snapshot.changedFiles || []),
    snapshot.summary,
    snapshot.note,
    snapshot.insight,
  ];

  return normalizeTokens(textSources);
}

function detectFocusAreas(snapshot) {
  const joined = buildCorpus(snapshot).join(" ");

  return Object.entries(RADAR_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => joined.includes(keyword.toLowerCase())))
    .map(([focusArea]) => focusArea);
}

function detectSensitiveHits(snapshot) {
  const joined = buildCorpus(snapshot).join(" ");

  const hits = Object.values(RADAR_KEYWORDS)
    .flat()
    .filter((keyword) => joined.includes(keyword.toLowerCase()));

  return [...new Set(hits)];
}

function detectChangeTypes(snapshot) {
  const joined = buildCorpus(snapshot).join(" ");

  return Object.entries(RADAR_CHANGE_TYPE_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => joined.includes(keyword.toLowerCase())))
    .map(([changeType]) => changeType);
}

function computeBaseScore(snapshot) {
  const movementPct = Number(snapshot.movementPct ?? 0);
  const changedPct = Number(snapshot.changedPct ?? 0);
  const addedPct = Number(snapshot.addedPct ?? 0);
  const movementCount = Number(snapshot.movementCount ?? 0);

  const weighted =
    movementPct * 0.35 +
    changedPct * 0.2 +
    addedPct * 0.15 +
    Math.min(movementCount, 10) * 3;

  return clampScore(weighted);
}

function computeSensitivityBonus(focusAreas) {
  return clampScore(
    focusAreas.reduce((sum, area) => sum + (SENSITIVITY_BONUS[area] || 0), 0)
  );
}

function computeNoisePenalty(changeTypes) {
  if (!changeTypes.length) return 0;

  const onlyStyle = changeTypes.every((type) => type === "style");
  const onlyAsset = changeTypes.every((type) => type === "asset");
  const cosmeticHeavy =
    changeTypes.includes("style") &&
    changeTypes.includes("asset") &&
    !changeTypes.some((type) =>
      ["route", "component", "text", "button", "form", "api", "config"].includes(type)
    );

  if (onlyStyle) return 10;
  if (onlyAsset) return 15;
  if (cosmeticHeavy) return 20;

  return 0;
}

function computeRarityScore(current, history) {
  const recent = (history || []).slice(0, 6);
  const quietRecent = recent.filter(
    (item) =>
      Number(item.movementCount ?? 0) === 0 &&
      Number(item.score ?? 0) === 0 &&
      !(item.focusAreas || []).length
  );

  let rarity = 0;

  if (recent.length >= 3 && quietRecent.length >= 3) rarity += 20;
  if (recent.length >= 6 && quietRecent.length >= 6) rarity += 30;

  const currentFocus = detectFocusAreas(current);
  const seen = new Set(recent.flatMap((item) => item.focusAreas || []));

  currentFocus.forEach((area) => {
    if (!seen.has(area)) rarity += 10;
  });

  return clampScore(rarity);
}

function computePersistenceBonus(current, history) {
  const currentFocus = detectFocusAreas(current);
  if (!currentFocus.length) return 0;

  const recent = (history || []).slice(0, 2);

  const repeated = recent.filter((item) => {
    const itemFocus = item.focusAreas || [];
    return currentFocus.some((focus) => itemFocus.includes(focus));
  });

  let bonus = 0;

  if (repeated.length >= 2) {
    bonus += 10;
    if (Number(current.trend ?? 0) > 0) bonus += 15;
  }

  return clampScore(bonus);
}

function computeFinalScore(current, history) {
  const focusAreas = detectFocusAreas(current);
  const changeTypes = detectChangeTypes(current);

  const baseScore = computeBaseScore(current);
  const sensitivityBonus = computeSensitivityBonus(focusAreas);
  const rarityScore = computeRarityScore(current, history);
  const persistenceBonus = computePersistenceBonus(current, history);
  const noisePenalty = computeNoisePenalty(changeTypes);

  return clampScore(
    baseScore + sensitivityBonus + rarityScore + persistenceBonus - noisePenalty
  );
}

function computeSignificance(score, focusAreas) {
  if (score <= 0) return "NONE";
  if (focusAreas.includes("REWARDS") || focusAreas.includes("CLAIM")) {
    return score >= 55 ? "HIGH" : "WATCH";
  }
  if (score <= 24) return "LOW";
  if (score <= 54) return "WATCH";
  return "HIGH";
}

function scoreToLevel(score) {
  if (score <= 0) return "LOW";
  if (score < 25) return "LOW";
  if (score < 55) return "MEDIUM";
  if (score < 80) return "HIGH";
  return "VERY HIGH";
}

function shouldTriggerAlert(current, history) {
  const focusAreas = detectFocusAreas(current);
  const rarityScore = computeRarityScore(current, history);
  const finalScore = computeFinalScore(current, history);
  const significance = computeSignificance(finalScore, focusAreas);

  if (significance === "HIGH") return true;
  if (rarityScore >= 70) return true;
  if (focusAreas.includes("REWARDS")) return true;
  if (focusAreas.includes("CLAIM")) return true;

  return false;
}

function summarizeRadarIntelligence(current, history) {
  const focusAreas = detectFocusAreas(current);
  const sensitiveHits = detectSensitiveHits(current);
  const changeTypes = detectChangeTypes(current);
  const rarityScore = computeRarityScore(current, history);
  const score = computeFinalScore(current, history);
  const significance = computeSignificance(score, focusAreas);
  const level = scoreToLevel(score);
  const patternScore = computePatternScore(current, history);
  const patterns = detectPatterns(current, history);
  const launchImminent = detectLaunchImminent(current, history);
   
  if (launchImminent) {
     patterns.push("LAUNCH_IMMINENT");
   }
  
   const activationProbability = computeActivationProbability(current, history);
  const whyItMatters = buildWhyItMatters(current, history);

  return {
    focusAreas,
    sensitiveHits,
    changeTypes,
    rarityScore,
    score,
    significance,
    level,
    patternScore,
    patterns,
    launchImminent,
    activationProbability,
    shouldAlert: shouldTriggerAlert(current, history),
    whyItMatters,
  };
}

function clampScore(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function detectQuietBreakout(current, history) {
  const recent = (history || []).slice(0, 6);
  const quietCount = recent.filter(
    (item) =>
      Number(item.movementCount ?? 0) === 0 &&
      Number(item.score ?? 0) === 0 &&
      !(item.focusAreas || []).length
  ).length;

  const hasCurrentFocus = detectFocusAreas(current).length > 0;
  const hasCurrentMovement = Number(current.movementCount ?? 0) > 0;

  return quietCount >= 3 && hasCurrentFocus && hasCurrentMovement;
}

function detectSensitiveCluster(current) {
  const focusAreas = detectFocusAreas(current);

  const hasRewards = focusAreas.includes("REWARDS");
  const hasClaim = focusAreas.includes("CLAIM");
  const hasAuth = focusAreas.includes("AUTH");
  const hasWallet = focusAreas.includes("WALLET");

  const patterns = [];

  if (hasRewards && hasClaim) patterns.push("CLAIM_FLOW_ACTIVATION");
  if (hasAuth && hasWallet) patterns.push("AUTH_WALLET_COUPLING");
  if (hasRewards && hasAuth && hasWallet) patterns.push("SENSITIVE_CLUSTER");

  return patterns;
}

function detectRepeatedFocusPattern(current, history) {
  const currentFocus = detectFocusAreas(current);
  if (!currentFocus.length) return [];

  const recent = (history || []).slice(0, 3);
  const repeated = [];

  currentFocus.forEach((focus) => {
    const count = recent.filter((item) => (item.focusAreas || []).includes(focus)).length;
    if (count >= 2) {
      repeated.push(`REPEATED_${focus}_FOCUS`);
    }
  });

  return repeated;
}

function detectEscalationPattern(current, history) {
  const previous = (history || [])[0];
  if (!previous) return [];

  const patterns = [];
  const currentScore = Number(current.score ?? 0);
  const previousScore = Number(previous.score ?? 0);
  const currentFocusCount = detectFocusAreas(current).length;
  const previousFocusCount = (previous.focusAreas || []).length;

  if (currentScore > previousScore) {
    patterns.push("ESCALATING_SURFACE");
  }

  if (currentFocusCount > previousFocusCount) {
    patterns.push("EXPANDING_FOCUS");
  }

  return patterns;
}

function computePatternScore(current, history) {
  let score = 0;

  if (detectQuietBreakout(current, history)) score += 25;

  const clusterPatterns = detectSensitiveCluster(current);
  if (clusterPatterns.length) score += 20;

  const repeatedPatterns = detectRepeatedFocusPattern(current, history);
  if (repeatedPatterns.length) score += 20;

  const escalationPatterns = detectEscalationPattern(current, history);
  if (escalationPatterns.length) score += 15;

  return clampScore(score);
}

function detectPatterns(current, history) {
  const patterns = [];

  if (detectQuietBreakout(current, history)) {
    patterns.push("QUIET_BREAKOUT");
  }

  patterns.push(...detectSensitiveCluster(current));
  patterns.push(...detectRepeatedFocusPattern(current, history));
  patterns.push(...detectEscalationPattern(current, history));

  const focusAreas = detectFocusAreas(current);
  const movementCount = Number(current.movementCount ?? 0);

  if (focusAreas.length > 0 && movementCount <= 3) {
    patterns.push("LOW_VOLUME_HIGH_INTENT");
  }

  return [...new Set(patterns)];
}

function computeActivationProbability(current, history) {
  const finalScore = computeFinalScore(current, history);
  const rarityScore = computeRarityScore(current, history);
  const patternScore = computePatternScore(current, history);

  const value =
    finalScore * 0.45 +
    rarityScore * 0.2 +
    patternScore * 0.35;

  return clampScore(value);
}

function detectLaunchImminent(current, history) {
  const patterns = detectPatterns(current, history);
  const focus = detectFocusAreas(current);
  const backendSignals = current.backendSignals || [];

  const score = Number(current.score || 0);
  const trend = Number(current.trend || 0);

  const prev = Array.isArray(history) && history.length
    ? history[history.length - 1]
    : null;

  const prevScore = Number(prev?.score || 0);
  const prevSignals = prev?.signals || [];
  const prevFocus = prev?.focusAreas || [];

  // 🔥 CURRENT STATE
  const fusionStrong =
    current.signalFusion === "FULL ACTIVATION STACK";

  const eventStrong =
    current.eventType === "CLAIM READINESS";

  const scoreStrong = score >= 70;

  const activationSignals =
    focus.includes("REWARDS") ||
    focus.includes("CLAIM");

  const backendConfirmed =
    backendSignals.includes("canclaim_true") ||
    backendSignals.includes("eligible_true");

  // 🧠 TRANSITION ANALYSIS
  const scoreJump = score - prevScore >= 10;

  const newSignals =
    current.signals?.some((s) => !prevSignals.includes(s)) || false;

  const focusExpansion =
    focus.length > prevFocus.length;

  const escalation =
    patterns.includes("ESCALATING_SURFACE") ||
    patterns.includes("EXPANDING_FOCUS") ||
    trend > 0;

  const persistence =
    score >= 70 &&
    prevScore >= 60;

  // 🔥 CASE 1: HARD CONFIRMATION
  if (backendConfirmed && fusionStrong) {
    return true;
  }

  // 🔥 CASE 2: STRONG PRE-LAUNCH WITH TRANSITION
  if (
    fusionStrong &&
    eventStrong &&
    scoreStrong &&
    activationSignals &&
    (scoreJump || newSignals || focusExpansion || escalation)
  ) {
    return true;
  }

  // 🔥 CASE 3: PERSISTENT HIGH-CONVICTION STATE
  if (
    fusionStrong &&
    persistence &&
    (eventStrong || activationSignals)
  ) {
    return true;
  }

  return false;
}

function buildWhyItMatters(current, history) {
  const patterns = detectPatterns(current, history);
  const focus = detectFocusAreas(current);

  const messages = [];

  if (patterns.includes("CLAIM_FLOW_ACTIVATION")) {
    messages.push("Reward claim infrastructure appears to be activating.");
  }

  if (patterns.includes("AUTH_WALLET_COUPLING")) {
    messages.push("Wallet and authentication layers are being tightly integrated.");
  }

  if (patterns.includes("LOW_VOLUME_HIGH_INTENT")) {
    messages.push("Low activity but high-sensitivity changes suggest stealth deployment.");
  }

  if (patterns.includes("QUIET_BREAKOUT")) {
    messages.push("Breakout detected after a period of inactivity.");
  }

  if (focus.includes("REWARDS")) {
    messages.push("Reward systems are a primary focus of current changes.");
  }

  return messages.join(" ");
}

module.exports = {
  summarizeRadarIntelligence,
};