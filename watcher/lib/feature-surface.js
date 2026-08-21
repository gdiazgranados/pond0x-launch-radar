const fs = require("fs-extra");
const path = require("path");

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
  const patterns = [
    /useRef\(["'](\d{8,})["']\)/,
    /buildId["']?\s*[:=]\s*["']([^"']+)["']/,
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

async function extractFeatureSurface({
  captured,
  outDir,
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

  return {
    buildId:
      buildCandidates[0]
        ?.value ||
      null,

    buildCandidates,

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
    const before =
      Boolean(
        previous.routes?.[
          route
        ]?.referenced
      );

    const after =
      Boolean(
        current.routes?.[
          route
        ]?.referenced
      );

    if (
      before === after
    ) {
      continue;
    }

    routeChanges.push({
      route,
      previousReferenced:
        before,
      currentReferenced:
        after,
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
