"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  summarizeRadarIntelligence,
} = require("../radar-intelligence");


test("radar intelligence: empty baseline contract", () => {
  const result =
    summarizeRadarIntelligence({}, []);

  assert.deepEqual(result, {
    focusAreas: [],
    sensitiveHits: [],
    changeTypes: [],
    rarityScore: 0,
    score: 0,
    significance: "NONE",
    level: "LOW",
    patternScore: 0,
    patterns: [],
    launchImminent: false,
    portalArmed: false,
    activationProbability: 0,
    whyItMatters: "",
  });
});


test("radar intelligence: minimal movement contract", () => {
  const current = {
    movementPct: 25,
    changedPct: 10,
    addedPct: 5,
    movementCount: 3,
    signals: [],
    backendSignals: [],
    tags: [],
  };

  const result =
    summarizeRadarIntelligence(
      current,
      []
    );

  assert.deepEqual(result, {
    focusAreas: [],
    sensitiveHits: [],
    changeTypes: [],
    rarityScore: 0,
    score: 21,
    significance: "LOW",
    level: "LOW",
    patternScore: 0,
    patterns: [],
    launchImminent: false,
    portalArmed: false,
    activationProbability: 5,
    whyItMatters: "",
  });
});


test("radar intelligence: current evidence is required for activation probability", () => {
  const result =
    summarizeRadarIntelligence(
      {
        movementPct: 0,
        movementCount: 0,
        signals: [],
        backendSignals: [],
        tags: [],
      },
      [
        {
          generatedAt:
            "2026-08-19T12:00:00.000Z",
          score: 150,
          signals: [
            "claim",
            "reward",
            "wallet",
            "verify",
          ],
          focusAreas: [
            "REWARDS",
            "CLAIM",
          ],
        },
      ]
    );

  assert.equal(
    result.activationProbability,
    0
  );

  assert.equal(
    result.launchImminent,
    false
  );

  assert.equal(
    result.portalArmed,
    false
  );
});


test("radar intelligence: backend claim confirmation produces thirty-five activation points", () => {
  const result =
    summarizeRadarIntelligence(
      {
        backendSignals: [
          "canclaim_true",
        ],
        signals: [],
        tags: [],
      },
      []
    );

  assert.equal(
    result.activationProbability,
    35
  );
});


test("radar intelligence: supporting backend evidence produces fifteen activation points", () => {
  const result =
    summarizeRadarIntelligence(
      {
        backendSignals: [
          "enabled_true",
        ],
        signals: [],
        tags: [],
      },
      []
    );

  assert.equal(
    result.activationProbability,
    15
  );
});


test("radar intelligence: activation probability is clamped to one hundred", () => {
  const current = {
    movementPct: 30,
    movementCount: 4,

    signals: [
      "claim",
      "reward",
      "signin",
      "wallet",
    ],

    backendSignals: [
      "canclaim_true",
      "enabled_true",
    ],

    tags: [
      "claim",
      "reward",
      "signin",
      "wallet",
    ],

    summary:
      "claim reward signin wallet",
  };

  const result =
    summarizeRadarIntelligence(
      current,
      []
    );

  assert.equal(
    result.activationProbability,
    100
  );
});


test("radar intelligence: portal armed requires full convergence and snapshot score", () => {
  const current = {
    score: 120,

    signals: [
      "claim",
      "reward",
      "verify",
      "wallet",
    ],

    tags: [
      "claim",
      "reward",
      "verify",
      "wallet",
    ],

    summary:
      "claim reward verify wallet",
  };

  const result =
    summarizeRadarIntelligence(
      current,
      []
    );

  assert.equal(
    result.portalArmed,
    true
  );

  assert.ok(
    result.patterns.includes(
      "PORTAL_ARMED"
    )
  );
});


test("radar intelligence: portal armed rejects score below threshold", () => {
  const current = {
    score: 119,

    signals: [
      "claim",
      "reward",
      "verify",
      "wallet",
    ],

    tags: [
      "claim",
      "reward",
      "verify",
      "wallet",
    ],

    summary:
      "claim reward verify wallet",
  };

  const result =
    summarizeRadarIntelligence(
      current,
      []
    );

  assert.equal(
    result.portalArmed,
    false
  );

  assert.equal(
    result.patterns.includes(
      "PORTAL_ARMED"
    ),
    false
  );
});


test("radar intelligence: launch imminent requires armed context plus transition", () => {
  const current = {
    score: 130,
    trend: 10,
    movementCount: 1,

    signals: [
      "claim",
      "reward",
      "verify",
      "wallet",
    ],

    backendSignals: [
      "canclaim_true",
    ],

    tags: [
      "claim",
      "reward",
      "verify",
      "wallet",
    ],

    summary:
      "claim reward verify wallet",
  };

  const history = [
    {
      generatedAt:
        "2026-08-19T12:00:00.000Z",

      score: 110,

      signals: [
        "reward",
        "wallet",
      ],

      focusAreas: [
        "REWARDS",
      ],
    },
  ];

  const result =
    summarizeRadarIntelligence(
      current,
      history
    );

  assert.equal(
    result.launchImminent,
    true
  );

  assert.ok(
    result.patterns.includes(
      "LAUNCH_IMMINENT"
    )
  );

  assert.equal(
    result.portalArmed,
    true
  );
});


test("radar intelligence: strong score alone cannot arm or trigger launch", () => {
  const result =
    summarizeRadarIntelligence(
      {
        score: 200,
        trend: 50,
        signals: [],
        backendSignals: [],
        tags: [],
      },
      []
    );

  assert.equal(
    result.portalArmed,
    false
  );

  assert.equal(
    result.launchImminent,
    false
  );

  assert.equal(
    result.patterns.includes(
      "PORTAL_ARMED"
    ),
    false
  );

  assert.equal(
    result.patterns.includes(
      "LAUNCH_IMMINENT"
    ),
    false
  );
});
