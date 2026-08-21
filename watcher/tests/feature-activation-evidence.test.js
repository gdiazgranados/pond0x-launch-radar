"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  buildFeatureActivationEvidence,
} =
  require(
    "../lib/feature-activation-evidence"
  );

function ensureArray(value) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function build({
  featureSurface = null,
  featureSurfaceDrift = null,
} = {}) {
  return buildFeatureActivationEvidence({
    featureSurface,
    featureSurfaceDrift,
    ensureArray,
  });
}

function dormantSurface() {
  return {
    buildId:
      "build-1",

    routes: {
      "/leaderboard": {
        referenced: true,
        probed: true,
        status: 404,
        ok: false,
        finalUrl:
          "https://www.pond0x.com/leaderboard",
      },
    },
  };
}

test(
  "feature activation: stable dormant surface remains dormant",
  () => {
    const result =
      build({
        featureSurface:
          dormantSurface(),

        featureSurfaceDrift: {
          comparable: true,
          buildChanged: false,
          previousBuildId:
            "build-1",
          currentBuildId:
            "build-1",
          flagChanges: [],
          routeChanges: [],
        },
      });

    assert.equal(
      result.classification,
      "DORMANT_FEATURE_SURFACE"
    );

    assert.equal(
      result.convergence,
      false
    );

    assert.equal(
      result.activationCluster,
      false
    );

    assert.equal(
      result.observedDormantRoutes
        .length,
      1
    );
  }
);

test(
  "feature activation: build change alone does not create activation convergence",
  () => {
    const result =
      build({
        featureSurface: {
          buildId:
            "build-2",
          routes: {},
        },

        featureSurfaceDrift: {
          comparable: true,
          buildChanged: true,
          previousBuildId:
            "build-1",
          currentBuildId:
            "build-2",
          flagChanges: [],
          routeChanges: [],
        },
      });

    assert.equal(
      result.classification,
      "STABLE_FEATURE_SURFACE"
    );

    assert.equal(
      result.buildChanged,
      true
    );

    assert.equal(
      result.convergence,
      false
    );

    assert.equal(
      result.activationCluster,
      false
    );
  }
);

test(
  "feature activation: flag unlock alone is a feature surface transition",
  () => {
    const result =
      build({
        featureSurface: {
          buildId:
            "build-1",
          routes: {},
        },

        featureSurfaceDrift: {
          comparable: true,
          buildChanged: false,
          previousBuildId:
            "build-1",
          currentBuildId:
            "build-1",

          flagChanges: [
            {
              name:
                "lockLeaderBoard",
              previous: true,
              current: false,
            },
          ],

          routeChanges: [],
        },
      });

    assert.equal(
      result.classification,
      "FEATURE_SURFACE_TRANSITION"
    );

    assert.deepStrictEqual(
      result.unlockedFlags,
      [
        "lockLeaderBoard",
      ]
    );

    assert.equal(
      result.convergence,
      false
    );
  }
);

test(
  "feature activation: route 404 to 200 alone is a feature surface transition",
  () => {
    const result =
      build({
        featureSurface: {
          buildId:
            "build-1",
          routes: {},
        },

        featureSurfaceDrift: {
          comparable: true,
          buildChanged: false,
          previousBuildId:
            "build-1",
          currentBuildId:
            "build-1",

          flagChanges: [],

          routeChanges: [
            {
              route:
                "/leaderboard",
              previousStatus:
                404,
              currentStatus:
                200,
              becameReachable:
                true,
            },
          ],
        },
      });

    assert.equal(
      result.classification,
      "FEATURE_SURFACE_TRANSITION"
    );

    assert.equal(
      result.activatedRoutes
        .length,
      1
    );

    assert.equal(
      result.activatedRoutes[0]
        .route,
      "/leaderboard"
    );

    assert.equal(
      result.convergence,
      false
    );
  }
);

test(
  "feature activation: unlock plus reachable route creates convergence",
  () => {
    const result =
      build({
        featureSurface: {
          buildId:
            "build-1",
          routes: {},
        },

        featureSurfaceDrift: {
          comparable: true,
          buildChanged: false,
          previousBuildId:
            "build-1",
          currentBuildId:
            "build-1",

          flagChanges: [
            {
              name:
                "lockLeaderBoard",
              previous: true,
              current: false,
            },
          ],

          routeChanges: [
            {
              route:
                "/leaderboard",
              previousStatus:
                404,
              currentStatus:
                200,
              becameReachable:
                true,
            },
          ],
        },
      });

    assert.equal(
      result.classification,
      "FEATURE_ACTIVATION_CONVERGENCE"
    );

    assert.equal(
      result.convergence,
      true
    );

    assert.equal(
      result.activationCluster,
      false
    );
  }
);

test(
  "feature activation: build change plus unlock plus route activation creates candidate",
  () => {
    const result =
      build({
        featureSurface: {
          buildId:
            "build-2",
          routes: {},
        },

        featureSurfaceDrift: {
          comparable: true,
          buildChanged: true,
          previousBuildId:
            "build-1",
          currentBuildId:
            "build-2",

          flagChanges: [
            {
              name:
                "lockLeaderBoard",
              previous: true,
              current: false,
            },
          ],

          routeChanges: [
            {
              route:
                "/leaderboard",
              previousStatus:
                404,
              currentStatus:
                200,
              becameReachable:
                true,
            },
          ],
        },
      });

    assert.equal(
      result.classification,
      "FEATURE_ACTIVATION_CANDIDATE"
    );

    assert.equal(
      result.buildChanged,
      true
    );

    assert.equal(
      result.convergence,
      true
    );

    assert.equal(
      result.activationCluster,
      true
    );
  }
);
