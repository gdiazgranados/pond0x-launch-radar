"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOnchainState,
} = require("../lib/onchain-state");

const now =
  Date.parse("2026-08-19T19:40:00.000Z");


const emptyObservedActivity = {
  fundingActive15m: false,
  rewardTransfers5m: 0,
  externalClaimTransfer: false,
  newExternalTransfers: 0,
  newExternalRecipients: 0,
  externalClaimLastObservedAt: null,
};

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
      ...emptyObservedActivity,
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
      ...emptyObservedActivity,
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
      ...emptyObservedActivity,
      rewardTransfers5m: 1,
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
      ...emptyObservedActivity,
      rewardTransfers5m: 4,
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
      ...emptyObservedActivity,
      fundingActive15m: true,
    },
  },

  {
    name: "FRESH_ACTIVE_EXTERNAL_CLAIM",

    input: {
      generatedAt:
        "2026-08-19T19:35:00.000Z",

      windows: {
        "5m": {
          rewardTransfers: 0,
        },
      },

      recipientLedger: {
        newTransfersThisSweep: 2,
        newRecipientsThisSweep: 1,
        lastObservedAt: "2026-08-19T19:34:00.000Z",
      },

      chainConfirmationScore: 64,
    },

    expected: {
      status: "ACTIVE",
      available: true,
      fresh: true,
      hasOnchainMovement: true,
      onchainScore: 64,
      onchain: [
        "external_claim_transfers:2",
        "new_external_recipients:1",
      ],
      ...emptyObservedActivity,
      externalClaimTransfer: true,
      newExternalTransfers: 2,
      newExternalRecipients: 1,
      externalClaimLastObservedAt: "2026-08-19T19:34:00.000Z",
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
