const { chromium } = require("playwright");
const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const TARGET_URL = "https://www.pond0x.com";

const INTERESTING_API_HINTS = [
  "/api/",
  "claim",
  "reward",
  "rewards",
  "account",
  "auth",
  "verify",
  "wallet",
  "portal",
  "airdrop",
  "payout",
  "eligible",
  "user",
  "nonce",
];

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "_");
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isInterestingResponse(responseUrl, contentType) {
  const lowerUrl = String(responseUrl || "").toLowerCase();
  const lowerType = String(contentType || "").toLowerCase();

  return (
    lowerUrl.endsWith(".js") ||
    lowerUrl.endsWith(".css") ||
    lowerUrl.endsWith(".map") ||
    lowerType.includes("javascript") ||
    lowerType.includes("css") ||
    lowerType.includes("json") ||
    lowerType.includes("source-map") ||
    INTERESTING_API_HINTS.some((hint) => lowerUrl.includes(hint))
  );
}

function isApiLikeResponse(responseUrl, contentType) {
  const lowerUrl = String(responseUrl || "").toLowerCase();
  const lowerType = String(contentType || "").toLowerCase();

  return (
    lowerType.includes("json") ||
    lowerUrl.includes("/api/") ||
    INTERESTING_API_HINTS.some((hint) => lowerUrl.includes(hint))
  );
}

function buildFileNameFromUrl(responseUrl, contentType, fallbackHash) {
  try {
    const parsed = new global.URL(responseUrl);
    let filename = sanitizeFilename(parsed.pathname.replace(/^\/+/, "") || "root");

    if (!path.extname(filename)) {
      if (String(contentType).includes("javascript")) filename += ".js";
      else if (String(contentType).includes("css")) filename += ".css";
      else if (String(contentType).includes("json")) filename += ".json";
      else if (String(contentType).includes("source-map")) filename += ".map";
      else filename += ".bin";
    }

    return filename;
  } catch {
    return sanitizeFilename(`${fallbackHash}.bin`);
  }
}

function extractEndpointHints(text) {
  const lower = String(text || "").toLowerCase();
  const hits = [];

  const patterns = [
    "/api/claim",
    "/api/rewards",
    "/api/account",
    "/api/auth",
    "/api/verify",
    "/api/wallet",
    "/api/user",
    "/api/portal",
    "/api/airdrop",
    "/api/payout",
    "/api/nonce",
    "claim",
    "eligible",
    "rewards",
    "wallet",
    "account",
    "verify",
    "auth",
    "nonce",
    "active",
    "enabled",
    "canclaim",
    "isenabled",
  ];

  for (const p of patterns) {
    if (lower.includes(p)) hits.push(p);
  }

  return [...new Set(hits)];
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function main() {
  const stamp = nowStamp();
  const outDir = path.join(process.cwd(), "snapshots", stamp);
  const assetsDir = path.join(outDir, "assets");
  const apiDir = path.join(outDir, "api");

  await fs.ensureDir(assetsDir);
  await fs.ensureDir(apiDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const captured = [];
  const apiCaptured = [];
  const seen = new Set();

  page.on("response", async (response) => {
    try {
      const responseUrl = response.url();
      const status = response.status();
      const headers = response.headers();
      const contentType = headers["content-type"] || "";
      const method = response.request().method();

      if (!isInterestingResponse(responseUrl, contentType) || seen.has(responseUrl)) return;
      seen.add(responseUrl);

      const body = await response.body();
      const hash = sha256(body);
      const filename = buildFileNameFromUrl(responseUrl, contentType, hash);
      const isApi = isApiLikeResponse(responseUrl, contentType);

      const saveBaseDir = isApi ? apiDir : assetsDir;
      const savePath = path.join(saveBaseDir, filename);

      await fs.ensureDir(path.dirname(savePath));
      await fs.writeFile(savePath, body);

      const entry = {
        url: responseUrl,
        method,
        status,
        contentType,
        file: path.relative(outDir, savePath),
        sha256: hash,
        size: body.length,
        isApiLike: isApi,
      };

      captured.push(entry);

      if (isApi) {
        const textBody = await safeReadText(response);
        const hints = extractEndpointHints(`${responseUrl}\n${textBody}`);

        apiCaptured.push({
          ...entry,
          endpointHints: hints,
          bodyPreview: textBody.slice(0, 1200),
        });
      }
    } catch (err) {
      console.error("Error capturando response:", err.message);
    }
  });

  console.log("Navigating to:", TARGET_URL);

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 90000 });

  console.log("Page loaded, waiting for network activity...");

  await page.waitForTimeout(8000);

  console.log("Capture window complete");

  const html = await page.content();
  await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");

  const title = await page.title();
  const links = await page.$$eval("script,link", (els) =>
    els.map((el) => ({
      tag: el.tagName,
      src: el.src || el.href || "",
      rel: el.rel || "",
      type: el.type || "",
    }))
  );

  const pageSignals = extractEndpointHints(html);

  await fs.writeJson(path.join(outDir, "urls.json"), captured, { spaces: 2 });
  await fs.writeJson(path.join(outDir, "api.json"), apiCaptured, { spaces: 2 });
  await fs.writeJson(
    path.join(outDir, "manifest.json"),
    {
      url: TARGET_URL,
      title,
      capturedAt: new Date().toISOString(),
      links,
      pageSignals,
      assetCount: captured.length,
      apiCount: apiCaptured.length,
    },
    { spaces: 2 }
  );

  await browser.close();

  console.log(`Snapshot guardado en: ${outDir}`);
  console.log(`Archivos capturados: ${captured.length}`);
  console.log(`Respuestas API-like capturadas: ${apiCaptured.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});