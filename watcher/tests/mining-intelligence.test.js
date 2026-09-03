"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMiningIntelligence } = require("../lib/mining-intelligence");

const now = new Date("2026-09-02T18:00:00.000Z");

function fixture() {
  return buildMiningIntelligence(
    {
      entities: {
        claimDistributor: "AYg4dKoZJudVkD7Eu3ZaJjkzfoaATUqfiv8w8pS53opT",
        rewardWallet: "1orFCnFfgwPzSgUaoK6Wr3MjgXZ7mtk8NGz9Hh4iWWL",
      },
      recentExternalClaims: [
        { amount: 100, to: "wallet-a" },
        { amount: 200, to: "wallet-b" },
        { amount: 300, to: "wallet-a" },
        { amount: 400, to: "wallet-c" },
      ],
    },
    {
      totalWPOND: 1000,
      lastObservedAt: "2026-09-02T17:30:00.000Z",
      recipients: [
        { wallet: "wallet-a", totalWPOND: 600, transferCount: 3 },
        { wallet: "wallet-b", totalWPOND: 300, transferCount: 2 },
        { wallet: "wallet-c", totalWPOND: 100, transferCount: 1 },
      ],
    },
    {
      activityState: "ACTIVE",
      latestTransfer: { time: "2026-09-02T17:30:00.000Z" },
      windows: { "1h": { transfers: 4, wpondDistributed: 1000 } },
      velocity1h: { transferVelocityPct: 100 },
      coverage: {
        coverageComplete: true,
        sampleLimited: false,
        horizonMinutes: 1440,
        analyzedTransferSample: 4,
      },
    },
    now
  );
}

test("builds score-neutral mining activity from Radar-owned evidence", () => {
  const result = fixture();

  assert.equal(result.scoreNeutral, true);
  assert.equal(result.classification, "OBSERVED_MINING_ACTIVITY_CANDIDATES");
  assert.equal(result.freshness.status, "LIVE");
  assert.equal(result.freshness.ageMinutes, 30);
  assert.equal(result.freshness.hasRecentActivity, true);
  assert.equal(result.coverage.sourceStatus, "HEALTHY");
  assert.equal(result.coverage.lifetimeSampleLimited, true);
  assert.equal(result.coverage.lifetimeTransferSample, 6);
  assert.equal(result.lifetime.candidateTransfers, 6);
  assert.equal(result.lifetime.repeatRecipientPct, 66.7);
  assert.equal(result.lifetime.repeatTransferPct, 83.3);
  assert.equal(result.concentration.top1SharePct, 60);
  assert.equal(result.concentration.top5SharePct, 100);
  assert.equal(result.amountProfile.p25, 175);
  assert.equal(result.amountProfile.median, 250);
  assert.equal(result.amountProfile.p75, 325);
});

test("keeps ambiguous and vanity-family entities explicitly unconfirmed", () => {
  const result = fixture();
  const ambiguous = result.entities.find((entity) => entity.role === "POOL_OR_RELAY");
  const vanity = result.entities.find((entity) => entity.role === "VANITY_FAMILY_CANDIDATE");

  assert.equal(ambiguous.status, "AMBIGUOUS");
  assert.equal(ambiguous.observedInCurrentChainModel, false);
  assert.equal(vanity.status, "UNCONFIRMED_RELATION");
  assert.match(result.methodology, /does not affect Radar Score/);
});

test("marks old claim activity inactive without treating the source as unhealthy", () => {
  const result = buildMiningIntelligence(
    {},
    { lastObservedAt: "2026-08-27T09:40:00.000Z", recipients: [] },
    { coverage: { coverageComplete: true } },
    now
  );

  assert.equal(result.freshness.status, "INACTIVE");
  assert.equal(result.freshness.hasRecentActivity, false);
  assert.equal("feedHealthy" in result.freshness, false);
  assert.equal(result.coverage.sourceStatus, "HEALTHY");
  assert.equal(result.coverage.lifetimeSampleLimited, true);
  assert.equal("launchImminent" in result, false);
});

test("marks lifetime statistics supported only after the explicit sample threshold", () => {
  const recipients = Array.from({ length: 20 }, (_, index) => ({
    wallet: `wallet-${index}`,
    totalWPOND: 100,
    transferCount: 1,
  }));
  const result = buildMiningIntelligence(
    {},
    { recipients, totalWPOND: 2000 },
    { coverage: { coverageComplete: true } },
    now
  );

  assert.equal(result.coverage.lifetimeTransferSample, 20);
  assert.equal(result.coverage.minimumReliableLifetimeSample, 20);
  assert.equal(result.coverage.lifetimeSampleLimited, false);
});
