const fs = require("fs-extra");
const path = require("path");

const knownSurfaceFile = path.join(__dirname, "known-surface.json");
const outputFile = path.join(__dirname, "..", "public", "data", "discovery.json");

function getLatestSnapshotDir() {
  const snapshotsDir = path.join(process.cwd(), "snapshots");

  if (!fs.existsSync(snapshotsDir)) return null;

  const folders = fs
    .readdirSync(snapshotsDir)
    .filter((f) => f.includes("_"))
    .sort()
    .reverse();

  if (folders.length === 0) return null;

  return path.join(snapshotsDir, folders[0]);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueClean(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function extractVisibleLabelsFromHtml(html) {
  const textMatches = [];
  const tagRegex = />\s*([^<>]{2,120}?)\s*</g;

  const ignoredLabelSet = new Set([
    "use",
    "get",
    "new",
    "all",
    "more",
    "home",
    "menu",
    "explore",
    "learn",
    "terms",
    "privacy",
    "login",
    "sign",
    "button",
    "open",
    "close",
    "click",
    "submit",
    "loading",
    "pond",
    "pond0x",
    "pondd🤝x",
    "sol",
    "apy",
  ]);

  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const text = normalizeText(match[1]);

    if (!text) continue;
    if (text.length < 2) continue;
    if (/^[0-9\s.,:%$-]+$/.test(text)) continue;
    if (/^[^\p{L}\p{N}]+$/u.test(text)) continue;
    if (/^v\d+$/i.test(text)) continue;
    if (ignoredLabelSet.has(text)) continue;

    if (
      text.startsWith("follow ") ||
      text.startsWith("join ") ||
      text.startsWith("learn more") ||
      text.startsWith("read more")
    ) {
      continue;
    }

    if (
      text.includes("function(") ||
      text.includes("=>") ||
      text.includes("document.") ||
      text.includes("window.") ||
      text.includes("appendchild") ||
      text.includes("createelement") ||
      text.includes("getelementbyid") ||
      text.includes("queryselector") ||
      text.includes("addeventlistener") ||
      text.includes("innerhtml") ||
      text.includes("javascript") ||
      text.includes("{") ||
      text.includes("}") ||
      text.includes(";")
    ) {
      continue;
    }

    if (/[\(\)\[\]=]/.test(text)) continue;

    textMatches.push(text);
  }

  return uniqueClean(textMatches);
}

function extractRoutesFromHtml(html) {
  const routes = [];
  const hrefRegex = /href=["']([^"'#]+)["']/gi;

  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    let href = String(match[1] || "").trim().toLowerCase();

    if (!href) continue;
    if (href.startsWith("http")) continue;
    if (href.startsWith("mailto:")) continue;
    if (href.startsWith("tel:")) continue;

    if (!href.startsWith("/")) href = `/${href}`;

    if (href.startsWith("/_next/")) continue;
    if (href.startsWith("/static/")) continue;
    if (href.startsWith("/images/")) continue;
    if (href.startsWith("/img/")) continue;
    if (href.startsWith("/favicon")) continue;

    if (
      href.endsWith(".css") ||
      href.endsWith(".js") ||
      href.endsWith(".png") ||
      href.endsWith(".jpg") ||
      href.endsWith(".jpeg") ||
      href.endsWith(".svg") ||
      href.endsWith(".webp") ||
      href.endsWith(".ico") ||
      href.endsWith(".json") ||
      href.endsWith(".map") ||
      href.endsWith(".txt") ||
      href.endsWith(".xml")
    ) {
      continue;
    }

    routes.push(href);
  }

  return [...new Set(routes)];
}

function extractApiRoutesFromText(text) {
  const routes = new Set();
  const source = String(text || "");

  const patterns = [
    /\/api\/[a-z0-9/_-]+/gi,
    /https?:\/\/[^"'`\s]+\/api\/[a-z0-9/_-]+/gi,
    /["'`]\/[a-z0-9/_-]*(claim|reward|rewards|account|auth|verify|wallet|portal|airdrop|payout|eligible|user|nonce)[a-z0-9/_-]*["'`]/gi,
  ];

  for (const regex of patterns) {
    const matches = source.match(regex) || [];

    for (const m of matches) {
      routes.add(
        String(m)
          .replace(/^["'`]/, "")
          .replace(/["'`]$/, "")
          .toLowerCase()
          .trim()
      );
    }
  }

  return [...routes].sort();
}

function extractKeywordCandidates(labels) {
  const words = [];

  const ignoredKeywordSet = new Set([
    "daily",
    "total",
    "distributed",
    "swaps",
    "rewards",
    "wallet",
    "change",
    "connect",
    "pond",
    "pond0x",
    "pondd",
    "coinmarketcap",
  ]);

  for (const label of labels) {
    const parts = label
      .split(/[^a-z0-9]+/i)
      .map(normalizeText)
      .filter(Boolean);

    for (const part of parts) {
      if (part.length < 4) continue;
      if (ignoredKeywordSet.has(part)) continue;

      if (
        part.includes("document") ||
        part.includes("appendchild") ||
        part.includes("window") ||
        part.includes("createelement") ||
        part.includes("queryselector") ||
        part.includes("innerhtml") ||
        part.includes("addeventlistener") ||
        part.includes("coinmarketcap") ||
        part.includes("coingecko") ||
        part.includes("dexscreener")
      ) {
        continue;
      }

      words.push(part);
    }
  }

  return uniqueClean(words);
}

function extractCriticalKeywordsFromText(text) {
  const source = normalizeText(text);

  const candidates = [
    "claim",
    "claim now",
    "eligible",
    "active",
    "canclaim",
    "isenabled",
    "enabled",
    "disabled",
    "available rewards",
    "wallet",
    "account",
    "verify",
    "signin",
    "signmessage",
    "verifysignature",
    "nonce",
    "reward",
    "rewards",
    "airdrop",
    "payout",
    "portal",
  ];

  return candidates.filter((k) => source.includes(k));
}

function isNoisyDynamicLabel(value) {
  const normalized = normalizeText(value);

  if (!normalized) return true;

  const exactNoise = new Set([
    "just now",
    "messages",
    "maybe",
    "maybe pond0x",
  ]);

  if (exactNoise.has(normalized)) {
    return true;
  }

  // Relative-time UI text.
  if (
    /^(just now|\d+\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\s*ago)$/.test(
      normalized
    )
  ) {
    return true;
  }

  // Dynamic mining/feed counters such as:
  // "⛏️ mining burned 5.7m b"
  if (
    normalized.includes("mining") &&
    normalized.includes("burned") &&
    /\d/.test(normalized)
  ) {
    return true;
  }

  return false;
}

function pickKeyFunctionCandidate(
  newLabels,
  newRoutes,
  newApiRoutes,
  newKeywords,
  criticalKeywords
) {
  const firstCritical = criticalKeywords.find(Boolean);
  if (firstCritical) return `critical:${firstCritical}`;

  const firstApi = newApiRoutes.find(Boolean);
  if (firstApi) return `api:${firstApi}`;

  const firstUsefulLabel = newLabels.find(Boolean);
  if (firstUsefulLabel) return firstUsefulLabel;

  const firstUsefulRoute = newRoutes.find(Boolean);
  if (firstUsefulRoute) return firstUsefulRoute;

  const firstUsefulKeyword = newKeywords.find(Boolean);
  if (firstUsefulKeyword) return firstUsefulKeyword;

  return null;
}

async function readSnapshotTextFiles(snapshotDir) {
  if (!snapshotDir) {
    return {
      html: "",
      jsText: "",
      apiText: "",
    };
  }

  const htmlFile = path.join(snapshotDir, "index.html");
  const apiFile = path.join(snapshotDir, "api.json");
  const assetsDir = path.join(snapshotDir, "assets");

  let html = "";
  let apiText = "";
  let jsText = "";

  if (await fs.pathExists(htmlFile)) {
    html = await fs.readFile(htmlFile, "utf8");
  }

  if (await fs.pathExists(apiFile)) {
    try {
      const apiJson = await fs.readJson(apiFile);

      const firstPartyApi = Array.isArray(apiJson)
        ? apiJson.filter((entry) => {
            if (entry?.sourceClass === "FIRST_PARTY") {
              return true;
            }

            // Backward compatibility for snapshots created before
            // explicit source attribution was added.
            if (!entry?.sourceClass && entry?.url) {
              try {
                return new URL(entry.url).hostname === "www.pond0x.com";
              } catch {
                return false;
              }
            }

            return false;
          })
        : [];

      apiText = JSON.stringify(firstPartyApi);
    } catch {
      apiText = "";
    }
  }

  if (await fs.pathExists(assetsDir)) {
    const files = await fs.readdir(assetsDir);

    const jsFiles = files
      .filter((f) => f.endsWith(".js"))
      .slice(0, 15);

    const chunks = [];

    for (const file of jsFiles) {
      try {
        const full = path.join(assetsDir, file);
        const content = await fs.readFile(full, "utf8");

        chunks.push(content.slice(0, 50000));
      } catch {
        // Ignore binary/minified read failures.
      }
    }

    jsText = chunks.join("\n");
  }

  return {
    html,
    jsText,
    apiText,
  };
}

async function main() {
  const snapshotDir = getLatestSnapshotDir();

  let known = {
    knownLabels: [],
    knownRoutes: [],
    knownApiRoutes: [],
    knownKeywords: [],
    ignoredWords: [],
  };

  if (await fs.pathExists(knownSurfaceFile)) {
    known = await fs.readJson(knownSurfaceFile);
  }

  const knownLabels = new Set(
    uniqueClean(known.knownLabels || [])
  );

  const knownRoutes = new Set(
    (known.knownRoutes || []).map((x) =>
      String(x).toLowerCase().trim()
    )
  );

  const knownApiRoutes = new Set(
    (known.knownApiRoutes || []).map((x) =>
      String(x).toLowerCase().trim()
    )
  );

  const knownKeywords = new Set(
    uniqueClean(known.knownKeywords || [])
  );

  const ignoredWords = new Set(
    uniqueClean(known.ignoredWords || [])
  );

  const {
    html,
    jsText,
    apiText,
  } = await readSnapshotTextFiles(snapshotDir);

  const declaredText = [
    html,
    jsText,
  ].join("\n\n");

  const combinedText = [
    declaredText,
    apiText,
  ].join("\n\n");

  const declaredApiRoutes =
    extractApiRoutesFromText(declaredText);

  let liveApiRoutes = [];

  try {
    const apiFile = path.join(snapshotDir, "api.json");
    const apiJson = await fs.readJson(apiFile);

    liveApiRoutes = Array.isArray(apiJson)
      ? uniqueClean(
          apiJson
            .filter((entry) => {
              if (entry?.sourceClass === "FIRST_PARTY") {
                return true;
              }

              if (!entry?.sourceClass && entry?.url) {
                try {
                  return new URL(entry.url).hostname === "www.pond0x.com";
                } catch {
                  return false;
                }
              }

              return false;
            })
            .map((entry) => {
              try {
                return new URL(entry.url).pathname;
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        )
      : [];
  } catch {
    liveApiRoutes = [];
  }

  const labelsFromHtml =
    extractVisibleLabelsFromHtml(html);

  const routesFromHtml =
    extractRoutesFromHtml(html);

  const apiRoutes = uniqueClean([
    ...declaredApiRoutes,
    ...liveApiRoutes,
  ]);

  const keywordCandidates =
    extractKeywordCandidates(labelsFromHtml).filter(
      (word) => !ignoredWords.has(word)
    );

  const criticalKeywords =
    extractCriticalKeywordsFromText(combinedText);

  let previousDiscovery = {};

  if (await fs.pathExists(outputFile)) {
    try {
      previousDiscovery =
        await fs.readJson(outputFile);
    } catch {
      previousDiscovery = {};
    }
  }

  const currentLiveApiRouteSet = new Set(
    liveApiRoutes.map((route) =>
      String(route || "").toLowerCase().trim()
    )
  );

  const hasPreviousLiveApiBaseline =
    Array.isArray(previousDiscovery.liveApiRoutes);

  const previousLiveApiRouteSet = new Set(
    hasPreviousLiveApiBaseline
      ? previousDiscovery.liveApiRoutes.map((route) =>
          String(route || "").toLowerCase().trim()
        )
      : []
  );

  const declaredOnlyApiRoutes =
    declaredApiRoutes.filter((route) => {
      const normalized =
        String(route || "").toLowerCase().trim();

      return (
        normalized &&
        !currentLiveApiRouteSet.has(normalized)
      );
    });

  const newLiveApiRoutes =
    hasPreviousLiveApiBaseline
      ? liveApiRoutes.filter((route) => {
          const normalized =
            String(route || "").toLowerCase().trim();

          return (
            normalized &&
            !previousLiveApiRouteSet.has(normalized)
          );
        })
      : [];

  const previousObservedLabels = new Set(
    uniqueClean(
      previousDiscovery.observedLabels ||
      previousDiscovery.newLabels ||
      []
    )
  );

  const previousObservedRoutes = new Set(
    (
      previousDiscovery.observedRoutes ||
      previousDiscovery.newRoutes ||
      []
    ).map((x) =>
      String(x).toLowerCase().trim()
    )
  );

  const previousObservedApiRoutes = new Set(
    (
      previousDiscovery.observedApiRoutes ||
      previousDiscovery.newApiRoutes ||
      []
    ).map((x) =>
      String(x).toLowerCase().trim()
    )
  );

  const previousObservedKeywords = new Set(
    uniqueClean(
      previousDiscovery.observedKeywords ||
      previousDiscovery.newKeywords ||
      []
    )
  );

  const previousObservedCriticalKeywords = new Set(
    uniqueClean(
      previousDiscovery.observedCriticalKeywords ||
      previousDiscovery.criticalKeywords ||
      []
    )
  );

  /*
   * ============================================================
   * FRESH DISCOVERY DELTA
   * ============================================================
   *
   * Something is considered NEW only when it is absent from:
   *
   * 1. The long-term known surface.
   * 2. The previous discovery sweep.
   *
   * This prevents persistent routes and strings such as:
   *
   * /rewards
   * /claim
   * wallet
   * account
   * auth
   * portal
   *
   * from being interpreted as fresh evidence every sweep.
   */

  const newLabels = labelsFromHtml.filter((label) => {
    const normalized = normalizeText(label);

    return (
      normalized &&
      !isNoisyDynamicLabel(label) &&
      !knownLabels.has(normalized) &&
      !previousObservedLabels.has(normalized)
    );
  });

  const newRoutes = routesFromHtml.filter((route) => {
    const normalized =
      String(route || "")
        .toLowerCase()
        .trim();

    return (
      normalized &&
      !knownRoutes.has(normalized) &&
      !previousObservedRoutes.has(normalized)
    );
  });

  const newApiRoutes = apiRoutes.filter((route) => {
    const normalized =
      String(route || "")
        .toLowerCase()
        .trim();

    return (
      normalized &&
      !knownApiRoutes.has(normalized) &&
      !previousObservedApiRoutes.has(normalized)
    );
  });

  const newKeywords = keywordCandidates.filter(
    (word) => {
      const normalized = normalizeText(word);

      return (
        normalized &&
        !isNoisyDynamicLabel(word) &&
        !knownKeywords.has(normalized) &&
        !knownLabels.has(normalized) &&
        !previousObservedKeywords.has(normalized)
      );
    }
  );

  /*
   * Critical keywords require the same treatment.
   *
   * Seeing "claim" repeatedly is OBSERVED STATE.
   * Seeing "claim" for the first time is FRESH DISCOVERY.
   */

  const newCriticalKeywords =
    criticalKeywords.filter((keyword) => {
      const normalized =
        normalizeText(keyword);

      return (
        normalized &&
        !previousObservedCriticalKeywords.has(
          normalized
        )
      );
    });

  /*
   * Candidate selection now uses ONLY fresh evidence.
   */

  const keyFunctionCandidate =
    pickKeyFunctionCandidate(
      newLabels,
      newRoutes,
      newApiRoutes,
      newKeywords,
      newCriticalKeywords
    );

  /*
   * Unknown change is TRUE only when a fresh delta exists.
   */

  const newUnknownChange =
    newLabels.length > 0 ||
    newRoutes.length > 0 ||
    newApiRoutes.length > 0 ||
    newKeywords.length > 0 ||
    newCriticalKeywords.length > 0;

  /*
   * Bind discovery to the snapshot that was ACTUALLY inspected.
   *
   * This is intentionally NOT taken from latest.json.
   *
   * radar.js can compare this value against its current snapshot
   * and reject stale discovery evidence.
   */

  const currentSnapshotId =
    snapshotDir
      ? path.basename(snapshotDir)
      : null;

  const result = {
    checkedAt: new Date().toISOString(),

    sourceSnapshotId: currentSnapshotId,
    snapshotDir: currentSnapshotId,

    newUnknownChange,
    keyFunctionCandidate,

    /*
     * ==========================================================
     * FRESH DELTAS
     * ==========================================================
     *
     * These fields represent genuinely new discoveries.
     *
     * Radar scoring may use these as fresh evidence.
     */

    newLabels:
      newLabels.slice(0, 15),

    newRoutes:
      newRoutes.slice(0, 15),

    newApiRoutes:
      newApiRoutes.slice(0, 20),

    newKeywords:
      newKeywords.slice(0, 20),

    criticalKeywords:
      newCriticalKeywords.slice(0, 20),

    /*
     * ==========================================================
     * OBSERVED STATE
     * ==========================================================
     *
     * These fields preserve what currently exists in the
     * inspected surface.
     *
     * They are useful for research and diagnostics but MUST NOT
     * automatically be interpreted as fresh activation evidence.
     */

    observedLabels:
      labelsFromHtml.slice(0, 250),

    observedRoutes:
      routesFromHtml.slice(0, 250),

    liveApiRoutes:
      liveApiRoutes.slice(0, 100),

    newLiveApiRoutes:
      newLiveApiRoutes.slice(0, 100),

    declaredApiRoutes:
      declaredApiRoutes.slice(0, 250),

    declaredOnlyApiRoutes:
      declaredOnlyApiRoutes.slice(0, 250),

    observedApiRoutes:
      apiRoutes.slice(0, 250),

    observedKeywords:
      keywordCandidates.slice(0, 250),

    observedCriticalKeywords:
      criticalKeywords.slice(0, 100),

    /*
     * Diagnostics make it easier to verify that the false-positive
     * fix is behaving correctly.
     */

    diagnostics: {
      previousSnapshotId:
        previousDiscovery.snapshotDir ||
        previousDiscovery.sourceSnapshotId ||
        null,

      freshCounts: {
        labels: newLabels.length,
        routes: newRoutes.length,
        apiRoutes: newApiRoutes.length,
        liveApiRoutes: newLiveApiRoutes.length,
        keywords: newKeywords.length,
        criticalKeywords:
          newCriticalKeywords.length,
      },

      observedCounts: {
        labels: labelsFromHtml.length,
        routes: routesFromHtml.length,
        apiRoutes: apiRoutes.length,
        keywords: keywordCandidates.length,
        criticalKeywords:
          criticalKeywords.length,
      },
    },
  };

  await fs.ensureDir(
    path.dirname(outputFile)
  );

  await fs.writeJson(
    outputFile,
    result,
    {
      spaces: 2,
    }
  );

  console.log(
    `Discovery complete | unknown=${result.newUnknownChange} | candidate=${result.keyFunctionCandidate || "none"}`
  );
}

main().catch((error) => {
  console.error(
    "discovery.js failed:",
    error
  );

  process.exit(1);
});
