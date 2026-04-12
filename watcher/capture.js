const { chromium } = require("playwright");
const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const TARGET_URL = "https://www.pond0x.com";

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

async function main() {
  const stamp = nowStamp();
  const outDir = path.join(process.cwd(), "snapshots", stamp);
  const assetsDir = path.join(outDir, "assets");

  await fs.ensureDir(assetsDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const captured = [];
  const seen = new Set();

  page.on("response", async (response) => {
    try {
      const responseUrl = response.url();
      const status = response.status();
      const headers = response.headers();
      const contentType = headers["content-type"] || "";

      const interesting =
        responseUrl.endsWith(".js") ||
        responseUrl.endsWith(".css") ||
        responseUrl.endsWith(".map") ||
        contentType.includes("javascript") ||
        contentType.includes("css") ||
        contentType.includes("json") ||
        contentType.includes("source-map");

      if (!interesting || seen.has(responseUrl)) return;
      seen.add(responseUrl);

      const body = await response.body();
      const hash = sha256(body);

      let filename;
      try {
        const parsed = new global.URL(responseUrl);
        filename = sanitizeFilename(parsed.pathname.replace(/^\/+/, "") || "root");
        if (!path.extname(filename)) {
          if (contentType.includes("javascript")) filename += ".js";
          else if (contentType.includes("css")) filename += ".css";
          else if (contentType.includes("json")) filename += ".json";
          else if (contentType.includes("source-map")) filename += ".map";
          else filename += ".bin";
        }
      } catch {
        filename = sanitizeFilename(hash + ".bin");
      }

      const savePath = path.join(assetsDir, filename);
      await fs.ensureDir(path.dirname(savePath));
      await fs.writeFile(savePath, body);

      captured.push({
        url: responseUrl,
        status,
        contentType,
        file: path.relative(outDir, savePath),
        sha256: hash,
        size: body.length,
      });
    } catch (err) {
      console.error("Error capturando response:", err.message);
    }
  });

  console.log("Navigating to:", TARGET_URL);

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 90000 });

  console.log("Page loaded, waiting for network activity...");

  await page.waitForTimeout(8000); // 👈 FORZAR CAPTURA REAL

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

  await fs.writeJson(path.join(outDir, "urls.json"), captured, { spaces: 2 });
  await fs.writeJson(
    path.join(outDir, "manifest.json"),
    {
      url: TARGET_URL,
      title,
      capturedAt: new Date().toISOString(),
      links,
    },
    { spaces: 2 }
  );

  await browser.close();

  console.log(`Snapshot guardado en: ${outDir}`);
  console.log(`Archivos capturados: ${captured.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});