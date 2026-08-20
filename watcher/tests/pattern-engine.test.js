"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectPatterns,
} = require("../lib/pattern-engine");


function makeSignals(overrides = {}) {
  return {
    frontendScore: 0,
    infraScore: 0,
    rewardsScore: 0,
    behaviorScore: 0,

    hasWalletStrings: false,
    hasConnectUI: false,
    hasDisabledState: false,
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


function getPattern(patterns, tag) {
  return patterns.find(
    (pattern) =>
      pattern.tag === tag
  );
}


test(
  "pattern engine: empty baseline returns no patterns",
  () => {
    const patterns =
      detectPatterns(
        makeSignals()
      );

    assert.deepStrictEqual(
      patterns,
      []
    );
  }
);


test(
  "pattern engine: detects PRE-ACTIVATION",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          hasWalletStrings: true,
          hasConnectUI: true,
          hasDisabledState: true,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "PRE-ACTIVATION"
      );

    assert.ok(pattern);
    assert.equal(pattern.boost, 15);
    assert.equal(
      pattern.confidence,
      "HIGH"
    );

    assert.deepStrictEqual(
      pattern.reasons,
      [
        "Wallet-related strings detected",
        "Connect UI detected",
        "UI still appears disabled",
      ]
    );
  }
);


test(
  "pattern engine: detects REWARD_PREP only with fresh quiet on-chain state",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          hasRewardLogic: true,
          rewardsScore: 55,
          onchainFresh: true,
          hasOnchainMovement: false,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "REWARD_PREP"
      );

    assert.ok(pattern);
    assert.equal(pattern.boost, 20);
    assert.equal(
      pattern.confidence,
      "HIGH"
    );
  }
);


test(
  "pattern engine: detects INFRA_STAGING",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          infraScore: 60,
          frontendScore: 39,
          hasNewChunks: true,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "INFRA_STAGING"
      );

    assert.ok(pattern);
    assert.equal(pattern.boost, 10);
    assert.equal(
      pattern.confidence,
      "MEDIUM"
    );
  }
);


test(
  "pattern engine: detects UI_ARMING",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          frontendScore: 60,
          hasVisibleCTAChange: true,
          hasConnectUI: true,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "UI_ARMING"
      );

    assert.ok(pattern);
    assert.equal(pattern.boost, 12);
    assert.equal(
      pattern.confidence,
      "HIGH"
    );
  }
);


test(
  "pattern engine: BEHAVIOR_SPIKE captures every active reason",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          behaviorScore: 65,
          recentChangesCount: 5,
          movementPct: 25,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "BEHAVIOR_SPIKE"
      );

    assert.ok(pattern);
    assert.equal(pattern.boost, 10);
    assert.equal(
      pattern.confidence,
      "MEDIUM"
    );

    assert.deepStrictEqual(
      pattern.reasons,
      [
        "Behavioral signal convergence elevated (65/100)",
        "5 fresh surface changes detected",
        "Observed movement threshold exceeded (25%)",
      ]
    );
  }
);


test(
  "pattern engine: detects CONFIRMED_ACTIVATION",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          frontendScore: 65,
          hasRewardLogic: true,
          hasOnchainMovement: true,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "CONFIRMED_ACTIVATION"
      );

    assert.ok(pattern);
    assert.equal(pattern.boost, 25);
    assert.equal(
      pattern.confidence,
      "VERY HIGH"
    );
  }
);


test(
  "pattern engine: launch imminent requires fresh evidence",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          frontendScore: 70,
          rewardsScore: 60,
          behaviorScore: 55,

          recentChangesCount: 0,
          onchainFresh: false,
          hasOnchainMovement: false,
        })
      );

    assert.equal(
      getPattern(
        patterns,
        "LAUNCH_IMMINENT"
      ),
      undefined
    );
  }
);


test(
  "pattern engine: fresh surface changes can trigger LAUNCH_IMMINENT",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          frontendScore: 70,
          rewardsScore: 60,
          behaviorScore: 55,

          recentChangesCount: 3,
          onchainFresh: false,
          hasOnchainMovement: false,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "LAUNCH_IMMINENT"
      );

    assert.ok(pattern);
    assert.equal(pattern.boost, 30);
    assert.equal(
      pattern.confidence,
      "CRITICAL"
    );

    assert.ok(
      pattern.reasons.includes(
        "Multiple fresh surface changes detected"
      )
    );

    assert.equal(
      pattern.reasons.includes(
        "Fresh on-chain movement confirms activation activity"
      ),
      false
    );
  }
);


test(
  "pattern engine: fresh on-chain movement can trigger LAUNCH_IMMINENT",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          frontendScore: 70,
          rewardsScore: 60,
          behaviorScore: 55,

          recentChangesCount: 0,
          onchainFresh: true,
          hasOnchainMovement: true,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "LAUNCH_IMMINENT"
      );

    assert.ok(pattern);
    assert.equal(pattern.boost, 30);
    assert.equal(
      pattern.confidence,
      "CRITICAL"
    );

    assert.ok(
      pattern.reasons.includes(
        "Fresh on-chain movement confirms activation activity"
      )
    );

    assert.equal(
      pattern.reasons.includes(
        "Multiple fresh surface changes detected"
      ),
      false
    );
  }
);


test(
  "pattern engine: combined fresh evidence records both launch reasons",
  () => {
    const patterns =
      detectPatterns(
        makeSignals({
          frontendScore: 70,
          rewardsScore: 60,
          behaviorScore: 55,

          recentChangesCount: 3,
          onchainFresh: true,
          hasOnchainMovement: true,
        })
      );

    const pattern =
      getPattern(
        patterns,
        "LAUNCH_IMMINENT"
      );

    assert.ok(pattern);

    assert.ok(
      pattern.reasons.includes(
        "Multiple fresh surface changes detected"
      )
    );

    assert.ok(
      pattern.reasons.includes(
        "Fresh on-chain movement confirms activation activity"
      )
    );
  }
);
