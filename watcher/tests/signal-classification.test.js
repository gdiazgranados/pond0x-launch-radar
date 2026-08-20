"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSignalClassification,
} = require("../lib/signal-classification");

function ensureArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

const {
  evaluateAlpha,
  detectEventType,
  classifySignalRegime,
  detectSignalFusion,
  getPriority,
  getEta,
} = buildSignalClassification({
  ensureArray,
});

const cases = [
  {
    name: "NOISE_BASELINE",

    latest: {
      score: 0,
      scorePercent: 0,
      movementPct: 0,
      trend: 0,
      activationProbability: 0,
      tags: [],
      signals: [],
      discovery: {},
      backendSignals: [],
      level: "LOW",
      breakdown: {
        patternBoost: 0,
      },
      trendDirection: "FLAT",
    },

    expected: {
      alphaClass: "NOISE",
      triggerState: "IDLE",
      eventType: "NOISE",
      signalRegime:
        "NOISE DISGUISED AS SIGNAL",
      signalFusion:
        "UNCLASSIFIED SIGNAL MIX",
      priority: "LOW",
      eta: "unknown",
    },
  },

  {
    name: "WATCH_THRESHOLD",

    latest: {
      score: 25,
      scorePercent: 25,
      movementPct: 0,
      trend: 0,
      activationProbability: 0,
      tags: [],
      signals: [],
      discovery: {},
      backendSignals: [],
      level: "LOW",
      breakdown: {
        patternBoost: 0,
      },
      trendDirection: "FLAT",
    },

    expected: {
      alphaClass: "NOISE",
      triggerState: "IDLE",
      eventType: "NOISE",
      signalRegime:
        "NOISE DISGUISED AS SIGNAL",
      signalFusion:
        "UNCLASSIFIED SIGNAL MIX",
      priority: "LOW",
      eta: "unknown",
    },
  },

  {
    name: "CLAIM_READINESS",

    latest: {
      score: 70,
      scorePercent: 70,
      movementPct: 15,
      trend: 3,
      activationProbability: 70,

      tags: [
        "REWARDS",
      ],

      signals: [
        "claim",
        "eligible",
        "wallet",
        "connect",
        "ethereum",
      ],

      discovery: {
        newApiRoutes: [
          "/api/claim",
          "/api/rewards",
        ],

        criticalKeywords: [
          "claim",
          "eligible",
        ],

        keyFunctionCandidate:
          "api:claim",
      },

      backendSignals: [
        "eligible_true",
        "canclaim_true",
      ],

      level: "HIGH",

      breakdown: {
        patternBoost: 25,
      },

      trendDirection: "UP",
    },

    expected: {
      alphaClass: "SETUP",
      triggerState: "WATCHING",
      eventType: "REWARD ACTIVATION",
      signalRegime:
        "TRANSITIONAL SIGNAL",
      signalFusion:
        "ELEVATED MULTI-SIGNAL EVENT",
      priority: "HIGH",
      eta: "24h - 72h",
    },
  },

  {
    name: "FULL_ACTIVATION_STACK",

    latest: {
      score: 90,
      scorePercent: 90,
      movementPct: 30,
      trend: 8,
      activationProbability: 90,

      tags: [
        "REWARDS",
        "AUTH",
        "CHAIN",
        "SYSTEM",
        "LAUNCH_IMMINENT",
      ],

      signals: [
        "reward",
        "claim",
        "wallet",
        "connect",
        "ethereum",
        "verify",
        "account",
        "enabled",
        "active",
      ],

      discovery: {
        newApiRoutes: [
          "/api/claim",
          "/api/rewards",
        ],

        criticalKeywords: [
          "claim",
          "reward",
        ],

        keyFunctionCandidate:
          "critical:claim",
      },

      backendSignals: [
        "eligible_true",
        "canclaim_true",
        "enabled_true",
        "active_true",
        "rewards_array",
      ],

      level: "VERY HIGH",

      breakdown: {
        patternBoost: 30,
      },

      trendDirection: "UP",
    },

    expected: {
      alphaClass: "CRITICAL",
      triggerState: "TRIGGERED",
      eventType: "REWARD ACTIVATION",
      signalRegime:
        "PRE-LAUNCH REAL",
      signalFusion:
        "FULL ACTIVATION STACK",
      priority: "CRITICAL",
      eta: "< 2h",
    },
  },
];

for (const testCase of cases) {

  test(
    `signal classification: ${testCase.name}`,
    () => {

      const alpha =
        evaluateAlpha(
          testCase.latest
        );

      const eventType =
        detectEventType(
          testCase.latest
        );

      const signalRegime =
        classifySignalRegime(
          testCase.latest,
          alpha,
          eventType
        );

      const signalFusion =
        detectSignalFusion(
          testCase.latest,
          alpha,
          eventType
        );

      const actual = {
        alphaClass:
          alpha.alphaClass,

        triggerState:
          alpha.triggerState,

        eventType,

        signalRegime,

        signalFusion,

        priority:
          getPriority(
            testCase.latest
          ),

        eta:
          getEta(
            testCase.latest
          ),
      };

      assert.deepStrictEqual(
        actual,
        testCase.expected
      );
    }
  );
}
