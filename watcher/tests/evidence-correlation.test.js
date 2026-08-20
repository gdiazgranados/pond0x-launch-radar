"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEvidenceCorrelation,
} = require("../lib/evidence-correlation");

const generatedAt =
  "2026-08-19T20:00:00.000Z";

const cases = [
  {
    name: "NONE",

    input: {
      generatedAt,
    },

    expected: {
      evidenceClassification: "NONE",
      evidenceCount: 0,
      evidenceDomainCount: 0,
      temporalClassification: "NONE",
      temporalDomainCount: 0,
    },
  },

  {
    name: "ISOLATED_SURFACE",

    input: {
      generatedAt,
      hasFreshSurfaceMovement: true,
    },

    expected: {
      evidenceClassification: "ISOLATED",
      evidenceCount: 1,
      evidenceDomainCount: 1,
      temporalClassification: "NONE",
      temporalDomainCount: 1,
    },
  },

  {
    name: "MULTI_SURFACE",

    input: {
      generatedAt,

      freshBackendSignals: [
        "eligible_true",
      ],

      discoveryCriticalKeywords: [
        "claim",
      ],

      discoveryMatchesCurrentSnapshot: true,
    },

    expected: {
      evidenceClassification:
        "MULTI_SURFACE",

      evidenceDomainCount: 2,

      temporalClassification:
        "LOOSE",

      temporalDomainCount: 2,
    },
  },

  {
    name: "STRONG_CURRENT",

    input: {
      generatedAt,

      discoveryMatchesCurrentSnapshot:
        true,

      discovery: {
        apiResponseDrift: {
          detected: true,
        },
      },

      discoveryNewApiRoutes: [
        "/api/claim",
      ],

      freshBackendSignals: [
        "eligible_true",
      ],

      discoveryCriticalKeywords: [
        "claim",
      ],

      normalizedOnchain: {
        available: true,
        fresh: true,
        hasOnchainMovement: true,
      },
    },

    expected: {
      evidenceClassification: "STRONG",
      evidenceDomainCount: 4,

      temporalClassification:
        "TIGHT_CLUSTER",

      temporalDomainCount: 4,
      temporalSpanMinutes: 0,
    },
  },

  {
    name: "HISTORICAL_TIGHT_CLUSTER",

    input: {
      generatedAt,

      hasFreshSurfaceMovement: true,

      existingHistory: [
        {
          generatedAt:
            "2026-08-19T19:55:00.000Z",

          evidenceCorrelation: {
            domains: {
              backend: true,
            },
          },
        },

        {
          generatedAt:
            "2026-08-19T19:58:00.000Z",

          evidenceCorrelation: {
            domains: {
              semantic: true,
            },
          },
        },
      ],
    },

    expected: {
      evidenceClassification: "ISOLATED",
      evidenceDomainCount: 1,

      temporalClassification:
        "TIGHT_CLUSTER",

      temporalDomainCount: 3,
      temporalSpanMinutes: 5,
    },
  },

  {
    name: "OLD_HISTORY_IGNORED",

    input: {
      generatedAt,

      hasFreshSurfaceMovement: true,

      existingHistory: [
        {
          generatedAt:
            "2026-08-19T18:00:00.000Z",

          evidenceCorrelation: {
            domains: {
              backend: true,
              semantic: true,
              api: true,
            },
          },
        },
      ],
    },

    expected: {
      evidenceClassification: "ISOLATED",
      evidenceDomainCount: 1,

      temporalClassification: "NONE",
      temporalDomainCount: 1,
    },
  },
];

for (const testCase of cases) {

  test(
    `evidence correlation: ${testCase.name}`,
    () => {

      const {
        evidenceCorrelation,
        temporalCorrelation,
      } = buildEvidenceCorrelation(
        testCase.input
      );

      const actual = {
        evidenceClassification:
          evidenceCorrelation.classification,

        evidenceCount:
          evidenceCorrelation.evidenceCount,

        evidenceDomainCount:
          evidenceCorrelation.domainCount,

        temporalClassification:
          temporalCorrelation.classification,

        temporalDomainCount:
          temporalCorrelation.domainCount,

        temporalSpanMinutes:
          temporalCorrelation.spanMinutes,
      };

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
