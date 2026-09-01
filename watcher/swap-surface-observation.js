"use strict";

const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { MAX_ITEMS, responseEvidence, buildDetails } = require("./lib/swap-details");

const TARGET = "https://www.pond0x.com/swap/solana";
const VERSION = 1;
const MAX_HISTORY = 48;
const MAX_BASELINE_AGE_MS = 6 * 60 * 60 * 1000;

async function main() {
  const outputArgument = process.argv[2];

  if (!outputArgument) {
    throw new Error("Provide an output JSON path.");
  }

  const output = path.resolve(outputArgument);
  let previous = {};

  try {
    previous = JSON.parse(await fs.readFile(output, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const observation = {
    checkedAt: new Date().toISOString(),
    target: TARGET,
    status: "CAPTURE_ERROR",
    view: "UNKNOWN",
    httpStatus: null,
    finalUrl: null,
    markers: [],
    labels: [],
    links: [],
    error: null,
  };

  let browser;
  let controls = [];
  const responses = new Set();
  let detailsTruncated = false;

  try {
    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "en-US",
      serviceWorkers: "block",
    });

    const page = await context.newPage();

    page.on("response", (response) => {
      const request = response.request();
      if (!["fetch", "xhr"].includes(request.resourceType())) return;
      const evidence = responseEvidence(response.url(), TARGET, request.method(), response.status());
      if (!evidence || responses.has(evidence)) return;
      if (responses.size >= MAX_ITEMS) { detailsTruncated = true; return; }
      responses.add(evidence);
    });

    const response = await page.goto(TARGET, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    observation.httpStatus = response ? response.status() : null;

    // Bounded observation window. No clicks or wallet interaction.
    await page.waitForTimeout(8000);

    const finalUrl = new URL(page.url());
    observation.finalUrl = finalUrl.origin + finalUrl.pathname;

    if (
      finalUrl.origin !== new URL(TARGET).origin ||
      finalUrl.pathname.replace(/\/+$/, "") !== "/swap/solana"
    ) {
      throw new Error("Navigation ended outside the expected swap page.");
    }

    if (!response || response.status() < 200 || response.status() >= 300) {
      throw new Error(`Unexpected HTTP status: ${observation.httpStatus}`);
    }

    const surface = await page.evaluate(() => {
      function visible(element) {
        const style = getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.visibility !== "collapse" &&
          Number(style.opacity) !== 0 &&
          element.getClientRects().length > 0
        );
      }

      const selectors = {
        aquaswap: '[data-testid="aquaswap"]',
        aquaShell: ".aqua-shell",
        aquaModes: '[data-testid="aqua-modes"]',
        aquaGiga: '[data-testid="aqua-giga"]',
        aquaSolstage: ".aqua-solstage",
      };

      const markers = Object.entries(selectors)
        .filter(([, selector]) =>
          [...document.querySelectorAll(selector)].some(visible)
        )
        .map(([name]) => name)
        .sort();

      const text = (document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .trim();

      const expressions = {
        swapHard: /\bswap hard\b/i,
        earnRewards: /\bearn rewards\b/i,
        gigaRewards: /\bgiga rewards\b/i,
        megaWins: /\bmega wins\b/i,
        swapNow: /\bswap now\b/i,
        trixText: /\btrix\b/i,
      };

      const labels = Object.entries(expressions)
        .filter(([, expression]) => expression.test(text))
        .map(([name]) => name)
        .sort();

      // Keep same-origin pathnames only, without query strings or fragments.
      const links = [...new Set(
        [...document.querySelectorAll("a[href]")]
          .filter(visible)
          .map((element) => {
            try {
              const url = new URL(element.href, location.href);
              return url.origin === location.origin ? url.pathname : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean)
      )].sort();

      const controlElements = [...document.querySelectorAll('button, [role="button"], [role="tab"]')].filter(visible);
      const controls = controlElements.slice(0, 100).map(element => ({
        role: element.getAttribute("role") || "button",
        label: element.getAttribute("aria-label") || element.innerText || element.getAttribute("title") || "",
        disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
        selected: element.getAttribute("aria-selected") || element.getAttribute("aria-pressed") || null,
      }));
      return { markers, labels, links, controls, controlsTruncated: controlElements.length > 100 };
    });

    controls = surface.controls;
    detailsTruncated ||= surface.controlsTruncated;
    Object.assign(observation, { markers: surface.markers, labels: surface.labels, links: surface.links });

    if (surface.markers.includes("aquaswap")) {
      observation.view = "SWAP_COMPONENT";
      observation.status = "OBSERVED";
    } else if (surface.labels.includes("swapNow")) {
      observation.view = "SPLASH_ONLY";
      observation.status = "OBSERVED";
    } else {
      observation.view = "UNRECOGNIZED";
      observation.status = "INCOMPLETE";
    }
  } catch (error) {
    observation.error = String(error.message || error);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  observation.checkedAt = new Date().toISOString();

  const compatible =
    previous.version === VERSION && previous.target === TARGET;

  const baseline = compatible ? previous.lastSuccessful : null;
  const age = baseline
    ? Date.parse(observation.checkedAt) - Date.parse(baseline.checkedAt)
    : NaN;

  const comparable =
    observation.status === "OBSERVED" &&
    baseline?.status === "OBSERVED" &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= MAX_BASELINE_AGE_MS;

  let comparison = {
    state: observation.status,
    baselineAt: baseline?.checkedAt || null,
  };

  if (observation.status === "OBSERVED") {
    observation.signature = crypto
      .createHash("sha256")
      .update(JSON.stringify({
        view: observation.view,
        markers: observation.markers,
        labels: observation.labels,
        links: observation.links,
      }))
      .digest("hex");

    comparison.state = comparable
      ? observation.signature === baseline.signature
        ? "UNCHANGED"
        : "CHANGED"
      : "BASELINE";

    if (!comparable) {
      comparison.reason = baseline
        ? "Previous successful observation is too old or invalid."
        : "No compatible successful observation exists.";
    } else {
      comparison.viewChanged = observation.view !== baseline.view;

      for (const key of ["markers", "labels", "links"]) {
        const before = new Set(baseline[key] || []);
        const after = new Set(observation[key]);

        comparison[key] = {
          added: [...after].filter((value) => !before.has(value)),
          removed: [...before].filter((value) => !after.has(value)),
        };
      }
    }
  }

  const history = compatible && Array.isArray(previous.history)
    ? previous.history
    : [];

  const report = {
    version: VERSION,
    target: TARGET,
    mode: "OBSERVATION_ONLY",
    scope:
      "Public initial page after an 8-second wait. No clicks, wallet, iframe inspection, quotes, or transactions.",
    caution:
      "Visible text or components do not prove swap execution, route integration, rewards, or launch readiness.",
    details: buildDetails(previous.details, observation, controls, [...responses], detailsTruncated),
    latest: observation,
    comparison,
    lastSuccessful:
      observation.status === "OBSERVED" ? observation : baseline || null,
    history: [...history, { observation, comparison }].slice(-MAX_HISTORY),
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    output,
    status: observation.status,
    view: observation.view,
    comparison: comparison.state,
    markers: observation.markers,
    labels: observation.labels,
    error: observation.error,
  }, null, 2));

  if (observation.status !== "OBSERVED") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});