const fs = require("fs-extra");
const path = require("path");

const snapshotFile = path.join(__dirname, "..", "watcher", "output", "latest.json");
function getLatestSnapshotHtmlFile() {
  const snapshotsDir = path.join(__dirname, "..", "watcher", "snapshots");

  if (!fs.existsSync(snapshotsDir)) return null;

  const folders = fs
    .readdirSync(snapshotsDir)
    .filter((f) => f.includes("_"))
    .sort()
    .reverse();

  if (folders.length === 0) return null;

  const latestFolder = folders[0];

  const possibleFiles = [
    "index.html",
    "page.html",
    "snapshot.html",
    "home.html"
  ];

  for (const file of possibleFiles) {
    const fullPath = path.join(snapshotsDir, latestFolder, file);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

const knownSurfaceFile = path.join(__dirname, "known-surface.json");
const outputFile = path.join(__dirname, "..", "public", "data", "discovery.json");

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
  const tagRegex = />\s*([^<>]{2,80}?)\s*</g;

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
    "apy"
  ]);

  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const text = normalizeText(match[1]);

    if (!text) continue;
    if (text.length < 2) continue;
    if (/^[0-9\s.,:%$-]+$/.test(text)) continue;

    // ignorar labels compuestas solo por emoji / símbolos
    if (/^[^\p{L}\p{N}]+$/u.test(text)) continue;

    // ignorar labels de versión tipo v1, v2, v10
    if (/^v\d+$/i.test(text)) continue;

    // ignorar labels genéricas
    if (ignoredLabelSet.has(text)) continue;

    // ignorar textos promocionales / sociales comunes
    if (
      text.startsWith("follow ") ||
      text.startsWith("join ") ||
      text.startsWith("learn more") ||
      text.startsWith("read more")
    ) {
      continue;
    }

    // filtrar ruido técnico / código / js
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

    // filtrar cadenas demasiado raras
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

    // normalizar rutas relativas a formato /ruta
    if (!href.startsWith("/")) {
      href = `/${href}`;
    }

    // ignorar assets internos / estáticos
    if (href.startsWith("/_next/")) continue;
    if (href.startsWith("/static/")) continue;
    if (href.startsWith("/images/")) continue;
    if (href.startsWith("/img/")) continue;
    if (href.startsWith("/favicon")) continue;

    // ignorar archivos
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
    "coinmarketcap"
  ]);

  for (const label of labels) {
    const parts = label
      .split(/[^a-z0-9]+/i)
      .map(normalizeText)
      .filter(Boolean);

    for (const part of parts) {
      if (part.length < 5) continue;
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

function pickKeyFunctionCandidate(newLabels, newRoutes, newKeywords) {
  const firstUsefulLabel = newLabels.find(Boolean);
  if (firstUsefulLabel) return firstUsefulLabel;

  const firstUsefulRoute = newRoutes.find(Boolean);
  if (firstUsefulRoute) return firstUsefulRoute;

  const firstUsefulKeyword = newKeywords.find(Boolean);
  if (firstUsefulKeyword) return firstUsefulKeyword;

  return null;
}

async function main() {
  const known = await fs.readJson(knownSurfaceFile);

  const knownLabels = new Set(uniqueClean(known.knownLabels || []));
  const knownRoutes = new Set((known.knownRoutes || []).map((x) => String(x).toLowerCase().trim()));
  const knownKeywords = new Set(uniqueClean(known.knownKeywords || []));
  const ignoredWords = new Set(uniqueClean(known.ignoredWords || []));

  let html = "";

  const htmlFile = getLatestSnapshotHtmlFile();

  if (htmlFile && (await fs.pathExists(htmlFile))) {
    html = await fs.readFile(htmlFile, "utf8");
  } else {
    console.warn("No snapshot HTML file found");
  }

  let latest = {};
  if (await fs.pathExists(snapshotFile)) {
    latest = await fs.readJson(snapshotFile);
  }

  const labelsFromHtml = extractVisibleLabelsFromHtml(html);
  const routesFromHtml = extractRoutesFromHtml(html);
  const keywordCandidates = extractKeywordCandidates(labelsFromHtml).filter(
    (word) => !ignoredWords.has(word)
  );

  const newLabels = labelsFromHtml.filter((label) => {
    const normalized = normalizeText(label);
    return normalized && !knownLabels.has(normalized);
  });

  const newRoutes = routesFromHtml.filter((route) => !knownRoutes.has(route));
    const newKeywords = keywordCandidates.filter((word) => {
    const normalized = normalizeText(word);
    return normalized && !knownKeywords.has(normalized) && !knownLabels.has(normalized);
  });

  const keyFunctionCandidate = pickKeyFunctionCandidate(newLabels, newRoutes, newKeywords);
  const newUnknownChange =
    newLabels.length > 0 || newRoutes.length > 0 || newKeywords.length > 0;

  const result = {
    checkedAt: new Date().toISOString(),
    sourceSnapshotId: latest?.id || null,
    newUnknownChange,
    keyFunctionCandidate,
    newLabels: newLabels.slice(0, 15),
    newRoutes: newRoutes.slice(0, 15),
    newKeywords: newKeywords.slice(0, 15)
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