"use strict";

function buildSurfaceDiscovery({
  surfaceInventory,
  surfaceDrift,
  ensureArray,
  uniqueSortedStrings,
}) {
  const manifest = {
    surfaceInventory,
    surfaceDrift,
  };

const captureSurfaceInventory =
  manifest?.surfaceInventory || {};

const captureSurfaceDrift =
  manifest?.surfaceDrift || {};

function classifySurfaceHost(host) {
  const normalizedHost =
    String(host || "").toLowerCase();

  const knownHosts = {
    "www.pond0x.com": {
      role: "PONDOX_FIRST_PARTY",
      provider: "PONDOX",
    },

    "api.web3modal.org": {
      role: "WALLET_INFRASTRUCTURE",
      provider: "WEB3MODAL_REOWN",
    },

    "pulse.walletconnect.org": {
      role: "WALLET_INFRASTRUCTURE",
      provider: "WALLETCONNECT",
    },

    "mm-sdk-analytics.api.cx.metamask.io": {
      role: "WALLET_TELEMETRY",
      provider: "METAMASK",
    },

    "fonts.googleapis.com": {
      role: "STATIC_INFRASTRUCTURE",
      provider: "GOOGLE_FONTS",
    },

    "fonts.gstatic.com": {
      role: "STATIC_INFRASTRUCTURE",
      provider: "GOOGLE_FONTS",
    },
  };

  return (
    knownHosts[normalizedHost] || {
      role: "UNCLASSIFIED",
      provider: null,
    }
  );
}

const surfaceRequests = ensureArray(
  captureSurfaceInventory.requests
);

const currentSurfaceHosts =
  uniqueSortedStrings(
    captureSurfaceInventory.hosts || []
  );

const newSurfaceHosts = new Set(
  uniqueSortedStrings(
    captureSurfaceDrift.newHosts || []
  )
);

const missingSurfaceHosts = new Set(
  uniqueSortedStrings(
    captureSurfaceDrift.missingHosts || []
  )
);

const allSurfaceHosts = uniqueSortedStrings([
  ...currentSurfaceHosts,
  ...newSurfaceHosts,
  ...missingSurfaceHosts,
]);

const surfaceHostRoles =
  allSurfaceHosts.map((host) => {
    const hostRequests = surfaceRequests.filter(
      (entry) => entry?.sourceHost === host
    );

    const classification =
      classifySurfaceHost(host);

    const resourceTypes =
      hostRequests.reduce(
        (counts, entry) => {
          const type =
            entry?.resourceType || "unknown";

          counts[type] =
            (counts[type] || 0) + 1;

          return counts;
        },
        {}
      );

    const sourceClasses =
      uniqueSortedStrings(
        hostRequests
          .map((entry) => entry?.sourceClass)
          .filter(Boolean)
      );

    const isNew = newSurfaceHosts.has(host);
    const isMissing =
      missingSurfaceHosts.has(host);

    return {
      host,
      role: classification.role,
      provider: classification.provider,
      requestCount: hostRequests.length,
      sourceClasses,
      resourceTypes,
      present: currentSurfaceHosts.includes(host),
      driftState: isMissing
        ? "MISSING"
        : isNew
          ? "NEW"
          : "STABLE",
    };
  });

const unclassifiedSurfaceHosts =
  surfaceHostRoles.filter(
    (entry) => entry.role === "UNCLASSIFIED"
  );

const surfaceDiscovery = {
  hostRoles: surfaceHostRoles,

  unclassifiedHostCount:
    unclassifiedSurfaceHosts.length,

  unclassifiedHosts:
    unclassifiedSurfaceHosts,

  inventory: {
    requestCount: Number(
      captureSurfaceInventory.requestCount ?? 0
    ),

    firstPartyRequestCount: Number(
      captureSurfaceInventory.firstPartyRequestCount ?? 0
    ),

    thirdPartyRequestCount: Number(
      captureSurfaceInventory.thirdPartyRequestCount ?? 0
    ),

    unknownRequestCount: Number(
      captureSurfaceInventory.unknownRequestCount ?? 0
    ),

    hosts: uniqueSortedStrings(
      captureSurfaceInventory.hosts || []
    ),

    origins: uniqueSortedStrings(
      captureSurfaceInventory.origins || []
    ),

    resourceTypes:
      captureSurfaceInventory.resourceTypes &&
      typeof captureSurfaceInventory.resourceTypes === "object"
        ? captureSurfaceInventory.resourceTypes
        : {},
  },

  drift: {
    comparable:
      captureSurfaceDrift.comparable === true,

    baselineSnapshotId:
      captureSurfaceDrift.baselineSnapshotId || null,

    status: String(
      captureSurfaceDrift.status || "UNKNOWN"
    ).toUpperCase(),

    newSurfaceCount: Number(
      captureSurfaceDrift.newSurfaceCount ?? 0
    ),

    missingSurfaceCount: Number(
      captureSurfaceDrift.missingSurfaceCount ?? 0
    ),

    newHostCount: Number(
      captureSurfaceDrift.newHostCount ?? 0
    ),

    missingHostCount: Number(
      captureSurfaceDrift.missingHostCount ?? 0
    ),

    newHosts: uniqueSortedStrings(
      captureSurfaceDrift.newHosts || []
    ),

    missingHosts: uniqueSortedStrings(
      captureSurfaceDrift.missingHosts || []
    ),

    newSurfaces: ensureArray(
      captureSurfaceDrift.newSurfaces
    ).slice(0, 100),

    missingSurfaces: ensureArray(
      captureSurfaceDrift.missingSurfaces
    ).slice(0, 100),
  },
};

  return surfaceDiscovery;
}

module.exports = {
  buildSurfaceDiscovery,
};
