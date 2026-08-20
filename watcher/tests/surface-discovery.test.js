"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSurfaceDiscovery,
} = require("../lib/surface-discovery");


function ensureArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}


function uniqueSortedStrings(values) {
  return [
    ...new Set(
      ensureArray(values)
        .filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).length > 0
        )
        .map(String)
    ),
  ].sort();
}


function build({
  surfaceInventory = {},
  surfaceDrift = {},
} = {}) {
  return buildSurfaceDiscovery({
    surfaceInventory,
    surfaceDrift,
    ensureArray,
    uniqueSortedStrings,
  });
}


function getHost(discovery, host) {
  return discovery.hostRoles.find(
    (entry) =>
      entry.host === host
  );
}


test(
  "surface discovery: empty input returns normalized defaults",
  () => {
    const result = build();

    assert.deepStrictEqual(
      result.hostRoles,
      []
    );

    assert.equal(
      result.unclassifiedHostCount,
      0
    );

    assert.deepStrictEqual(
      result.unclassifiedHosts,
      []
    );

    assert.deepStrictEqual(
      result.inventory,
      {
        requestCount: 0,
        firstPartyRequestCount: 0,
        thirdPartyRequestCount: 0,
        unknownRequestCount: 0,
        hosts: [],
        origins: [],
        resourceTypes: {},
      }
    );

    assert.deepStrictEqual(
      result.drift,
      {
        comparable: false,
        baselineSnapshotId: null,
        status: "UNKNOWN",
        newSurfaceCount: 0,
        missingSurfaceCount: 0,
        newHostCount: 0,
        missingHostCount: 0,
        newHosts: [],
        missingHosts: [],
        newSurfaces: [],
        missingSurfaces: [],
      }
    );
  }
);


test(
  "surface discovery: classifies Pond0x first-party host and aggregates requests",
  () => {
    const result =
      build({
        surfaceInventory: {
          hosts: [
            "www.pond0x.com",
          ],

          requests: [
            {
              sourceHost:
                "www.pond0x.com",
              sourceClass:
                "FIRST_PARTY",
              resourceType:
                "document",
            },
            {
              sourceHost:
                "www.pond0x.com",
              sourceClass:
                "FIRST_PARTY",
              resourceType:
                "script",
            },
            {
              sourceHost:
                "www.pond0x.com",
              sourceClass:
                "FIRST_PARTY",
              resourceType:
                "script",
            },
          ],
        },
      });

    const host =
      getHost(
        result,
        "www.pond0x.com"
      );

    assert.ok(host);

    assert.equal(
      host.role,
      "PONDOX_FIRST_PARTY"
    );

    assert.equal(
      host.provider,
      "PONDOX"
    );

    assert.equal(
      host.requestCount,
      3
    );

    assert.deepStrictEqual(
      host.sourceClasses,
      ["FIRST_PARTY"]
    );

    assert.deepStrictEqual(
      host.resourceTypes,
      {
        document: 1,
        script: 2,
      }
    );

    assert.equal(
      host.present,
      true
    );

    assert.equal(
      host.driftState,
      "STABLE"
    );
  }
);


test(
  "surface discovery: classifies known wallet infrastructure",
  () => {
    const result =
      build({
        surfaceInventory: {
          hosts: [
            "api.web3modal.org",
            "pulse.walletconnect.org",
          ],
        },
      });

    const web3modal =
      getHost(
        result,
        "api.web3modal.org"
      );

    const walletConnect =
      getHost(
        result,
        "pulse.walletconnect.org"
      );

    assert.equal(
      web3modal.role,
      "WALLET_INFRASTRUCTURE"
    );

    assert.equal(
      web3modal.provider,
      "WEB3MODAL_REOWN"
    );

    assert.equal(
      walletConnect.role,
      "WALLET_INFRASTRUCTURE"
    );

    assert.equal(
      walletConnect.provider,
      "WALLETCONNECT"
    );
  }
);


test(
  "surface discovery: unknown hosts remain visible as unclassified",
  () => {
    const result =
      build({
        surfaceInventory: {
          hosts: [
            "unknown.example",
          ],
        },
      });

    const host =
      getHost(
        result,
        "unknown.example"
      );

    assert.ok(host);

    assert.equal(
      host.role,
      "UNCLASSIFIED"
    );

    assert.equal(
      host.provider,
      null
    );

    assert.equal(
      result.unclassifiedHostCount,
      1
    );

    assert.deepStrictEqual(
      result.unclassifiedHosts.map(
        (entry) => entry.host
      ),
      ["unknown.example"]
    );
  }
);


test(
  "surface discovery: tracks new and missing hosts across inventory and drift",
  () => {
    const result =
      build({
        surfaceInventory: {
          hosts: [
            "www.pond0x.com",
            "new.example",
          ],
        },

        surfaceDrift: {
          newHosts: [
            "new.example",
          ],

          missingHosts: [
            "missing.example",
          ],
        },
      });

    const stable =
      getHost(
        result,
        "www.pond0x.com"
      );

    const added =
      getHost(
        result,
        "new.example"
      );

    const missing =
      getHost(
        result,
        "missing.example"
      );

    assert.equal(
      stable.driftState,
      "STABLE"
    );

    assert.equal(
      stable.present,
      true
    );

    assert.equal(
      added.driftState,
      "NEW"
    );

    assert.equal(
      added.present,
      true
    );

    assert.equal(
      missing.driftState,
      "MISSING"
    );

    assert.equal(
      missing.present,
      false
    );

    assert.equal(
      missing.requestCount,
      0
    );
  }
);


test(
  "surface discovery: missing state takes precedence over new state",
  () => {
    const result =
      build({
        surfaceInventory: {
          hosts: [
            "transition.example",
          ],
        },

        surfaceDrift: {
          newHosts: [
            "transition.example",
          ],

          missingHosts: [
            "transition.example",
          ],
        },
      });

    const host =
      getHost(
        result,
        "transition.example"
      );

    assert.ok(host);

    assert.equal(
      host.driftState,
      "MISSING"
    );

    assert.equal(
      host.present,
      true
    );
  }
);


test(
  "surface discovery: normalizes inventory and drift metadata",
  () => {
    const result =
      build({
        surfaceInventory: {
          requestCount: "12",
          firstPartyRequestCount: "4",
          thirdPartyRequestCount: "7",
          unknownRequestCount: "1",

          hosts: [
            "z.example",
            "a.example",
            "z.example",
          ],

          origins: [
            "https://z.example",
            "https://a.example",
            "https://z.example",
          ],

          resourceTypes: {
            script: 5,
            fetch: 7,
          },
        },

        surfaceDrift: {
          comparable: true,
          baselineSnapshotId:
            "snapshot-123",
          status:
            "changed",

          newSurfaceCount: "3",
          missingSurfaceCount: "2",
          newHostCount: "1",
          missingHostCount: "1",

          newHosts: [
            "z.example",
            "z.example",
          ],

          missingHosts: [
            "old.example",
          ],
        },
      });

    assert.equal(
      result.inventory.requestCount,
      12
    );

    assert.equal(
      result.inventory.firstPartyRequestCount,
      4
    );

    assert.equal(
      result.inventory.thirdPartyRequestCount,
      7
    );

    assert.equal(
      result.inventory.unknownRequestCount,
      1
    );

    assert.deepStrictEqual(
      result.inventory.hosts,
      [
        "a.example",
        "z.example",
      ]
    );

    assert.deepStrictEqual(
      result.inventory.origins,
      [
        "https://a.example",
        "https://z.example",
      ]
    );

    assert.deepStrictEqual(
      result.inventory.resourceTypes,
      {
        script: 5,
        fetch: 7,
      }
    );

    assert.equal(
      result.drift.comparable,
      true
    );

    assert.equal(
      result.drift.baselineSnapshotId,
      "snapshot-123"
    );

    assert.equal(
      result.drift.status,
      "CHANGED"
    );

    assert.equal(
      result.drift.newSurfaceCount,
      3
    );

    assert.equal(
      result.drift.missingSurfaceCount,
      2
    );

    assert.equal(
      result.drift.newHostCount,
      1
    );

    assert.equal(
      result.drift.missingHostCount,
      1
    );

    assert.deepStrictEqual(
      result.drift.newHosts,
      ["z.example"]
    );
  }
);


test(
  "surface discovery: caps new and missing surface lists at one hundred",
  () => {
    const newSurfaces =
      Array.from(
        { length: 125 },
        (_, index) => ({
          id: `new-${index}`,
        })
      );

    const missingSurfaces =
      Array.from(
        { length: 130 },
        (_, index) => ({
          id: `missing-${index}`,
        })
      );

    const result =
      build({
        surfaceDrift: {
          newSurfaces,
          missingSurfaces,
        },
      });

    assert.equal(
      result.drift.newSurfaces.length,
      100
    );

    assert.equal(
      result.drift.missingSurfaces.length,
      100
    );

    assert.equal(
      result.drift.newSurfaces[0].id,
      "new-0"
    );

    assert.equal(
      result.drift.newSurfaces[99].id,
      "new-99"
    );

    assert.equal(
      result.drift.missingSurfaces[99].id,
      "missing-99"
    );
  }
);
