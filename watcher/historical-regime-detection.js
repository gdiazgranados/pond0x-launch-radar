"use strict";

const fs = require("fs-extra");
const path = require("path");

const {
  arr,
  n,
  round,
  average,
  readJsonRequired,
} = require("./lib/runtime-data");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");

const ARCHIVE_FILE = path.join(
  PUBLIC_DATA,
  "historical-evidence-archive.json"
);

const TREND_FILE = path.join(
  PUBLIC_DATA,
  "historical-trend-intelligence.json"
);

const OUTPUT_FILE = path.join(
  PUBLIC_DATA,
  "historical-regime-detection.json"
);

const REGIME = Object.freeze({
  UNKNOWN: "UNKNOWN",
  LEARNING: "LEARNING",
  QUIET: "QUIET",
  BUILDING: "BUILDING",
  ELEVATED: "ELEVATED",
  ACTIVATION_LIKE: "ACTIVATION_LIKE",
  COOLING: "COOLING",
});

const USABLE_HISTORY_STAGES = new Set([
  "PRELIMINARY",
  "USABLE",
  "STRONG",
]);

const WINDOW = 6;

function activityScore(entry) {
  if (!entry) return 0;

  const scores = entry.scores || {};
  const gates = entry.gates || {};
  const onchain = entry.onchain || {};
  const surfaces = entry.surfaces || {};

  return (
    n(scores.radar) +
    n(scores.semantic) +
    n(scores.correlation) +
    n(scores.evidenceConfidence) +
    n(scores.activationTimeline) +
    n(scores.decisionStrength) +
    n(gates.domainCount) * 5 +
    n(gates.highConfidenceEvidence) * 5 +
    n(onchain.newExternalTransfers) * 2 +
    n(onchain.newExternalRecipients) * 3 +
    arr(surfaces.dormantToLive).length * 10 +
    arr(surfaces.freshDiscoveries).length * 5
  );
}

function buildBaseline(priorEntries) {
  const recentEntries = priorEntries.slice(-WINDOW);
  const previousEntries = priorEntries.slice(-WINDOW * 2, -WINDOW);

  return {
    recentEntries,
    previousEntries,
    recentAverage: average(recentEntries.map(activityScore)),
    previousAverage: average(previousEntries.map(activityScore)),
  };
}

function classifyCandidate({
  current,
  recentAverage,
  previousAverage,
  trend,
}) {
  if (!current) {
    return {
      regime: REGIME.UNKNOWN,
      confidence: 0,
      reasons: ["No exact sweep is available."],
    };
  }

  const currentActivity = activityScore(current);
  const gates = current.gates || {};
  const drivers = arr(trend?.drivers);

  const domainCount = n(gates.domainCount);
  const highConfidenceEvidence = n(gates.highConfidenceEvidence);

  const highDrivers = drivers.filter(
    (driver) => n(driver?.percentile) >= 85
  );

  const risingDrivers = drivers.filter(
    (driver) => driver?.trend === "RISING"
  );

  const anomalyScore =
    trend?.anomalyScore == null
      ? null
      : n(trend.anomalyScore);

  if (
    gates.activationTransition === true &&
    (gates.runtimeEvidence === true ||
      gates.distributionEvidence === true) &&
    domainCount >= 2
  ) {
    return {
      regime: REGIME.ACTIVATION_LIKE,
      confidence: 90,
      reasons: [
        "Activation transition is present with corroborating runtime or distribution evidence.",
        `Evidence spans ${domainCount} domains.`,
      ],
    };
  }

  if (
    anomalyScore !== null &&
    anomalyScore >= 80 &&
    highDrivers.length >= 2
  ) {
    return {
      regime: REGIME.ELEVATED,
      confidence: 80,
      reasons: [
        `Historical anomaly score is ${round(anomalyScore, 1)}.`,
        `${highDrivers.length} high-percentile historical drivers are active.`,
      ],
    };
  }

  if (
    risingDrivers.length >= 2 ||
    (
      currentActivity > 0 &&
      previousAverage > 0 &&
      recentAverage > previousAverage * 1.25
    )
  ) {
    const reasons = [
      "Recent activity is rising relative to the preceding baseline.",
    ];

    if (risingDrivers.length > 0) {
      reasons.push(
        `${risingDrivers.length} historical drivers are rising.`
      );
    }

    return {
      regime: REGIME.BUILDING,
      confidence: 70,
      reasons,
    };
  }

  if (
    previousAverage > 0 &&
    recentAverage < previousAverage * 0.75 &&
    currentActivity <= recentAverage
  ) {
    return {
      regime: REGIME.COOLING,
      confidence: 65,
      reasons: [
        "Recent activity has materially declined from the preceding baseline.",
      ],
    };
  }

  if (
    currentActivity === 0 &&
    domainCount === 0 &&
    highConfidenceEvidence === 0 &&
    drivers.length === 0
  ) {
    return {
      regime: REGIME.QUIET,
      confidence: 85,
      reasons: [
        "Current exact sweep has no meaningful activation, evidence, or historical-driver activity.",
      ],
    };
  }

  return {
    regime: REGIME.QUIET,
    confidence: 60,
    reasons: [
      "Observed activity does not satisfy a stronger regime definition.",
    ],
  };
}

function sortEntries(entries) {
  return arr(entries)
    .filter((entry) => entry?.generatedAt)
    .sort(
      (a, b) =>
        new Date(a.generatedAt).getTime() -
        new Date(b.generatedAt).getTime()
    );
}

async function main() {
  await fs.ensureDir(PUBLIC_DATA);

  const [archive, trend] = await Promise.all([
    readJsonRequired(ARCHIVE_FILE),
    readJsonRequired(TREND_FILE),
  ]);

  const entries = sortEntries(archive?.entries);
  const current = entries.at(-1) || null;
  const priorEntries = current ? entries.slice(0, -1) : [];

  const {
    recentEntries,
    previousEntries,
    recentAverage,
    previousAverage,
  } = buildBaseline(priorEntries);

  const historyStage = trend?.history?.stage || "LEARNING";

  const candidate = classifyCandidate({
    current,
    recentAverage,
    previousAverage,
    trend,
  });

  const isHistoryUsable =
    USABLE_HISTORY_STAGES.has(historyStage);

  const regime = isHistoryUsable
    ? candidate.regime
    : REGIME.LEARNING;

  const confidence = isHistoryUsable
    ? candidate.confidence
    : null;

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),

    regime,
    confidence,

    candidateRegime: candidate.regime,
    candidateConfidence: candidate.confidence,

    history: {
      stage: historyStage,
      exactSweepCount:
        n(trend?.history?.exactSweepCount) || entries.length,
      usableForRegimeClassification: isHistoryUsable,
    },

    current: {
      snapshotId: current?.snapshotId || null,
      generatedAt: current?.generatedAt || null,
      decisionState: current?.states?.decision || null,
      activityScore: activityScore(current),
    },

    baseline: {
      recentWindowSweeps: recentEntries.length,
      previousWindowSweeps: previousEntries.length,
      recentSixSweepAverageActivity: round(recentAverage),
      previousSixSweepAverageActivity: round(previousAverage),
    },

    trendContext: {
      status: trend?.status || null,
      anomalyScore: trend?.anomalyScore ?? null,
      driverCount: arr(trend?.drivers).length,
      drivers: arr(trend?.drivers),
    },

    reasons: candidate.reasons,

    methodology:
      "Score-neutral regime classification derived from exact sweep history and Historical Trend Intelligence. Stronger regimes require corroborating historical or multi-domain evidence.",

    caution:
      "Regime Detection is descriptive only. It does not modify Radar scoring, establish launch probability, predict rewards, or constitute trading advice.",
  };

  await fs.writeJson(OUTPUT_FILE, output, { spaces: 2 });

  console.log(
    `Historical Regime Detection v1 | regime=${regime} candidate=${candidate.regime} stage=${historyStage} sweeps=${entries.length} confidence=${confidence ?? "n/a"}`
  );
}

main().catch((error) => {
  console.error(
    "historical-regime-detection failed:",
    error
  );
  process.exit(1);
});