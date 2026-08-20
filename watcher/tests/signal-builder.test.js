"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSignalBuilder,
} = require("../lib/signal-builder");

function includesAny(text, needles) {
  const lower =
    String(text || "").toLowerCase();

  return needles.some((needle) =>
    lower.includes(
      String(needle).toLowerCase()
    )
  );
}

function ensureArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function uniqueSortedStrings(values) {
  return [
    ...new Set(
      ensureArray(values)
        .map((value) =>
          String(value || "").trim()
        )
        .filter(Boolean)
    ),
  ].sort();
}

const {
  buildSignals,
} = buildSignalBuilder({
  includesAny,
  uniqueSortedStrings,
  ensureArray,
});

const cases = [
  {
    name: "BASELINE_EMPTY",

    input: {
      movementPct: 0,
      recentChangesCount: 0,
      discovery: {},
      backendSignals: [],
      onchain: {},
    },

    expected: {
      frontendScore: 0,
      infraScore: 0,
      rewardsScore: 0,
      behaviorScore: 0,
      onchainStatus: "UNKNOWN",
      onchainAvailable: false,
      onchainFresh: false,
    },
  },

  {
    name: "FRONTEND_WALLET",

    input: {
      movementPct: 0,
      recentChangesCount: 0,

      discovery: {
        criticalKeywords: [
          "wallet",
          "connect",
        ],
      },

      backendSignals: [],
      onchain: {},
    },

    expected: {
      frontendScore: 60,

      frontend: [
        "wallet_strings",
        "connect_ui",
        "cta_change",
      ],
    },
  },

  {
    name: "REWARDS_BACKEND",

    input: {
      movementPct: 0,
      recentChangesCount: 0,

      discovery: {},

      backendSignals: [
        "eligible_true",
        "canclaim_true",
        "rewards_array",
      ],

      onchain: {},
    },

    expected: {
      rewardsScore: 100,
    },
  },

  {
    name: "BEHAVIOR_CLUSTER",

    input: {
      movementPct: 15,
      recentChangesCount: 4,

      discovery: {
        criticalKeywords: [
          "claim",
          "eligible",
        ],

        newApiRoutes: [
          "/api/claim",
        ],

        keyFunctionCandidate:
          "api:claim",
      },

      backendSignals: [],
      onchain: {},
    },

    expected: {
      behaviorScore: 100,
    },
  },

  {
    name: "ONCHAIN_ACTIVE",

    input: {
      movementPct: 0,
      recentChangesCount: 0,

      discovery: {},
      backendSignals: [],

      onchain: {
        status: "ACTIVE",
        available: true,
        fresh: true,
        hasOnchainMovement: true,
        onchainScore: 70,
        onchain: [
          "reward_transfers_5m:4",
        ],
      },
    },

    expected: {
      onchainStatus: "ACTIVE",
      onchainAvailable: true,
      onchainFresh: true,
      hasOnchainMovement: true,
      onchainScore: 70,
      onchain: [
        "reward_transfers_5m:4",
      ],
    },
  },

  {
    name: "FULL_SIGNAL_MIX",

    input: {
      movementPct: 25,
      recentChangesCount: 5,

      discovery: {
        criticalKeywords: [
          "wallet",
          "connect",
          "claim",
          "eligible",
          "enabled",
        ],

        newApiRoutes: [
          "/api/claim",
          "/api/rewards",
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

      onchain: {
        status: "ACTIVE",
        available: true,
        fresh: true,
        hasOnchainMovement: true,
        onchainScore: 90,
        onchain: [
          "reward_transfers_5m:5",
          "funding_active_15m",
        ],
      },
    },

    expected: {
      frontendScore: 100,
      rewardsScore: 100,
      behaviorScore: 100,
      onchainStatus: "ACTIVE",
      onchainAvailable: true,
      onchainFresh: true,
      hasOnchainMovement: true,
      onchainScore: 90,
    },
  },
];

for (const testCase of cases) {

  test(
    `signal builder: ${testCase.name}`,
    () => {

      const actual =
        buildSignals(
          testCase.input
        );

      for (
        const [key, expectedValue]
        of Object.entries(
          testCase.expected
        )
      ) {
        assert.deepStrictEqual(
          actual[key],
          expectedValue,
          `${testCase.name}: ${key}`
        );
      }
    }
  );
}
