const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const FEATURE_FLAG_NAMES = [
  "lockedMining",
  "lockedRewards",
  "lockedPndeth",
  "lockedPondwater",
  "lockedSwap",
  "lockedVoting",
  "lockLeaderBoard",
  "multiChainSupport",
  "menuPondWater",
  "menuBoosters",
  "menuPndeth",
  "unlockVoid",
  "unlockPoints",
];

const ROUTE_HINTS = [
  "/leaderboard",
];

const SEMANTIC_KEYWORDS = [
  "claim",
  "reward",
  "rewards",
  "eligible",
  "canclaim",
  "enabled",
  "active",
  "wallet",
  "account",
  "verify",
  "nonce",
  "portal",
  "airdrop",
  "payout",
  "leaderboard",
];

function extractBooleanFlag(text, flagName) {
  const escaped = flagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escaped}\\s*:\\s*(!0|!1|true|false)`, "g"),
    new RegExp(`["']${escaped}["']\\s*:\\s*(!0|!1|true|false)`, "g"),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;

    const raw = match[1];
    return {
      found: true,
      value: raw === "true" || raw === "!0",
      raw,
    };
  }

  return { found: false, value: null, raw: null };
}

function extractBuildId(text) {
  const patterns = [
    /["']?buildId["']?\s*[:=]\s*["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function normalizeBundleUrl(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(value || "").split("?")[0].split("#")[0];
  }
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function extractSemanticEvidence(text) {
  const lower = String(text || "").toLowerCase();
  const routes = new Set();
  const apiRoutes = new Set();
  const keywords = new Set();
  const flags = new Set();

  const routeRegex = /["'`](\/[a-zA-Z0-9_\-./{}:[\]]{2,120})["'`]/g;
  let match;
  while ((match = routeRegex.exec(text)) !== null) {
    const route = match[1];
    if (!route || route.startsWith("//")) continue;
    if (/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|map)$/i.test(route)) continue;
    routes.add(route);
    if (route.includes("/api/")) apiRoutes.add(route);
    if (routes.size >= 80) break;
  }

  for (const keyword of SEMANTIC_KEYWORDS) {
    if (lower.includes(keyword)) keywords.add(keyword);
  }

  for (const flagName of FEATURE_FLAG_NAMES) {
    if (text.includes(flagName)) flags.add(flagName);
  }

  return {
    routes: uniqueSorted([...routes]).slice(0, 80),
    apiRoutes: uniqueSorted([...apiRoutes]).slice(0, 50),
    keywords: uniqueSorted([...keywords]),
    flags: uniqueSorted([...flags]),
  };
}

function buildBundleFingerprint(entries) {
  const rows = entries
    .filter((entry) => entry && entry.sourceClass === "FIRST_PARTY" && entry.sha256)
    .map((entry) => `${normalizeBundleUrl(entry.url || entry.file || "unknown")}:${entry.sha256}`)
    .sort();

  if (rows.length === 0) return null;

  return crypto
    .createHash("sha256")
    .update(rows.join("\n"))
    .digest("hex")
    .slice(0, 20);
}

async function probeFeatureRoute(baseUrl, route) {
  const url = new URL(route, baseUrl).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Pond0x-Radar/feature-surface" },
    });

    return {
      probed: true,
      status: response.status,
      ok: response.ok,
      finalUrl: response.url || url,
      error: null,
    };
  } catch (error) {
    return {
      probed: true,
      status: null,
      ok: false,
      finalUrl: url,
      error: error?.name === "AbortError" ? "TIMEOUT" : String(error?.message || error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractFeatureSurface({ captured, outDir, baseUrl }) {
  const flags = {};
  for (const flagName of FEATURE_FLAG_NAMES) {
    flags[flagName] = { observed: false, value: null, sources: [] };
  }

  const routes = {};
  for (const route of ROUTE_HINTS) {
    routes[route] = { referenced: false, sources: [] };
  }

  const buildIds = new Map();
  const firstPartyJavaScriptEntries = [];
  const bundleInventory = [];

  for (const entry of captured) {
    const contentType = String(entry.contentType || "").toLowerCase();
    const fileName = String(entry.file || "").toLowerCase();
    const looksLikeJavaScript = contentType.includes("javascript") || fileName.endsWith(".js");
    if (!looksLikeJavaScript) continue;

    if (entry.sourceClass === "FIRST_PARTY" && entry.sha256) {
      firstPartyJavaScriptEntries.push(entry);
    }

    const absolutePath = path.join(outDir, entry.file);
    if (!(await fs.pathExists(absolutePath))) continue;

    let text;
    try {
      text = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }

    if (entry.sourceClass === "FIRST_PARTY" && entry.sha256) {
      bundleInventory.push({
        key: normalizeBundleUrl(entry.url || entry.file),
        url: entry.url || null,
        file: entry.file || null,
        sha256: entry.sha256,
        size: Number(entry.size || Buffer.byteLength(text, "utf8")),
        semantic: extractSemanticEvidence(text),
      });
    }

    for (const flagName of FEATURE_FLAG_NAMES) {
      const result = extractBooleanFlag(text, flagName);
      if (!result.found) continue;
      const flag = flags[flagName];
      flag.observed = true;
      flag.value = result.value;
      flag.sources.push({ file: entry.file, url: entry.url, raw: result.raw });
    }

    for (const route of ROUTE_HINTS) {
      if (!text.includes(route)) continue;
      routes[route].referenced = true;
      routes[route].sources.push({ file: entry.file, url: entry.url });
    }

    const buildId = extractBuildId(text);
    if (buildId) {
      if (!buildIds.has(buildId)) buildIds.set(buildId, []);
      buildIds.get(buildId).push({ file: entry.file, url: entry.url });
    }
  }

  if (baseUrl) {
    for (const route of ROUTE_HINTS) {
      const routeState = routes[route];
      if (!routeState?.referenced) continue;
      routes[route] = {
        ...routeState,
        ...(await probeFeatureRoute(baseUrl, route)),
      };
    }
  }

  const observedFlags = Object.fromEntries(
    Object.entries(flags).filter(([, value]) => value.observed)
  );

  const buildCandidates = Array.from(buildIds.entries()).map(([value, sources]) => ({
    value,
    sources,
  }));

  const explicitBuildId = buildCandidates[0]?.value || null;
  const bundleFingerprint = buildBundleFingerprint(firstPartyJavaScriptEntries);

  return {
    buildId: explicitBuildId || (bundleFingerprint ? `bundle:${bundleFingerprint}` : null),
    buildIdSource: explicitBuildId
      ? "EXPLICIT_BUILD_ID"
      : bundleFingerprint
        ? "FIRST_PARTY_JS_FINGERPRINT"
        : "UNAVAILABLE",
    buildCandidates,
    bundleFingerprint,
    bundleInventory: bundleInventory.sort((a, b) => String(a.key).localeCompare(String(b.key))),
    bundleCount: bundleInventory.length,
    flags: observedFlags,
    routes,
    observedFlagCount: Object.keys(observedFlags).length,
    referencedRouteCount: Object.values(routes).filter((route) => route.referenced).length,
  };
}

function diffSet(previousValues, currentValues) {
  const previous = new Set(previousValues || []);
  const current = new Set(currentValues || []);
  return {
    added: uniqueSorted([...current].filter((value) => !previous.has(value))),
    removed: uniqueSorted([...previous].filter((value) => !current.has(value))),
  };
}

function collectBundleSemantic(inventory, field) {
  return uniqueSorted(
    (inventory || []).flatMap((bundle) => bundle?.semantic?.[field] || [])
  );
}

function buildBundleDiff(previous, current) {
  const previousInventory = Array.isArray(previous?.bundleInventory)
    ? previous.bundleInventory
    : [];
  const currentInventory = Array.isArray(current?.bundleInventory)
    ? current.bundleInventory
    : [];

  const comparable = Array.isArray(previous?.bundleInventory);
  if (!comparable) {
    return {
      comparable: false,
      status: "BASELINE",
      addedBundles: [],
      removedBundles: [],
      changedBundles: [],
      addedRoutes: [],
      removedRoutes: [],
      addedApiRoutes: [],
      removedApiRoutes: [],
      addedKeywords: [],
      removedKeywords: [],
      addedFlags: [],
      removedFlags: [],
    };
  }

  const previousMap = new Map(previousInventory.map((bundle) => [bundle.key, bundle]));
  const currentMap = new Map(currentInventory.map((bundle) => [bundle.key, bundle]));

  const addedBundles = currentInventory
    .filter((bundle) => !previousMap.has(bundle.key))
    .map((bundle) => ({ key: bundle.key, url: bundle.url, sha256: bundle.sha256, size: bundle.size }));

  const removedBundles = previousInventory
    .filter((bundle) => !currentMap.has(bundle.key))
    .map((bundle) => ({ key: bundle.key, url: bundle.url, sha256: bundle.sha256, size: bundle.size }));

  const changedBundles = currentInventory
    .filter((bundle) => {
      const before = previousMap.get(bundle.key);
      return before && before.sha256 !== bundle.sha256;
    })
    .map((bundle) => {
      const before = previousMap.get(bundle.key);
      const routeDiff = diffSet(before?.semantic?.routes, bundle?.semantic?.routes);
      const apiDiff = diffSet(before?.semantic?.apiRoutes, bundle?.semantic?.apiRoutes);
      const keywordDiff = diffSet(before?.semantic?.keywords, bundle?.semantic?.keywords);
      const flagDiff = diffSet(before?.semantic?.flags, bundle?.semantic?.flags);
      return {
        key: bundle.key,
        url: bundle.url,
        previousSha256: before?.sha256 || null,
        currentSha256: bundle.sha256,
        previousSize: Number(before?.size || 0),
        currentSize: Number(bundle.size || 0),
        sizeDelta: Number(bundle.size || 0) - Number(before?.size || 0),
        addedRoutes: routeDiff.added,
        removedRoutes: routeDiff.removed,
        addedApiRoutes: apiDiff.added,
        removedApiRoutes: apiDiff.removed,
        addedKeywords: keywordDiff.added,
        removedKeywords: keywordDiff.removed,
        addedFlags: flagDiff.added,
        removedFlags: flagDiff.removed,
      };
    });

  const routeDiff = diffSet(
    collectBundleSemantic(previousInventory, "routes"),
    collectBundleSemantic(currentInventory, "routes")
  );
  const apiDiff = diffSet(
    collectBundleSemantic(previousInventory, "apiRoutes"),
    collectBundleSemantic(currentInventory, "apiRoutes")
  );
  const keywordDiff = diffSet(
    collectBundleSemantic(previousInventory, "keywords"),
    collectBundleSemantic(currentInventory, "keywords")
  );
  const flagDiff = diffSet(
    collectBundleSemantic(previousInventory, "flags"),
    collectBundleSemantic(currentInventory, "flags")
  );

  const drift = addedBundles.length > 0 || removedBundles.length > 0 || changedBundles.length > 0;

  return {
    comparable: true,
    status: drift ? "DRIFT" : "STABLE",
    previousBundleCount: previousInventory.length,
    currentBundleCount: currentInventory.length,
    addedBundles: addedBundles.slice(0, 40),
    removedBundles: removedBundles.slice(0, 40),
    changedBundles: changedBundles.slice(0, 40),
    addedRoutes: routeDiff.added.slice(0, 80),
    removedRoutes: routeDiff.removed.slice(0, 80),
    addedApiRoutes: apiDiff.added.slice(0, 50),
    removedApiRoutes: apiDiff.removed.slice(0, 50),
    addedKeywords: keywordDiff.added,
    removedKeywords: keywordDiff.removed,
    addedFlags: flagDiff.added,
    removedFlags: flagDiff.removed,
  };
}

function compareFeatureSurface(previous, current) {
  if (!previous) {
    return {
      comparable: false,
      status: "BASELINE",
      buildChanged: false,
      previousBuildId: null,
      currentBuildId: current?.buildId || null,
      flagChanges: [],
      routeChanges: [],
      bundleDiff: buildBundleDiff(null, current),
    };
  }

  const flagChanges = [];
  const names = new Set([
    ...Object.keys(previous.flags || {}),
    ...Object.keys(current.flags || {}),
  ]);

  for (const name of names) {
    const before = previous.flags?.[name];
    const after = current.flags?.[name];
    if (!before || !after || before.value === after.value) continue;
    flagChanges.push({ name, previous: before.value, current: after.value });
  }

  const routeChanges = [];
  const routeNames = new Set([
    ...Object.keys(previous.routes || {}),
    ...Object.keys(current.routes || {}),
  ]);

  for (const route of routeNames) {
    const previousRoute = previous.routes?.[route] || null;
    const currentRoute = current.routes?.[route] || null;
    const beforeReferenced = Boolean(previousRoute?.referenced);
    const afterReferenced = Boolean(currentRoute?.referenced);
    const referenceChanged = beforeReferenced !== afterReferenced;
    const previousStatus = Number.isInteger(previousRoute?.status) ? previousRoute.status : null;
    const currentStatus = Number.isInteger(currentRoute?.status) ? currentRoute.status : null;
    const statusChanged =
      previousStatus !== null && currentStatus !== null && previousStatus !== currentStatus;

    if (!referenceChanged && !statusChanged) continue;

    routeChanges.push({
      route,
      referenceChanged,
      previousReferenced: beforeReferenced,
      currentReferenced: afterReferenced,
      statusChanged,
      previousStatus,
      currentStatus,
      becameReachable:
        previousStatus !== null && previousStatus >= 400 &&
        currentStatus !== null && currentStatus >= 200 && currentStatus < 400,
      becameUnreachable:
        previousStatus !== null && previousStatus >= 200 && previousStatus < 400 &&
        currentStatus !== null && currentStatus >= 400,
    });
  }

  const previousBuildId = previous.buildId || null;
  const currentBuildId = current.buildId || null;
  const buildChanged = Boolean(
    previousBuildId && currentBuildId && previousBuildId !== currentBuildId
  );

  const bundleDiff = buildBundleDiff(previous, current);
  const driftDetected =
    buildChanged || flagChanges.length > 0 || routeChanges.length > 0 || bundleDiff.status === "DRIFT";

  return {
    comparable: true,
    status: driftDetected ? "DRIFT" : "STABLE",
    buildChanged,
    previousBuildId,
    currentBuildId,
    flagChanges,
    routeChanges,
    bundleDiff,
  };
}

module.exports = {
  FEATURE_FLAG_NAMES,
  ROUTE_HINTS,
  extractFeatureSurface,
  compareFeatureSurface,
};
