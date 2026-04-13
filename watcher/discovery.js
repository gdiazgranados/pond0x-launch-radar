const fs = require("fs-extra");
const path = require("path");

const snapshotFile = path.join(__dirname, "..", "public", "data", "latest.json");
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

function pickKeyFunctionCandidate(newLabels, newRoutes, newApiRoutes, newKeywords, criticalKeywords) {
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
  if (!snapshotDir) return { html: "", jsText: "", apiText: "" };

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
      apiText = JSON.stringify(apiJson);
    } catch {
      apiText = "";
    }
  }

  if (await fs.pathExists(assetsDir)) {
    const files = await fs.readdir(assetsDir);
    const jsFiles = files.filter((f) => f.endsWith(".js")).slice(0, 15);

    const chunks = [];
    for (const file of jsFiles) {
      try {
        const full = path.join(assetsDir, file);
        const content = await fs.readFile(full, "utf8");
        chunks.push(content.slice(0, 50000));
      } catch {
        // ignore binary/minified read failures
      }
    }

    jsText = chunks.join("\n");
  }

  return { html, jsText, apiText };
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

  const knownLabels = new Set(uniqueClean(known.knownLabels || []));
  const knownRoutes = new Set((known.knownRoutes || []).map((x) => String(x).toLowerCase().trim()));
  const knownApiRoutes = new Set((known.knownApiRoutes || []).map((x) => String(x).toLowerCase().trim()));
  const knownKeywords = new Set(uniqueClean(known.knownKeywords || []));
  const ignoredWords = new Set(uniqueClean(known.ignoredWords || []));

  let latest = {};
  if (await fs.pathExists(snapshotFile)) {
    latest = await fs.readJson(snapshotFile);
  }

  const { html, jsText, apiText } = await readSnapshotTextFiles(snapshotDir);
  const combinedText = [html, jsText, apiText].join("\n\n");

  const labelsFromHtml = extractVisibleLabelsFromHtml(html);
  const routesFromHtml = extractRoutesFromHtml(html);
  const apiRoutes = extractApiRoutesFromText(combinedText);
  const keywordCandidates = extractKeywordCandidates(labelsFromHtml).filter(
    (word) => !ignoredWords.has(word)
  );
  const criticalKeywords = extractCriticalKeywordsFromText(combinedText);

  const newLabels = labelsFromHtml.filter((label) => {
    const normalized = normalizeText(label);
    return normalized && !knownLabels.has(normalized);
  });

  const newRoutes = routesFromHtml.filter((route) => !knownRoutes.has(route));
  const newApiRoutes = apiRoutes.filter((route) => !knownApiRoutes.has(route));
  const newKeywords = keywordCandidates.filter((word) => {
    const normalized = normalizeText(word);
    return normalized && !knownKeywords.has(normalized) && !knownLabels.has(normalized);
  });

  const keyFunctionCandidate = pickKeyFunctionCandidate(
    newLabels,
    newRoutes,
    newApiRoutes,
    newKeywords,
    criticalKeywords
  );

  const newUnknownChange =
    newLabels.length > 0 ||
    newRoutes.length > 0 ||
    newApiRoutes.length > 0 ||
    newKeywords.length > 0 ||
    criticalKeywords.length > 0;

  const result = {
    checkedAt: new Date().toISOString(),
    sourceSnapshotId: latest?.id || null,
    snapshotDir: snapshotDir ? path.basename(snapshotDir) : null,
    newUnknownChange,
    keyFunctionCandidate,
    newLabels: newLabels.slice(0, 15),
    newRoutes: newRoutes.slice(0, 15),
    newApiRoutes: newApiRoutes.slice(0, 20),
    newKeywords: newKeywords.slice(0, 20),
    criticalKeywords: criticalKeywords.slice(0, 20),
  };

  await fs.ensureDir(path.dirname(outputFile));
  await fs.writeJson(outputFile, result, { spaces: 2 });

  console.log(
    `Discovery complete | unknown=${result.newUnknownChange} | candidate=${result.keyFunctionCandidate || "none"}`
  );
}

main().catch((error) => {
  console.error("discovery.js failed:", error);
  process.exit(1);
});