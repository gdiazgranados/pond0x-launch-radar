"use strict";

function buildFeatureActivationEvidence({
  featureSurface = null,
  featureSurfaceDrift = null,
  ensureArray,
}) {
  if (typeof ensureArray !== "function") {
    throw new TypeError(
      "ensureArray must be a function"
    );
  }

  const flagChanges =
    ensureArray(
      featureSurfaceDrift?.flagChanges
    );

  const routeChanges =
    ensureArray(
      featureSurfaceDrift?.routeChanges
    );

  const unlockedFlags =
    flagChanges
      .filter(
        (change) =>
          change &&
          change.previous === true &&
          change.current === false
      )
      .map(
        (change) =>
          change.name
      )
      .filter(Boolean);

  const lockedFlags =
    flagChanges
      .filter(
        (change) =>
          change &&
          change.previous === false &&
          change.current === true
      )
      .map(
        (change) =>
          change.name
      )
      .filter(Boolean);

  const activatedRoutes =
    routeChanges
      .filter(
        (change) =>
          change &&
          change.becameReachable === true
      )
      .map(
        (change) => ({
          route:
            change.route ||
            null,

          previousStatus:
            change.previousStatus ??
            null,

          currentStatus:
            change.currentStatus ??
            null,
        })
      )
      .filter(
        (change) =>
          change.route
      );

  const deactivatedRoutes =
    routeChanges
      .filter(
        (change) =>
          change &&
          change.becameUnreachable === true
      )
      .map(
        (change) => ({
          route:
            change.route ||
            null,

          previousStatus:
            change.previousStatus ??
            null,

          currentStatus:
            change.currentStatus ??
            null,
        })
      )
      .filter(
        (change) =>
          change.route
      );

  const observedDormantRoutes =
    Object.entries(
      featureSurface?.routes ||
      {}
    )
      .filter(
        (
          [, routeState]
        ) =>
          routeState?.referenced ===
            true &&
          routeState?.probed ===
            true &&
          routeState?.ok ===
            false
      )
      .map(
        (
          [
            route,
            routeState,
          ]
        ) => ({
          route,

          status:
            routeState.status ??
            null,

          finalUrl:
            routeState.finalUrl ||
            null,
        })
      );

  const buildChanged =
    featureSurfaceDrift
      ?.buildChanged ===
    true;

  const convergence =
    unlockedFlags.length >
      0 &&
    activatedRoutes.length >
      0;

  const activationCluster =
    buildChanged &&
    convergence;

  let classification =
    "STABLE_FEATURE_SURFACE";

  if (
    activationCluster
  ) {
    classification =
      "FEATURE_ACTIVATION_CANDIDATE";
  } else if (
    convergence
  ) {
    classification =
      "FEATURE_ACTIVATION_CONVERGENCE";
  } else if (
    unlockedFlags.length >
      0 ||
    activatedRoutes.length >
      0
  ) {
    classification =
      "FEATURE_SURFACE_TRANSITION";
  } else if (
    observedDormantRoutes.length >
      0
  ) {
    classification =
      "DORMANT_FEATURE_SURFACE";
  } else if (
    !featureSurfaceDrift
      ?.comparable
  ) {
    classification =
      "FEATURE_SURFACE_BASELINE";
  }

  return {
    classification,

    comparable:
      featureSurfaceDrift
        ?.comparable ===
      true,

    buildChanged,

    previousBuildId:
      featureSurfaceDrift
        ?.previousBuildId ||
      null,

    currentBuildId:
      featureSurfaceDrift
        ?.currentBuildId ||
      featureSurface?.buildId ||
      null,

    unlockedFlags,
    lockedFlags,
    activatedRoutes,
    deactivatedRoutes,
    observedDormantRoutes,

    convergence,

    activationCluster,
  };
}

module.exports = {
  buildFeatureActivationEvidence,
};
