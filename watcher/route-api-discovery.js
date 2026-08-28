"use strict";

const fs = require("fs-extra");
const path = require("path");

const TARGET_URL = "https://www.pond0x.com";
const TARGET_ORIGIN = new URL(TARGET_URL).origin;
const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "route-api-intelligence.json");
const STATE_FILE = path.join(PUBLIC_DATA, "route-api-history.json");

const ASSET_RE = /\.(?:js|css|png|jpe?g|svg|webp|ico|woff2?|map|txt|xml|pdf|zip)(?:$|\?)/i;

function unique(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function getLatestSnapshotDir() {
  const root = path.join(process.cwd(), "snapshots");
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  return dirs[0] ? path.join(root, dirs[0]) : null;
}

function normalizeRoute(value) {
  if (!value) return null;
  let route = String(value).trim();
  try {
    if (/^https?:\/\//i.test(route)) {
      const u = new URL(route);
      if (u.origin !== TARGET_ORIGIN) return null;
      route = u.pathname;
    }
  } catch {
    return null;
  }
  route = route.split("?")[0].split("#")[0];
  if (!route.startsWith("/")) route = `/${route}`;
  route = route.replace(/\/{2,}/g, "/");
  if (route.length < 2 || route.length > 180) return null;
  if (route.startsWith("/_next/") || route.startsWith("/static/")) return null;
  if (ASSET_RE.test(route)) return null;
  return route.toLowerCase();
}

function isDynamicTemplate(route) {
  return /\[[^\]]+\]|\{[^}]+\}|:[a-zA-Z_][a-zA-Z0-9_]*/.test(route);
}

function looksApi(route) {
  return route === "/api" || route.startsWith("/api/");
}

async function loadJson(file, fallback) {
  try {
    return await fs.readJson(file);
  } catch {
    return fallback;
  }
}

async function discoverCandidates(snapshotDir) {
  const manifest = await loadJson(path.join(snapshotDir, "manifest.json"), {});
  const apiEntries = await loadJson(path.join(snapshotDir, "api.json"), []);
  const html = await fs.pathExists(path.join(snapshotDir, "index.html"))
    ? await fs.readFile(path.join(snapshotDir, "index.html"), "utf8")
    : "";

  const pageRoutes = [];
  const apiRoutes = [];

  const hrefRe = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRe.exec(html)) !== null) {
    const route = normalizeRoute(match[1]);
    if (!route) continue;
    (looksApi(route) ? apiRoutes : pageRoutes).push(route);
  }

  const bundles = Array.isArray(manifest?.featureSurface?.bundleInventory)
    ? manifest.featureSurface.bundleInventory
    : [];

  for (const bundle of bundles) {
    for (const raw of bundle?.semantic?.routes || []) {
      const route = normalizeRoute(raw);
      if (!route) continue;
      (looksApi(route) ? apiRoutes : pageRoutes).push(route);
    }
    for (const raw of bundle?.semantic?.apiRoutes || []) {
      const route = normalizeRoute(raw);
      if (route) apiRoutes.push(route);
    }
  }

  for (const entry of Array.isArray(apiEntries) ? apiEntries : []) {
    if (entry?.sourceClass && entry.sourceClass !== "FIRST_PARTY") continue;
    try {
      const u = new URL(entry.url);
      if (u.origin !== TARGET_ORIGIN) continue;
      const route = normalizeRoute(u.pathname);
      if (route) apiRoutes.push(route);
    } catch {}
  }

  return {
    snapshotId: path.basename(snapshotDir),
    pageRoutes: unique(pageRoutes),
    apiRoutes: unique(apiRoutes),
    liveCapturedApiRoutes: unique(
      (Array.isArray(apiEntries) ? apiEntries : [])
        .filter((entry) => entry?.sourceClass === "FIRST_PARTY")
        .map((entry) => {
          try { return normalizeRoute(new URL(entry.url).pathname); } catch { return null; }
        })
    ),
  };
}

async function probe(route, kind) {
  if (isDynamicTemplate(route)) {
    return { probed: false, method: null, status: null, live: false, exists: true, reason: "DYNAMIC_TEMPLATE" };
  }

  const url = new URL(route, TARGET_URL).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const method = kind === "API" ? "HEAD" : "GET";

  try {
    const response = await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "Pond0x-Radar/route-api-discovery" },
    });

    const status = response.status;
    const live = kind === "API"
      ? ((status >= 200 && status < 400) || [401, 403, 405].includes(status))
      : status >= 200 && status < 400;
    const exists = live || status !== 404;

    return { probed: true, method, status, live, exists, reason: null };
  } catch (error) {
    return {
      probed: true,
      method,
      status: null,
      live: false,
      exists: false,
      reason: error?.name === "AbortError" ? "TIMEOUT" : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function updateHistory(previous, kind, route, observation, checkedAt, snapshotId) {
  const key = `${kind}:${route}`;
  const before = previous[key] || null;
  const firstSeenAt = before?.firstSeenAt || checkedAt;
  const previousLive = before?.live === true;
  const currentLive = observation.live === true;
  const transition = !before
    ? "FIRST_OBSERVED"
    : !previousLive && currentLive
      ? "DORMANT_TO_LIVE"
      : previousLive && !currentLive
        ? "LIVE_TO_DORMANT"
        : currentLive
          ? "STILL_LIVE"
          : "STILL_DORMANT";

  return {
    key,
    kind,
    route,
    firstSeenAt,
    lastSeenAt: checkedAt,
    lastSnapshotId: snapshotId,
    lastStatus: observation.status,
    live: currentLive,
    exists: observation.exists,
    probed: observation.probed,
    probeMethod: observation.method,
    probeReason: observation.reason,
    transition,
    lastLiveAt: currentLive ? checkedAt : (before?.lastLiveAt || null),
    liveTransitions: Number(before?.liveTransitions || 0) + (transition === "DORMANT_TO_LIVE" ? 1 : 0),
  };
}

async function main() {
  const snapshotDir = getLatestSnapshotDir();
  if (!snapshotDir) throw new Error("No snapshot available for route/API discovery");

  const checkedAt = new Date().toISOString();
  const candidates = await discoverCandidates(snapshotDir);
  const previousState = await loadJson(STATE_FILE, {});
  const nextState = { ...previousState };
  const observations = [];

  const work = [
    ...candidates.pageRoutes.map((route) => ({ kind: "ROUTE", route })),
    ...candidates.apiRoutes.map((route) => ({ kind: "API", route })),
  ];

  // Keep probing bounded so a noisy bundle cannot turn one sweep into a crawler.
  const bounded = work.slice(0, 80);

  for (const item of bounded) {
    let observation;
    if (item.kind === "API" && candidates.liveCapturedApiRoutes.includes(item.route)) {
      observation = { probed: false, method: "CAPTURED", status: null, live: true, exists: true, reason: "OBSERVED_IN_RUNTIME" };
    } else {
      observation = await probe(item.route, item.kind);
    }

    const state = updateHistory(previousState, item.kind, item.route, observation, checkedAt, candidates.snapshotId);
    nextState[state.key] = state;
    observations.push(state);
  }

  const fresh = observations.filter((x) => x.transition === "FIRST_OBSERVED");
  const dormantToLive = observations.filter((x) => x.transition === "DORMANT_TO_LIVE");
  const liveToDormant = observations.filter((x) => x.transition === "LIVE_TO_DORMANT");
  const live = observations.filter((x) => x.live);
  const dormant = observations.filter((x) => !x.live);

  const result = {
    version: 2,
    checkedAt,
    snapshotId: candidates.snapshotId,
    target: TARGET_URL,
    boundedProbeLimit: 80,
    discovered: {
      routes: candidates.pageRoutes.length,
      apiRoutes: candidates.apiRoutes.length,
      total: work.length,
      probedThisSweep: bounded.length,
    },
    states: {
      live: live.length,
      dormant: dormant.length,
      fresh: fresh.length,
      dormantToLive: dormantToLive.length,
      liveToDormant: liveToDormant.length,
    },
    freshDiscoveries: fresh.slice(0, 40),
    dormantToLive: dormantToLive.slice(0, 40),
    liveToDormant: liveToDormant.slice(0, 40),
    liveRoutes: live.filter((x) => x.kind === "ROUTE").slice(0, 80),
    liveApiRoutes: live.filter((x) => x.kind === "API").slice(0, 80),
    dormantRoutes: dormant.filter((x) => x.kind === "ROUTE").slice(0, 80),
    dormantApiRoutes: dormant.filter((x) => x.kind === "API").slice(0, 80),
    observations: observations.slice(0, 120),
    interpretation:
      dormantToLive.length > 0
        ? `${dormantToLive.length} previously dormant surface(s) became live this sweep.`
        : fresh.length > 0
          ? `${fresh.length} new route/API surface(s) were discovered; availability is tracked separately.`
          : "No new route/API activation transition observed this sweep.",
    caution: "Route/API discovery is observational. Endpoint existence or reachability does not by itself prove product activation or launch readiness.",
  };

  await fs.ensureDir(PUBLIC_DATA);
  await fs.writeJson(STATE_FILE, nextState, { spaces: 2 });
  await fs.writeJson(OUTPUT_FILE, result, { spaces: 2 });

  console.log(`Route/API discovery v2 | routes=${candidates.pageRoutes.length} api=${candidates.apiRoutes.length} dormant->live=${dormantToLive.length}`);
}

main().catch((error) => {
  console.error("route-api-discovery failed:", error);
  process.exit(1);
});
