const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const FEATURE_FLAG_NAMES = [
  "lockedMining",
  "lockedRewards",
  "lockedPndeth",
  "lockedPondwater",
  "lockedSwap",
  "lockedVoting",
  "lockLeaderBoard",
  "multiChainSupport",
  "menuPondWater",
  "menuBoosters",
  "menuPndeth",
  "unlockVoid",
  "unlockPoints",
];

const ROUTE_HINTS = [
  "/leaderboard",
];

function extractBooleanFlag(text, flagName) {
  const escaped =
    flagName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const patterns = [
    new RegExp(
      `${escaped}\\s*:\\s*(!0|!1|true|false)`,
      "g"
    ),
    new RegExp(
      `["']${escaped}["']\\s*:\\s*(!0|!1|true|false)`,
      "g"
    ),
  ];

  for (const pattern of patterns) {
    const match =
      pattern.exec(text);

    if (!match) {
      continue;
    }

    const raw =
      match[1];

    return {
      found: true,
      value:
        raw === "true" ||
        raw === "!0",
      raw,
    };
  }

  return {
    found: false,
    value: null,
    raw: null,
  };
}

function extractBuildId(text) {
  /*
   * Only accept an explicit buildId assignment.
   *
   * The old detector also treated any long numeric useRef("...") value
   * as a build id. Pond0x currently ships a stable timestamp-like useRef
   * literal (1786340515953), so that heuristic produced a false, static
   * build identifier even when the production JS surface changed.
   */
  const patterns = [
    /["']?buildId["']?\s*[:=]\s*["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function buildBundleFingerprint(entries) {
  const rows = entries
    .filter(
      (entry) =>
        entry &&
        entry.sourceClass === "FIRST_PARTY" &&
        entry.sha256
    )
    .map(
      (entry) =>
        `${entry.url || entry.file || "unknown"}:${entry.sha256}`
    )
    .sort();

  if (rows.length === 0) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(rows.join("\n"))
    .digest("hex")
    .slice(0, 20);
}

async function probeFeatureRoute(
  baseUrl,
  route
) {
  const url =
    new URL(
      route,
      baseUrl
    ).toString();

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      15000
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",
          redirect: "follow",
          signal:
            controller.signal,
          headers: {
            "user-agent":
              "Pond0x-Radar/feature-surface",
          },
        }
      );

    return {
      probed: true,
      status:
        response.status,
      ok:
        response.ok,
      finalUrl:
        response.url ||
        url,
      error: null,
    };
  } catch (error) {
    return {
      probed: true,
      status: null,
      ok: false,
      finalUrl: url,
      error:
        error?.name ===
        "AbortError"
          ? "TIMEOUT"
          : String(
              error?.message ||
              error
            ),
    };
  } finally {
    clearTimeout(timeout);
  }
}
async function extractFeatureSurface({
  captured,
  outDir,
  baseUrl,
}) {
  const flags = {};

  for (const flagName of FEATURE_FLAG_NAMES) {
    flags[flagName] = {
      observed: false,
      value: null,
      sources: [],
    };
  }

  const routes = {};

  for (const route of ROUTE_HINTS) {
    routes[route] = {
      referenced: false,
      sources: [],
    };
  }

  const buildIds =
    new Map();

  const firstPartyJavaScriptEntries = [];

  for (const entry of captured) {
    const contentType =
      String(
        entry.contentType ||
        ""
      ).toLowerCase();

    const fileName =
      String(
        entry.file ||
        ""
      ).toLowerCase();

    const looksLikeJavaScript =
      contentType.includes(
        "javascript"
      ) ||
      fileName.endsWith(
        ".js"
      );

    if (!looksLikeJavaScript) {
      continue;
    }

    if (
      entry.sourceClass === "FIRST_PARTY" &&
      entry.sha256
    ) {
      firstPartyJavaScriptEntries.push(entry);
    }

    const absolutePath =
      path.join(
        outDir,
        entry.file
      );

    if (
      !(await fs.pathExists(
        absolutePath
      ))
    ) {
      continue;
    }

    let text;

    try {
      text =
        await fs.readFile(
          absolutePath,
          "utf8"
        );
    } catch {
      continue;
    }

    for (const flagName of FEATURE_FLAG_NAMES) {
      const result =
        extractBooleanFlag(
          text,
          flagName
        );

      if (!result.found) {
        continue;
      }

      const flag =
        flags[flagName];

      flag.observed = true;
      flag.value =
        result.value;

      flag.sources.push({
        file: entry.file,
        url: entry.url,
        raw: result.raw,
      });
    }

    for (const route of ROUTE_HINTS) {
      if (
        !text.includes(route)
      ) {
        continue;
      }

      routes[
        route
      ].referenced = true;

      routes[
        route
      ].sources.push({
        file: entry.file,
        url: entry.url,
      });
    }

    const buildId =
      extractBuildId(text);

    if (buildId) {
      if (
        !buildIds.has(
          buildId
        )
      ) {
        buildIds.set(
          buildId,
          []
        );
      }

      buildIds
        .get(buildId)
        .push({
          file: entry.file,
          url: entry.url,
        });
    }
  }

  /*
   * Probe only routes already referenced by captured
   * production bundles. A failed/404 probe is state,
   * not launch evidence by itself.
   */
  if (baseUrl) {
    for (const route of ROUTE_HINTS) {
      const routeState =
        routes[route];

      if (
        !routeState?.referenced
      ) {
        continue;
      }

      const probeResult =
        await probeFeatureRoute(
          baseUrl,
          route
        );

      routes[route] = {
        ...routeState,
        ...probeResult,
      };
    }
  }
  const observedFlags =
    Object.fromEntries(
      Object.entries(flags)
        .filter(
          (
            [, value]
          ) =>
            value.observed
        )
    );

  const buildCandidates =
    Array.from(
      buildIds.entries()
    ).map(
      (
        [
          value,
          sources,
        ]
      ) => ({
        value,
        sources,
      })
    );

  const explicitBuildId =
    buildCandidates[0]
      ?.value ||
    null;

  const bundleFingerprint =
    buildBundleFingerprint(
      firstPartyJavaScriptEntries
    );

  return {
    buildId:
      explicitBuildId ||
      (bundleFingerprint
        ? `bundle:${bundleFingerprint}`
        : null),

    buildIdSource:
      explicitBuildId
        ? "EXPLICIT_BUILD_ID"
        : bundleFingerprint
          ? "FIRST_PARTY_JS_FINGERPRINT"
          : "UNAVAILABLE",

    buildCandidates,

    bundleFingerprint,

    flags:
      observedFlags,

    routes,

    observedFlagCount:
      Object.keys(
        observedFlags
      ).length,

    referencedRouteCount:
      Object.values(
        routes
      ).filter(
        (route) =>
          route.referenced
      ).length,
  };
}

function compareFeatureSurface(
  previous,
  current
) {
  if (!previous) {
    return {
      comparable: false,
      status: "BASELINE",
      buildChanged: false,
      previousBuildId: null,
      currentBuildId:
        current?.buildId ||
        null,
      flagChanges: [],
      routeChanges: [],
    };
  }

  const flagChanges = [];

  const names =
    new Set([
      ...Object.keys(
        previous.flags ||
        {}
      ),
      ...Object.keys(
        current.flags ||
        {}
      ),
    ]);

  for (const name of names) {
    const before =
      previous.flags?.[
        name
      ];

    const after =
      current.flags?.[
        name
      ];

    if (
      !before ||
      !after
    ) {
      continue;
    }

    if (
      before.value ===
      after.value
    ) {
      continue;
    }

    flagChanges.push({
      name,
      previous:
        before.value,
      current:
        after.value,
    });
  }

  const routeChanges = [];

  const routeNames =
    new Set([
      ...Object.keys(
        previous.routes ||
        {}
      ),
      ...Object.keys(
        current.routes ||
        {}
      ),
    ]);

  for (const route of routeNames) {
    const previousRoute =
      previous.routes?.[
        route
      ] ||
      null;

    const currentRoute =
      current.routes?.[
        route
      ] ||
      null;

    const beforeReferenced =
      Boolean(
        previousRoute?.referenced
      );

    const afterReferenced =
      Boolean(
        currentRoute?.referenced
      );

    const referenceChanged =
      beforeReferenced !==
      afterReferenced;

    const previousStatus =
      Number.isInteger(
        previousRoute?.status
      )
        ? previousRoute.status
        : null;

    const currentStatus =
      Number.isInteger(
        currentRoute?.status
      )
        ? currentRoute.status
        : null;

    /*
     * Only call this a status transition when both snapshots
     * actually observed an HTTP status. This prevents the first
     * route-probing snapshot from creating artificial drift.
     */
    const statusChanged =
      previousStatus !== null &&
      currentStatus !== null &&
      previousStatus !==
        currentStatus;

    if (
      !referenceChanged &&
      !statusChanged
    ) {
      continue;
    }

    routeChanges.push({
      route,

      referenceChanged,

      previousReferenced:
        beforeReferenced,

      currentReferenced:
        afterReferenced,

      statusChanged,

      previousStatus,

      currentStatus,

      becameReachable:
        previousStatus !== null &&
        previousStatus >= 400 &&
        currentStatus !== null &&
        currentStatus >= 200 &&
        currentStatus < 400,
    });
  }
  const previousBuildId =
    previous.buildId ||
    null;

  const currentBuildId =
    current.buildId ||
    null;

  const buildChanged =
    Boolean(
      previousBuildId &&
      currentBuildId &&
      previousBuildId !==
        currentBuildId
    );

  const driftDetected =
    buildChanged ||
    flagChanges.length >
      0 ||
    routeChanges.length >
      0;

  return {
    comparable: true,

    status:
      driftDetected
        ? "DRIFT"
        : "STABLE",

    buildChanged,
    previousBuildId,
    currentBuildId,
    flagChanges,
    routeChanges,
  };
}

module.exports = {
  FEATURE_FLAG_NAMES,
  ROUTE_HINTS,
  extractFeatureSurface,
  compareFeatureSurface,
};




