const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const SURFACES = [
  { url: "https://www.pond0x.com", kind: "PUBLIC", label: "home" },
  { url: "https://www.pond0x.com/claim", kind: "CANDIDATE", label: "claim" },
  { url: "https://www.pond0x.com/rewards", kind: "CANDIDATE", label: "rewards" },
  { url: "https://www.pond0x.com/wallet", kind: "CANDIDATE", label: "wallet" },
];

const STATE_PATH = path.join(__dirname, "output", "sentinel-state.json");
const EVENTS_PATH = path.join(__dirname, "output", "sentinel-events.json");

const SENSITIVE_KEYWORDS = [
  "claim",
  "reward",
  "rewards",
  "wallet",
  "connect",
  "verify",
  "verification",
  "auth",
  "ethereum",
  "solana",
  "portal",
  "dashboard",
  "xp",
  "points",
];

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function execNodeScript(scriptName) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(__dirname, scriptName)],
      { cwd: __dirname, env: process.env },
      (error, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);

        if (error) {
          reject(
            new Error(`Failed running ${scriptName}\n${stderr || error.message}`)
          );
          return;
        }

        resolve();
      }
    );
  });
}

async function fetchSurface(url) {
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    redirect: "follow",
  });

  const text = await response.text().catch(() => "");

  return {
    url,
    status: response.status,
    ok: response.ok,
    redirected: response.redirected,
    finalUrl: response.url,
    etag: response.headers.get("etag") || "",
    lastModified: response.headers.get("last-modified") || "",
    contentLength: response.headers.get("content-length") || String(text.length),
    htmlHash: sha256(text),
    htmlSnippet: text.slice(0, 5000),
    checkedAt: new Date().toISOString(),
  };
}

function findSensitiveKeywords(text) {
  const lower = String(text || "").toLowerCase();
  return SENSITIVE_KEYWORDS.filter((keyword) => lower.includes(keyword));
}

function buildSurfaceSignature(surface) {
  return [
    surface.status,
    surface.finalUrl,
    surface.etag,
    surface.lastModified,
    surface.contentLength,
    surface.htmlHash,
  ].join("|");
}

function buildStateSignature(results) {
  return results.map((surface) => buildSurfaceSignature(surface)).join("||");
}

async function loadJson(filePath, fallback) {
  if (!(await fs.pathExists(filePath))) return fallback;

  try {
    const data = await fs.readJson(filePath);
    return data;
  } catch {
    return fallback;
  }
}

async function saveJson(filePath, data) {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, data, { spaces: 2 });
}

function analyzeChanges(previousState, currentResults) {
  const previousSurfaces = new Map(
    ((previousState && previousState.results) || []).map((item) => [item.url, item])
  );

  const changedSurfaces = [];
  const activatedCandidates = [];
  const keywordTriggers = [];

  for (const current of currentResults) {
    const previous = previousSurfaces.get(current.url);

    const currentKeywords = findSensitiveKeywords(current.htmlSnippet);
    const previousKeywords = previous ? findSensitiveKeywords(previous.htmlSnippet || "") : [];

    const previousKeywordSet = new Set(previousKeywords);
    const newKeywords = currentKeywords.filter((keyword) => !previousKeywordSet.has(keyword));

    const signatureChanged =
      !previous || buildSurfaceSignature(previous) !== buildSurfaceSignature(current);

    if (signatureChanged) {
      changedSurfaces.push({
        url: current.url,
        label: current.label,
        kind: current.kind,
        previousStatus: previous ? previous.status : null,
        currentStatus: current.status,
      });
    }

    if (
      current.kind === "CANDIDATE" &&
      previous &&
      previous.status >= 400 &&
      current.status < 400
    ) {
      activatedCandidates.push({
        url: current.url,
        label: current.label,
        from: previous.status,
        to: current.status,
      });
    }

    if (newKeywords.length > 0) {
      keywordTriggers.push({
        url: current.url,
        label: current.label,
        keywords: newKeywords,
      });
    }
  }

  const reasons = [];

  if (activatedCandidates.length > 0) {
    reasons.push(
      `candidate activated: ${activatedCandidates.map((x) => x.label).join(", ")}`
    );
  }

  if (keywordTriggers.length > 0) {
    reasons.push(
      `new sensitive keywords: ${keywordTriggers
        .map((x) => `${x.label}(${x.keywords.join(",")})`)
        .join("; ")}`
    );
  }

  if (changedSurfaces.length > 0) {
    reasons.push(
      `surface changed: ${changedSurfaces.map((x) => x.label).join(", ")}`
    );
  }

  return {
    changed: changedSurfaces.length > 0,
    changedSurfaces,
    activatedCandidates,
    keywordTriggers,
    triggerReason: reasons.join(" | ") || "no-change",
  };
}

async function appendSentinelEvent(event) {
  const events = await loadJson(EVENTS_PATH, []);
  const next = [event, ...events].slice(0, 100);
  await saveJson(EVENTS_PATH, next);
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
  console.log("Sentinel V2 checking multiple surfaces...");

  const results = [];

  for (const surface of SURFACES) {
    try {
      const fetched = await fetchSurface(surface.url);
      results.push({
        ...fetched,
        kind: surface.kind,
        label: surface.label,
      });
      console.log(
        `Checked ${surface.label}: status=${fetched.status} final=${fetched.finalUrl}`
      );
    } catch (err) {
      console.warn(`Failed fetching ${surface.url}: ${err.message}`);
    }
  }

  const previousState = await loadJson(STATE_PATH, null);
  const currentSignature = buildStateSignature(results);
  const previousSignature = previousState?.signature || null;

  const analysis = analyzeChanges(previousState, results);

  const nextState = {
    checkedAt: new Date().toISOString(),
    signature: currentSignature,
    changed: previousSignature !== null && currentSignature !== previousSignature,
    triggerReason: analysis.triggerReason,
    results: results.map((item) => ({
      url: item.url,
      label: item.label,
      kind: item.kind,
      status: item.status,
      finalUrl: item.finalUrl,
      etag: item.etag,
      lastModified: item.lastModified,
      contentLength: item.contentLength,
      htmlHash: item.htmlHash,
      htmlSnippet: item.htmlSnippet,
      checkedAt: item.checkedAt,
    })),
  };

  await saveJson(STATE_PATH, nextState);

  if (!previousSignature) {
    await appendSentinelEvent({
      checkedAt: nextState.checkedAt,
      changed: false,
      triggerReason: "baseline-created",
      changedSurfaces: [],
      activatedCandidates: [],
      keywordTriggers: [],
    });

    console.log("Sentinel baseline created. No deep scan on first run.");
    return;
  }

  const shouldTriggerDeepScan =
    currentSignature !== previousSignature && analysis.changed;

  await appendSentinelEvent({
    checkedAt: nextState.checkedAt,
    changed: shouldTriggerDeepScan,
    triggerReason: analysis.triggerReason,
    changedSurfaces: analysis.changedSurfaces,
    activatedCandidates: analysis.activatedCandidates,
    keywordTriggers: analysis.keywordTriggers,
  });

  if (!shouldTriggerDeepScan) {
    console.log("No surface change detected.");
    return;
  }

  console.log(`Trigger reason: ${analysis.triggerReason}`);
  await runDeepPipeline();
}

main().catch((err) => {
  console.error("Sentinel error:", err.message || err);
  process.exit(1);
});