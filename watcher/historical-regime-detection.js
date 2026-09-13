"use strict";

const fs = require("fs-extra");
const path = require("path");

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

async function readJson(file, fallback) {
  try {
    return await fs.readJson(file);
  } catch {
    return fallback;
  }
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function n(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(n(value) * factor) / factor;
}

function average(values) {
  if (!values.length) return 0;

  return (
    values.reduce(
      (sum, value) => sum + n(value),
      0
    ) / values.length
  );
}

function activityScore(entry) {
  if (!entry) return 0;

  return (
    n(entry?.scores?.radar) +
    n(entry?.scores?.semantic) +
    n(entry?.scores?.correlation) +
    n(entry?.scores?.evidenceConfidence) +
    n(entry?.scores?.activationTimeline) +
    n(entry?.scores?.decisionStrength) +
    n(entry?.gates?.domainCount) * 5 +
    n(entry?.gates?.highConfidenceEvidence) * 5 +
    n(entry?.onchain?.newExternalTransfers) * 2 +
    n(entry?.onchain?.newExternalRecipients) * 3 +
    arr(entry?.surfaces?.dormantToLive).length * 10 +
    arr(entry?.surfaces?.freshDiscoveries).length * 5
  );
}

function classifyCandidate({
  current,
  recentEntries,
  previousEntries,
  trend,
}) {
  if (!current) {
    return {
      regime: "UNKNOWN",
      confidence: 0,
      reasons: ["No exact sweep is available."],
    };
  }

  const reasons = [];

  const currentActivity = activityScore(current);

  const recentActivity = average(
    recentEntries.map(activityScore)
  );

  const previousActivity = average(
    previousEntries.map(activityScore)
  );

  const activationTransition =
    current?.gates?.activationTransition === true;

  const runtimeEvidence =
    current?.gates?.runtimeEvidence === true;

  const distributionEvidence =
    current?.gates?.distributionEvidence === true;

  const domainCount =
    n(current?.gates?.domainCount);

  const highConfidenceEvidence =
    n(current?.gates?.highConfidenceEvidence);

  const drivers = arr(trend?.drivers);

  const highDrivers = drivers.filter(
    (driver) => n(driver?.percentile) >= 85
  );

  const risingDrivers = drivers.filter(
    (driver) => driver?.trend === "RISING"
  );

  const anomalyScore =
    trend?.anomalyScore === null ||
    trend?.anomalyScore === undefined
      ? null
      : n(trend.anomalyScore);

  // Highest-confidence regime first.
  if (
    activationTransition &&
    (runtimeEvidence || distributionEvidence) &&
    domainCount >= 2
  ) {
    reasons.push(
      "Activation transition is present with corroborating runtime/distribution evidence."
    );

    if (domainCount >= 2) {
      reasons.push(
        `Evidence spans ${domainCount} domains.`
      );
    }

    return {
      regime: "ACTIVATION_LIKE",
      confidence: 90,
      reasons,
    };
  }

  if (
    anomalyScore !== null &&
    anomalyScore >= 80 &&
    highDrivers.length >= 2
  ) {
    reasons.push(
      `Historical anomaly score is ${round(anomalyScore, 1)}.`
    );

    reasons.push(
      `${highDrivers.length} high-percentile historical drivers are active.`
    );

    return {
      regime: "ELEVATED",
      confidence: 80,
      reasons,
    };
  }

  if (
    risingDrivers.length >= 2 ||
    (
      currentActivity > 0 &&
      recentActivity > previousActivity * 1.25 &&
      previousActivity > 0
    )
  ) {
    reasons.push(
      "Recent activity is rising relative to the preceding baseline."
    );

    if (risingDrivers.length) {
      reasons.push(
        `${risingDrivers.length} historical drivers are rising.`
      );
    }

    return {
      regime: "BUILDING",
      confidence: 70,
      reasons,
    };
  }

  if (
    previousActivity > 0 &&
    recentActivity < previousActivity * 0.75 &&
    currentActivity <= recentActivity
  ) {
    reasons.push(
      "Recent activity has materially declined from the preceding baseline."
    );

    return {
      regime: "COOLING",
      confidence: 65,
      reasons,
    };
  }

  if (
    currentActivity === 0 &&
    domainCount === 0 &&
    highConfidenceEvidence === 0 &&
    drivers.length === 0
  ) {
    reasons.push(
      "Current exact sweep has no meaningful activation, evidence, or historical-driver activity."
    );

    return {
      regime: "QUIET",
      confidence: 85,
      reasons,
    };
  }

  reasons.push(
    "Observed activity does not satisfy a stronger regime definition."
  );

  return {
    regime: "QUIET",
    confidence: 60,
    reasons,
  };
}

async function main() {
  await fs.ensureDir(PUBLIC_DATA);

  const [archive, trend] = await Promise.all([
    readJson(ARCHIVE_FILE, { entries: [] }),
    readJson(TREND_FILE, {}),
  ]);

  const entries = arr(archive?.entries)
    .filter((entry) => entry?.generatedAt)
    .sort(
      (a, b) =>
        new Date(a.generatedAt) -
        new Date(b.generatedAt)
    );

  const current = entries.at(-1) || null;

  const priorEntries = current
    ? entries.slice(0, -1)
    : [];

  const recentEntries =
    priorEntries.slice(-6);

  const previousEntries =
    priorEntries.slice(-12, -6);

  const historyStage =
    trend?.history?.stage || "LEARNING";

  const candidate = classifyCandidate({
    current,
    recentEntries,
    previousEntries,
    trend,
  });

  const isHistoryUsable =
    historyStage === "PRELIMINARY" ||
    historyStage === "USABLE" ||
    historyStage === "STRONG";

  const regime = isHistoryUsable
    ? candidate.regime
    : "LEARNING";

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
        n(trend?.history?.exactSweepCount) ||
        entries.length,
      usableForRegimeClassification:
        isHistoryUsable,
    },

    current: {
      snapshotId:
        current?.snapshotId || null,
      generatedAt:
        current?.generatedAt || null,
      decisionState:
        current?.states?.decision || null,
      activityScore:
        activityScore(current),
    },

    baseline: {
      recentSixSweepAverageActivity:
        round(
          average(
            recentEntries.map(activityScore)
          )
        ),
      previousSixSweepAverageActivity:
        round(
          average(
            previousEntries.map(activityScore)
          )
        ),
    },

    trendContext: {
      status:
        trend?.status || null,
      anomalyScore:
        trend?.anomalyScore ?? null,
      driverCount:
        arr(trend?.drivers).length,
      drivers:
        arr(trend?.drivers),
    },

    reasons:
      candidate.reasons,

    methodology:
      "Score-neutral regime classification derived from exact sweep history and Historical Trend Intelligence. Stronger regimes require corroborating historical or multi-domain evidence.",

    caution:
      "Regime Detection is descriptive only. It does not modify Radar scoring, establish launch probability, predict rewards, or constitute trading advice.",
  };

  await fs.writeJson(
    OUTPUT_FILE,
    output,
    { spaces: 2 }
  );

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