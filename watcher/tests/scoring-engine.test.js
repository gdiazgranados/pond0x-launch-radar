const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeRadarScore,
} = require("../lib/scoring-engine");


function makeSignals(overrides = {}) {
  return {
    frontendScore: 0,
    infraScore: 0,
    rewardsScore: 0,
    behaviorScore: 0,

    frontend: [],
    infra: [],
    rewards: [],
    behavior: [],
    onchain: [],

    onchainScore: 0,

    hasWalletStrings: false,
    hasConnectUI: false,
    hasRewardLogic: false,
    hasNewChunks: false,
    hasVisibleCTAChange: false,

    recentChangesCount: 0,
    movementPct: 0,

    onchainFresh: false,
    hasOnchainMovement: false,

    ...overrides,
  };
}


test("scoring engine: empty baseline is LOW and flat", () => {
  const result =
    computeRadarScore(
      makeSignals(),
      []
    );

  assert.equal(result.score, 0);
  assert.equal(result.level, "LOW");
  assert.equal(result.trend, 0);
  assert.equal(result.trendDirection, "FLAT");

  assert.deepEqual(result.tags, []);
  assert.equal(result.breakdown.patternBoost, 0);
});


test("scoring engine: weighted base score is deterministic", () => {
  const result =
    computeRadarScore(
      makeSignals({
        frontendScore: 40,
        infraScore: 40,
        rewardsScore: 40,
        behaviorScore: 40,
      }),
      []
    );

  assert.equal(result.score, 40);
  assert.equal(result.level, "LOW");

  assert.equal(
    result.breakdown.frontend.weighted,
    14
  );

  assert.equal(
    result.breakdown.infra.weighted,
    10
  );

  assert.equal(
    result.breakdown.rewards.weighted,
    10
  );

  assert.equal(
    result.breakdown.behavior.weighted,
    6
  );
});


test("scoring engine: on-chain movement adds ten points", () => {
  const withoutMovement =
    computeRadarScore(
      makeSignals({
        frontendScore: 40,
      }),
      []
    );

  const withMovement =
    computeRadarScore(
      makeSignals({
        frontendScore: 40,
        hasOnchainMovement: true,
      }),
      []
    );

  assert.equal(
    withMovement.score - withoutMovement.score,
    10
  );
});


test("scoring engine: level thresholds remain stable", () => {
  const medium =
    computeRadarScore(
      makeSignals({
        frontendScore: 100,
        infraScore: 40,
      }),
      []
    );

  assert.equal(medium.score, 45);
  assert.equal(medium.level, "MEDIUM");

  const high =
    computeRadarScore(
      makeSignals({
        frontendScore: 100,
        infraScore: 100,
        rewardsScore: 20,
      }),
      []
    );

  assert.equal(high.score, 65);
  assert.equal(high.level, "HIGH");

  const veryHigh =
    computeRadarScore(
      makeSignals({
        frontendScore: 100,
        infraScore: 100,
        rewardsScore: 80,
      }),
      []
    );

  assert.equal(veryHigh.score, 80);
  assert.equal(veryHigh.level, "VERY HIGH");
});


test("scoring engine: score is clamped to one hundred", () => {
  const result =
    computeRadarScore(
      makeSignals({
        frontendScore: 100,
        infraScore: 100,
        rewardsScore: 100,
        behaviorScore: 100,

        hasOnchainMovement: true,

        behaviorScore: 100,
        recentChangesCount: 10,
        movementPct: 50,
      }),
      []
    );

  assert.equal(result.score, 100);
});


test("scoring engine: positive trend requires eight point delta", () => {
  const history = [
    { score: 20 },
    { score: 20 },
    { score: 20 },
  ];

  const result =
    computeRadarScore(
      makeSignals({
        frontendScore: 80,
      }),
      history
    );

  assert.equal(result.score, 28);
  assert.equal(result.trend, 8);
  assert.equal(result.trendDirection, "UP");
});


test("scoring engine: negative trend requires minus eight point delta", () => {
  const history = [
    { score: 40 },
    { score: 40 },
    { score: 40 },
  ];

  const result =
    computeRadarScore(
      makeSignals({
        frontendScore: 80,
      }),
      history
    );

  assert.equal(result.score, 28);
  assert.equal(result.trend, -12);
  assert.equal(result.trendDirection, "DOWN");
});


test("scoring engine: sub-threshold trend remains flat", () => {
  const history = [
    { score: 25 },
    { score: 25 },
    { score: 25 },
  ];

  const result =
    computeRadarScore(
      makeSignals({
        frontendScore: 80,
      }),
      history
    );

  assert.equal(result.score, 28);
  assert.equal(result.trend, 3);
  assert.equal(result.trendDirection, "FLAT");
});


test("scoring engine: confirmed activation forces VERY HIGH", () => {
  const result =
    computeRadarScore(
      makeSignals({
        frontendScore: 65,
        hasRewardLogic: true,
        hasOnchainMovement: true,
      }),
      []
    );

  assert.ok(
    result.tags.includes("CONFIRMED_ACTIVATION")
  );

  assert.equal(result.level, "VERY HIGH");
});


test("scoring engine: launch imminent forces CRITICAL", () => {
  const result =
    computeRadarScore(
      makeSignals({
        frontendScore: 70,
        rewardsScore: 60,
        behaviorScore: 55,

        recentChangesCount: 3,
      }),
      []
    );

  assert.ok(
    result.tags.includes("LAUNCH_IMMINENT")
  );

  assert.equal(result.level, "CRITICAL");
});
