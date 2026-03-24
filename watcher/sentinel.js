const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const SENTINEL_URL = "https://www.pond0x.com";
const STATE_PATH = path.join(__dirname, "output", "sentinel-state.json");

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function execNodeScript(scriptName) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(__dirname, scriptName)], { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Failed running ${scriptName}\n${stderr || error.message}`
          )
        );
        return;
      }

      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);

      resolve();
    });
  });
}

async function fetchSurface(url) {
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  const etag = response.headers.get("etag") || "";
  const lastModified = response.headers.get("last-modified") || "";
  const contentLength = response.headers.get("content-length") || String(html.length);

  return {
    url,
    etag,
    lastModified,
    contentLength,
    htmlHash: sha256(html),
    checkedAt: new Date().toISOString(),
  };
}

function buildQuickSignature(surface) {
  return [
    surface.etag,
    surface.lastModified,
    surface.contentLength,
    surface.htmlHash,
  ].join("|");
}

async function loadState() {
  if (!(await fs.pathExists(STATE_PATH))) {
    return null;
  }

  try {
    return await fs.readJson(STATE_PATH);
  } catch {
    return null;
  }
}

async function saveState(state) {
  await fs.ensureDir(path.dirname(STATE_PATH));
  await fs.writeJson(STATE_PATH, state, { spaces: 2 });
}

async function runDeepPipeline() {
  console.log("Change detected. Running deep radar pipeline...");
  await execNodeScript("capture.js");
  await execNodeScript("radar.js");
  await execNodeScript("update-history.js");
  await execNodeScript("notify.js");
  console.log("Deep radar pipeline completed.");
}

async function main() {
  console.log(`Sentinel checking ${SENTINEL_URL}`);

  const current = await fetchSurface(SENTINEL_URL);
  const currentSignature = buildQuickSignature(current);

  const previous = await loadState();
  const previousSignature = previous?.signature || null;

  const changed = previousSignature !== null && previousSignature !== currentSignature;

  const nextState = {
    url: SENTINEL_URL,
    signature: currentSignature,
    etag: current.etag,
    lastModified: current.lastModified,
    contentLength: current.contentLength,
    htmlHash: current.htmlHash,
    checkedAt: current.checkedAt,
    previousCheckedAt: previous?.checkedAt || null,
    changed,
  };

  await saveState(nextState);

  if (!previousSignature) {
    console.log("Sentinel baseline created. No deep scan on first run.");
    return;
  }

  if (!changed) {
    console.log("No surface change detected.");
    return;
  }

  await runDeepPipeline();
}

main().catch((err) => {
  console.error("Sentinel error:", err.message || err);
  process.exit(1);
});