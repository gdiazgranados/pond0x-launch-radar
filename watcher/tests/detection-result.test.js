"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDetectionResultBuilder,
} = require("../lib/detection-result");

function ensureArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function createBuilder(overrides = {}) {
  return buildDetectionResultBuilder({
    ensureArray,

    evaluateAlpha:
      overrides.evaluateAlpha ||
      (() => ({
        alphaScore: 42,
        alphaClass: "SETUP",
        triggerState: "WATCHING",
        suggestedAction: "Monitor closely.",
      })),

    detectEventType:
      overrides.detectEventType ||
      (() => "NOISE"),

    classifySignalRegime:
      overrides.classifySignalRegime ||
      (() => "TRANSITIONAL SIGNAL"),

    detectSignalFusion:
      overrides.detectSignalFusion ||
      (() => "UNCLASSIFIED SIGNAL MIX"),

    getPriority:
      overrides.getPriority ||
      (() => "LOW"),

    getEta:
      overrides.getEta ||
      (() => "unknown"),

    buildSignature:
      overrides.buildSignature ||
      ((result) =>
        `signature:${result.id}`),

    buildAlertSignatureStable:
      overrides.buildAlertSignatureStable ||
      ((result) =>
        `alert:${result.id}`),
  });
}

test(
  "detection result: baseline enrichment",
  () => {
    const {
      buildDetectionResult,
    } = createBuilder();

    const result =
      buildDetectionResult({
        baseResult: {
          id: "baseline-1",
          tags: ["BASE"],
          launchImminent: false,
          portalArmed: false,
        },
        hasFreshActivationEvidence: false,
      });

    assert.equal(
      result.alphaScore,
      42
    );

    assert.equal(
      result.alphaClass,
      "SETUP"
    );

    assert.equal(
      result.triggerState,
      "WATCHING"
    );

    assert.equal(
      result.activationState,
      "IDLE"
    );

    assert.equal(
      result.launchImminent,
      false
    );

    assert.equal(
      result.portalArmed,
      false
    );

    assert.deepStrictEqual(
      result.tags,
      ["BASE"]
    );

    assert.equal(
      result.signature,
      "signature:baseline-1"
    );

    assert.equal(
      result.alertSignature,
      "alert:baseline-1"
    );
  }
);

test(
  "detection result: stale activation evidence cannot arm portal",
  () => {
    const {
      buildDetectionResult,
    } = createBuilder({
      detectEventType:
        () => "CLAIM READINESS",

      detectSignalFusion:
        () =>
          "REWARD + WALLET + AUTH CLUSTER",
    });

    const result =
      buildDetectionResult({
        baseResult: {
          id: "stale-1",
          tags: [],
          launchImminent: true,
          portalArmed: true,
        },
        hasFreshActivationEvidence: false,
      });

    assert.equal(
      result.launchImminent,
      false
    );

    assert.equal(
      result.portalArmed,
      false
    );

    assert.equal(
      result.activationState,
      "IDLE"
    );

    assert.deepStrictEqual(
      result.tags,
      []
    );
  }
);

test(
  "detection result: portal armed requires fresh claim readiness cluster",
  () => {
    const {
      buildDetectionResult,
    } = createBuilder({
      detectEventType:
        () => "CLAIM READINESS",

      detectSignalFusion:
        () =>
          "REWARD + WALLET + AUTH CLUSTER",

      getPriority:
        () => "HIGH",

      getEta:
        () => "< 24h",
    });

    const result =
      buildDetectionResult({
        baseResult: {
          id: "armed-1",
          tags: ["REWARDS"],
          launchImminent: false,
          portalArmed: true,
        },
        hasFreshActivationEvidence: true,
      });

    assert.equal(
      result.portalArmed,
      true
    );

    assert.equal(
      result.launchImminent,
      false
    );

    assert.equal(
      result.activationState,
      "ARMED"
    );

    assert.ok(
      result.tags.includes(
        "PORTAL_ARMED"
      )
    );

    assert.equal(
      result.priority,
      "HIGH"
    );

    assert.equal(
      result.eta,
      "< 24h"
    );
  }
);

test(
  "detection result: launch imminent triggers activation",
  () => {
    const {
      buildDetectionResult,
    } = createBuilder({
      detectEventType:
        () => "CLAIM READINESS",

      detectSignalFusion:
        () => "FULL ACTIVATION STACK",

      getPriority:
        () => "CRITICAL",

      getEta:
        () => "< 2h",
    });

    const result =
      buildDetectionResult({
        baseResult: {
          id: "triggered-1",
          tags: [
            "REWARDS",
            "LAUNCH_IMMINENT",
          ],
          launchImminent: true,
          portalArmed: true,
        },
        hasFreshActivationEvidence: true,
      });

    assert.equal(
      result.launchImminent,
      true
    );

    assert.equal(
      result.portalArmed,
      true
    );

    assert.equal(
      result.activationState,
      "TRIGGERED"
    );

    assert.ok(
      result.tags.includes(
        "LAUNCH_IMMINENT"
      )
    );

    assert.ok(
      result.tags.includes(
        "PORTAL_ARMED"
      )
    );

    assert.equal(
      result.tags.filter(
        (tag) =>
          tag === "LAUNCH_IMMINENT"
      ).length,
      1
    );

    assert.equal(
      result.priority,
      "CRITICAL"
    );

    assert.equal(
      result.eta,
      "< 2h"
    );
  }
);

test(
  "detection result: invalid base result throws",
  () => {
    const {
      buildDetectionResult,
    } = createBuilder();

    assert.throws(
      () =>
        buildDetectionResult({
          baseResult: null,
          hasFreshActivationEvidence: false,
        }),
      {
        name: "TypeError",
        message:
          "baseResult must be an object",
      }
    );

    assert.throws(
      () =>
        buildDetectionResult({
          baseResult: [],
          hasFreshActivationEvidence: false,
        }),
      TypeError
    );
  }
);

test(
  "detection result: invalid dependency throws",
  () => {
    assert.throws(
      () =>
        buildDetectionResultBuilder({
          ensureArray: null,
          evaluateAlpha: () => ({}),
          detectEventType: () => "",
          classifySignalRegime: () => "",
          detectSignalFusion: () => "",
          getPriority: () => "",
          getEta: () => "",
          buildSignature: () => "",
          buildAlertSignatureStable: () => "",
        }),
      {
        name: "TypeError",
        message:
          "ensureArray must be a function",
      }
    );
  }
);
