const { chromium } = require("playwright");
const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const TARGET_URL = "https://www.pond0x.com";
const TARGET_HOST = new URL(TARGET_URL).hostname;

function classifySource(responseUrl) {
  try {
    const parsed = new URL(responseUrl);

    return {
      sourceHost: parsed.hostname,
      sourceClass:
        parsed.hostname === TARGET_HOST
          ? "FIRST_PARTY"
          : "THIRD_PARTY",
    };
  } catch {
    return {
      sourceHost: "unknown",
      sourceClass: "UNKNOWN",
    };
  }
}

function normalizeSurfaceUrl(requestUrl) {
  try {
    const parsed = new URL(requestUrl);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return null;
    }

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

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

function extractJsonSchemaPaths(text) {
  try {
    const parsed = JSON.parse(String(text || ""));
    const paths = new Set();

    function visit(value, prefix = "") {
      if (Array.isArray(value)) {
        const arrayPath =
          prefix ? `${prefix}[]` : "[]";

        paths.add(arrayPath);

        if (value.length === 0) {
          paths.add(
            prefix
              ? `${prefix}[]:EMPTY_ARRAY`
              : "ROOT:EMPTY_ARRAY"
          );

          return;
        }

        visit(value[0], arrayPath);
        return;
      }

      if (
        value &&
        typeof value === "object"
      ) {
        const keys = Object.keys(value).sort();

        if (keys.length === 0) {
          paths.add(
            prefix
              ? `${prefix}:EMPTY_OBJECT`
              : "ROOT:EMPTY_OBJECT"
          );

          return;
        }

        for (const key of keys) {
          const nextPath =
            prefix
              ? `${prefix}.${key}`
              : key;

          paths.add(nextPath);
          visit(value[key], nextPath);
        }

        return;
      }
    }

    visit(parsed);

    return [...paths]
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

function buildSchemaFingerprint(schemaPaths) {
  if (
    !Array.isArray(schemaPaths) ||
    schemaPaths.length === 0
  ) {
    return null;
  }

  return sha256(
    Buffer.from(
      schemaPaths.join("\n"),
      "utf8"
    )
  );
}

function detectBackendSignals(text) {
  const lower = String(text || "").toLowerCase();
  const signals = [];

  if (lower.includes('"eligible":true') || lower.includes("eligible:true")) {
    signals.push("eligible_true");
  }

  if (lower.includes('"canclaim":true') || lower.includes("canclaim:true")) {
    signals.push("canclaim_true");
  }

  if (lower.includes('"isenabled":true') || lower.includes("isenabled:true")) {
    signals.push("enabled_true");
  }

  if (lower.includes('"enabled":true') || lower.includes("enabled:true")) {
    signals.push("enabled_true");
  }

  if (lower.includes('"active":true') || lower.includes("active:true")) {
    signals.push("active_true");
  }

  if (
    (lower.includes('"rewards"') || lower.includes("rewards:")) &&
    lower.includes("[")
  ) {
    signals.push("rewards_array");
  }

  if (lower.includes('"balance"') || lower.includes("balance:")) {
    signals.push("balance_detected");
  }

  if (
    lower.includes('"account"') ||
    lower.includes("account:") ||
    lower.includes('"user"') ||
    lower.includes("user:")
  ) {
    signals.push("account_object");
  }

  return [...new Set(signals)];
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
async function loadPreviousCoverage(
  snapshotsRoot,
  currentStamp
) {
  try {
    if (!(await fs.pathExists(snapshotsRoot))) {
      return null;
    }

    const entries = await fs.readdir(
      snapshotsRoot,
      { withFileTypes: true }
    );

    const previousSnapshotNames = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== currentStamp
      )
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const snapshotName of previousSnapshotNames) {
      const manifestPath = path.join(
        snapshotsRoot,
        snapshotName,
        "manifest.json"
      );

      if (!(await fs.pathExists(manifestPath))) {
        continue;
      }

      try {
        const manifest =
          await fs.readJson(manifestPath);

        return {
          snapshotId: snapshotName,

          capturedResponseCount:
            manifest.coverage?.capturedResponseCount ??
            manifest.assetCount ??
            null,

          firstPartyResponseCount:
            manifest.coverage?.firstPartyResponseCount ??
            null,

          apiResponseCount:
            manifest.coverage?.apiResponseCount ??
            manifest.apiCount ??
            null,

          firstPartyApiCount:
            manifest.coverage?.firstPartyApiCount ??
            null,
        };
      } catch {
        // Ignore unreadable historical manifests.
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function main() {
  const stamp = nowStamp();

  const snapshotsRoot = path.join(
    process.cwd(),
    "snapshots"
  );

  const previousCoverage =
    await loadPreviousCoverage(
      snapshotsRoot,
      stamp
    );

  const outDir = path.join(
    snapshotsRoot,
    stamp
  );

  const assetsDir = path.join(outDir, "assets");
  const apiDir = path.join(outDir, "api");

  await fs.ensureDir(assetsDir);
  await fs.ensureDir(apiDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const captured = [];
  const apiCaptured = [];
  const seen = new Set();

  /*
   * Runtime Surface Inventory
   *
   * Observe every HTTP(S) request independently from the deeper
   * response-capture filter below.
   *
   * Query strings and fragments are intentionally removed before
   * persistence to avoid storing transient or sensitive parameters.
   */
  const surfaceRequests = [];
  const surfaceSeen = new Set();

  page.on("request", (request) => {
    try {
      const normalizedUrl =
        normalizeSurfaceUrl(request.url());

      if (!normalizedUrl) return;

      const method = request.method();
      const resourceType = request.resourceType();
      const source = classifySource(normalizedUrl);
      const parsed = new URL(normalizedUrl);

      const key =
        `${method}|${resourceType}|${normalizedUrl}`;

      if (surfaceSeen.has(key)) return;

      surfaceSeen.add(key);

      surfaceRequests.push({
        url: normalizedUrl,
        origin: parsed.origin,
        sourceHost: source.sourceHost,
        sourceClass: source.sourceClass,
        method,
        resourceType,
      });
    } catch (error) {
      console.error(
        "Error observing runtime surface:",
        error.message
      );
    }
  });

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

      const source = classifySource(responseUrl);

      const entry = {
        url: responseUrl,
        sourceHost: source.sourceHost,
        sourceClass: source.sourceClass,
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

        const hints =
          extractEndpointHints(
            `${responseUrl}\n${textBody}`
          );

        const backendSignals =
          detectBackendSignals(textBody);

        const schemaPaths =
          extractJsonSchemaPaths(textBody);

        const schemaFingerprint =
          buildSchemaFingerprint(schemaPaths);

        apiCaptured.push({
          ...entry,
          endpointHints: hints,
          backendSignals,
          schemaPaths,
          schemaFingerprint,
          bodyPreview: textBody.slice(0, 1200),
        });
      }
    } catch (err) {
      console.error("Error capturing response:", err.message);
    }
  });

  console.log("Navigating to:", TARGET_URL);

  const navigationResponse = await page.goto(
    TARGET_URL,
    {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    }
  );

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

  const firstPartyCaptured = captured.filter(
    (entry) => entry.sourceClass === "FIRST_PARTY"
  );

  const thirdPartyCaptured = captured.filter(
    (entry) => entry.sourceClass === "THIRD_PARTY"
  );

  const unknownCaptured = captured.filter(
    (entry) => entry.sourceClass === "UNKNOWN"
  );

  const firstPartyApiCaptured = apiCaptured.filter(
    (entry) => entry.sourceClass === "FIRST_PARTY"
  );

  const thirdPartyApiCaptured = apiCaptured.filter(
    (entry) => entry.sourceClass === "THIRD_PARTY"
  );

  const unknownApiCaptured = apiCaptured.filter(
    (entry) => entry.sourceClass === "UNKNOWN"
  );

  const observedHosts = [
    ...new Set(
      captured
        .map((entry) => entry.sourceHost)
        .filter(Boolean)
    ),
  ].sort();

  const surfaceHosts = [
    ...new Set(
      surfaceRequests
        .map((entry) => entry.sourceHost)
        .filter(Boolean)
    ),
  ].sort();

  const surfaceOrigins = [
    ...new Set(
      surfaceRequests
        .map((entry) => entry.origin)
        .filter(Boolean)
    ),
  ].sort();

  const surfaceResourceTypes =
    surfaceRequests.reduce(
      (counts, entry) => {
        const type = entry.resourceType || "unknown";

        counts[type] =
          (counts[type] || 0) + 1;

        return counts;
      },
      {}
    );

  const surfaceInventory = {
    requestCount: surfaceRequests.length,

    firstPartyRequestCount:
      surfaceRequests.filter(
        (entry) => entry.sourceClass === "FIRST_PARTY"
      ).length,

    thirdPartyRequestCount:
      surfaceRequests.filter(
        (entry) => entry.sourceClass === "THIRD_PARTY"
      ).length,

    unknownRequestCount:
      surfaceRequests.filter(
        (entry) => entry.sourceClass === "UNKNOWN"
      ).length,

    hosts: surfaceHosts,
    origins: surfaceOrigins,
    resourceTypes: surfaceResourceTypes,
    requests: surfaceRequests.slice(0, 1000),
  };

  const coverage = {
    targetUrl: TARGET_URL,
    targetHost: TARGET_HOST,

    navigation: {
      status: navigationResponse
        ? navigationResponse.status()
        : null,
      ok: navigationResponse
        ? navigationResponse.ok()
        : false,
      finalUrl: page.url(),
    },

    documentCaptured:
      typeof html === "string" &&
      html.length > 0,

    capturedResponseCount:
      captured.length,

    firstPartyResponseCount:
      firstPartyCaptured.length,

    thirdPartyResponseCount:
      thirdPartyCaptured.length,

    unknownResponseCount:
      unknownCaptured.length,

    apiResponseCount:
      apiCaptured.length,

    firstPartyApiCount:
      firstPartyApiCaptured.length,

    thirdPartyApiCount:
      thirdPartyApiCaptured.length,

    unknownApiCount:
      unknownApiCaptured.length,

    observedHosts,
  };

  const coverageReasons = [];

  let coverageStatus = "HEALTHY";

  if (!coverage.navigation.ok) {
    coverageReasons.push(
      "target_navigation_failed"
    );

    coverageStatus = "BLIND_SPOT";
  }

  if (!coverage.documentCaptured) {
    coverageReasons.push(
      "document_not_captured"
    );

    coverageStatus = "BLIND_SPOT";
  }

  if (
    previousCoverage &&
    Number.isFinite(
      previousCoverage.firstPartyResponseCount
    ) &&
    previousCoverage.firstPartyResponseCount > 0 &&
    coverage.firstPartyResponseCount === 0
  ) {
    coverageReasons.push(
      "first_party_responses_dropped_to_zero"
    );

    coverageStatus = "BLIND_SPOT";
  }

  if (
    previousCoverage &&
    Number.isFinite(
      previousCoverage.firstPartyApiCount
    ) &&
    previousCoverage.firstPartyApiCount > 0 &&
    coverage.firstPartyApiCount === 0
  ) {
    coverageReasons.push(
      "first_party_api_dropped_to_zero"
    );

    coverageStatus = "BLIND_SPOT";
  }

  if (
    coverageStatus !== "BLIND_SPOT" &&
    previousCoverage
  ) {
    const responseBaseline = Number(
      previousCoverage.capturedResponseCount
    );

    const apiBaseline = Number(
      previousCoverage.apiResponseCount
    );

    if (
      Number.isFinite(responseBaseline) &&
      responseBaseline > 0
    ) {
      const responseRatio =
        coverage.capturedResponseCount /
        responseBaseline;

      if (responseRatio < 0.5) {
        coverageReasons.push(
          `captured_response_drop:${responseRatio.toFixed(2)}`
        );

        coverageStatus = "DEGRADED";
      }
    }

    if (
      Number.isFinite(apiBaseline) &&
      apiBaseline > 0
    ) {
      const apiRatio =
        coverage.apiResponseCount /
        apiBaseline;

      if (apiRatio < 0.5) {
        coverageReasons.push(
          `api_response_drop:${apiRatio.toFixed(2)}`
        );

        coverageStatus = "DEGRADED";
      }
    }
  }

  if (!previousCoverage) {
    coverageReasons.push(
      "previous_baseline_not_available"
    );
  }

  coverage.status = coverageStatus;
  coverage.reasons = coverageReasons;

  coverage.blindSpotDetected =
    coverageStatus === "BLIND_SPOT";

  coverage.degraded =
    coverageStatus === "DEGRADED";

  coverage.previousBaseline =
    previousCoverage;

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
      surfaceInventory,
      coverage,
    },
    { spaces: 2 }
  );

  await browser.close();

  console.log(`Snapshot saved to: ${outDir}`);
  console.log(`Captured files: ${captured.length}`);
  console.log(`Captured API-like responses: ${apiCaptured.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
