"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOnchainState,
} = require("../lib/onchain-state");

const now =
  Date.parse("2026-08-19T19:40:00.000Z");

const cases = [
  {
    name: "MISSING",

    input: null,

    expected: {
      status: "UNKNOWN",
      available: false,
      fresh: false,
      hasOnchainMovement: undefined,
      onchainScore: 0,
      onchain: [],
    },
  },

  {
    name: "STALE",

    input: {
      generatedAt:
        "2026-08-19T19:00:00.000Z",

      windows: {
        "5m": {
          rewardTransfers: 10,
        },
      },

      fundingDetected: true,
      chainConfirmationScore: 80,
    },

    expected: {
      status: "UNKNOWN",
      available: true,
      fresh: false,
      hasOnchainMovement: undefined,
      onchainScore: 0,
      onchain: [],
    },
  },

  {
    name: "FRESH_QUIET",

    input: {
      generatedAt:
        "2026-08-19T19:35:00.000Z",

      windows: {
        "5m": {
          rewardTransfers: 1,
        },
      },

      fundingStatus: {
        active15m: false,
      },

      fundingDetected: false,
      chainConfirmationScore: 65,
    },

    expected: {
      status: "QUIET",
      available: true,
      fresh: true,
      hasOnchainMovement: false,
      onchainScore: 0,

      onchain: [
        "reward_transfers_5m:1",
      ],
    },
  },

  {
    name: "FRESH_ACTIVE_REWARDS",

    input: {
      generatedAt:
        "2026-08-19T19:35:00.000Z",

      windows: {
        "5m": {
          rewardTransfers: 4,
        },
      },

      fundingStatus: {
        active15m: false,
      },

      fundingDetected: false,
      chainConfirmationScore: 72,
    },

    expected: {
      status: "ACTIVE",
      available: true,
      fresh: true,
      hasOnchainMovement: true,
      onchainScore: 72,

      onchain: [
        "reward_transfers_5m:4",
      ],
    },
  },

  {
    name: "FRESH_ACTIVE_FUNDING",

    input: {
      generatedAt:
        "2026-08-19T19:35:00.000Z",

      windows: {
        "5m": {
          rewardTransfers: 0,
        },
      },

      fundingStatus: {
        active15m: true,
      },

      fundingDetected: false,
      chainConfirmationScore: 88,
    },

    expected: {
      status: "ACTIVE",
      available: true,
      fresh: true,
      hasOnchainMovement: true,
      onchainScore: 88,

      onchain: [
        "funding_active_15m",
      ],
    },
  },
];

for (const testCase of cases) {

  test(
    `normalizeOnchainState: ${testCase.name}`,
    () => {

      const actual =
        normalizeOnchainState(
          testCase.input,
          now
        );

      assert.deepStrictEqual(
        actual,
        testCase.expected
      );
    }
  );
}
