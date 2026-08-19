"use strict";

function buildDetectionResultBuilder({
  ensureArray,
  evaluateAlpha,
  detectEventType,
  classifySignalRegime,
  detectSignalFusion,
  getPriority,
  getEta,
  buildSignature,
  buildAlertSignatureStable,
}) {
  const dependencies = {
    ensureArray,
    evaluateAlpha,
    detectEventType,
    classifySignalRegime,
    detectSignalFusion,
    getPriority,
    getEta,
    buildSignature,
    buildAlertSignatureStable,
  };

  for (const [name, dependency] of Object.entries(dependencies)) {
    if (typeof dependency !== "function") {
      throw new TypeError(
        `${name} must be a function`
      );
    }
  }

  function buildDetectionResult({
    baseResult,
    hasFreshActivationEvidence,
  }) {
    if (
      !baseResult ||
      typeof baseResult !== "object" ||
      Array.isArray(baseResult)
    ) {
      throw new TypeError(
        "baseResult must be an object"
      );
    }

    const alpha =
      evaluateAlpha(baseResult);

    const eventType =
      detectEventType(baseResult);

    const signalRegime =
      classifySignalRegime(
        baseResult,
        alpha,
        eventType
      );

    const signalFusion =
      detectSignalFusion(
        baseResult,
        alpha,
        eventType
      );

    const launchImminent =
      hasFreshActivationEvidence &&
      !!baseResult.launchImminent &&
      eventType === "CLAIM READINESS" &&
      (
        signalFusion ===
          "FULL ACTIVATION STACK" ||
        signalFusion ===
          "REWARD + WALLET + AUTH CLUSTER"
      );

    const portalArmed =
      hasFreshActivationEvidence &&
      !!baseResult.portalArmed &&
      (
        signalFusion ===
          "REWARD + WALLET + AUTH CLUSTER" ||
        signalFusion ===
          "FULL ACTIVATION STACK"
      ) &&
      eventType === "CLAIM READINESS";

    const enrichedBaseResult = {
      ...baseResult,
      launchImminent,
      portalArmed,
      tags: [
        ...new Set([
          ...ensureArray(baseResult.tags),
          ...(launchImminent
            ? ["LAUNCH_IMMINENT"]
            : []),
          ...(portalArmed
            ? ["PORTAL_ARMED"]
            : []),
        ]),
      ],
    };

    const alphaClass =
      alpha.alphaClass;

    const triggerState =
      alpha.triggerState;

    const suggestedAction =
      alpha.suggestedAction;

    let activationState = "IDLE";

    let activationAction =
      "No fresh activation event confirmed.";

    if (portalArmed) {
      activationState = "ARMED";
      activationAction =
        "Portal activation conditions detected. Maintain high-frequency monitoring.";
    }

    if (launchImminent) {
      activationState = "TRIGGERED";
      activationAction =
        "Launch-imminent activation conditions detected. Escalate immediately and monitor backend/UI flips aggressively.";
    }

    const priority =
      getPriority(enrichedBaseResult);

    const eta =
      getEta(enrichedBaseResult);

    const result = {
      ...enrichedBaseResult,
      alphaScore: alpha.alphaScore,
      alphaClass,
      triggerState,
      suggestedAction,
      activationState,
      activationAction,
      eventType,
      signalRegime,
      signalFusion,
      priority,
      eta,
    };

    result.signature =
      buildSignature(result);

    result.alertSignature =
      buildAlertSignatureStable(result);

    return result;
  }

  return {
    buildDetectionResult,
  };
}

module.exports = {
  buildDetectionResultBuilder,
};
