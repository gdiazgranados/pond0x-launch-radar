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

const OUTPUT_FILE = path.join(
  PUBLIC_DATA,
  "historical-trend-intelligence.json"
);

const MIN_PRELIMINARY_SWEEPS = 24;
const MIN_USABLE_SWEEPS = 72;
const MIN_STRONG_SWEEPS = 168;

function percentileRank(values, current) {
  const clean = values.map(n);

  if (!clean.length) return null;

  const currentValue = n(current);

  const below = clean.filter(
    (value) => value < currentValue
  ).length;

  const equal = clean.filter(
    (value) => value === currentValue
  ).length;

  const rank =
    below + equal * 0.5;

  return round((rank / clean.length) * 100, 1);
}

function classifyPercentile(percentile) {
  if (percentile === null) return "UNKNOWN";
  if (percentile >= 95) return "EXTREME";
  if (percentile >= 85) return "HIGH";
  if (percentile >= 65) return "ELEVATED";
  if (percentile >= 35) return "NORMAL";
  return "LOW";
}

function trendDirection(recent, previous) {
  if (!previous.length || !recent.length) {
    return "INSUFFICIENT_DATA";
  }

  const recentAverage = average(recent);
  const previousAverage = average(previous);

  if (recentAverage === 0 && previousAverage === 0) {
    return "FLAT";
  }

  const baseline = Math.max(Math.abs(previousAverage), 1);
  const deltaPct =
    ((recentAverage - previousAverage) / baseline) * 100;

  if (deltaPct >= 25) return "RISING";
  if (deltaPct <= -25) return "FALLING";
  return "FLAT";
}

function metricDefinition(name, selector) {
  return { name, selector };
}

const METRICS = [
  metricDefinition(
    "radar",
    (entry) => entry?.scores?.radar
  ),
  metricDefinition(
    "semantic",
    (entry) => entry?.scores?.semantic
  ),
  metricDefinition(
    "correlation",
    (entry) => entry?.scores?.correlation
  ),
  metricDefinition(
    "evidenceConfidence",
    (entry) => entry?.scores?.evidenceConfidence
  ),
  metricDefinition(
    "activationTimeline",
    (entry) => entry?.scores?.activationTimeline
  ),
  metricDefinition(
    "decisionStrength",
    (entry) => entry?.scores?.decisionStrength
  ),
  metricDefinition(
    "domainCount",
    (entry) => entry?.gates?.domainCount
  ),
  metricDefinition(
    "highConfidenceEvidence",
    (entry) => entry?.gates?.highConfidenceEvidence
  ),
  metricDefinition(
    "newExternalTransfers",
    (entry) => entry?.onchain?.newExternalTransfers
  ),
  metricDefinition(
    "newExternalRecipients",
    (entry) => entry?.onchain?.newExternalRecipients
  ),
  metricDefinition(
    "dormantToLive",
    (entry) => arr(entry?.surfaces?.dormantToLive).length
  ),
  metricDefinition(
    "freshDiscoveries",
    (entry) => arr(entry?.surfaces?.freshDiscoveries).length
  ),
];

function historyStage(count) {
  if (count < MIN_PRELIMINARY_SWEEPS) {
    return "LEARNING";
  }

  if (count < MIN_USABLE_SWEEPS) {
    return "PRELIMINARY";
  }

  if (count < MIN_STRONG_SWEEPS) {
    return "USABLE";
  }

  return "STRONG";
}

function buildMetric(metric, current, history) {
  const currentValue = n(metric.selector(current));

  const historicalValues = history.map(
    (entry) => n(metric.selector(entry))
  );

  const percentile = percentileRank(
    historicalValues,
    currentValue
  );

  const recentValues = historicalValues.slice(-6);
  const previousValues = historicalValues.slice(-12, -6);

  return {
    current: currentValue,
    historicalAverage: round(average(historicalValues)),
    historicalMax: historicalValues.length
      ? Math.max(...historicalValues)
      : 0,
    percentile,
    percentileClass: classifyPercentile(percentile),
    shortTrend: trendDirection(
      recentValues,
      previousValues
    ),
  };
}

function buildDrivers(metrics) {
  return Object.entries(metrics)
    .filter(([, metric]) => {
      return (
        metric.percentile !== null &&
        metric.percentile >= 85 &&
        metric.current > 0
      );
    })
    .sort(
      (a, b) =>
        n(b[1].percentile) - n(a[1].percentile)
    )
    .slice(0, 5)
    .map(([name, metric]) => ({
      metric: name,
      value: metric.current,
      percentile: metric.percentile,
      trend: metric.shortTrend,
    }));
}

function buildAnomalyScore(metrics) {
  const meaningful = Object.values(metrics)
    .filter(
      (metric) =>
        metric.percentile !== null &&
        metric.current > 0
    )
    .map((metric) => metric.percentile);

  if (!meaningful.length) return 0;

  return round(average(meaningful), 1);
}

async function main() {
  await fs.ensureDir(PUBLIC_DATA);

  const archive = await readJsonRequired(
    ARCHIVE_FILE
  );

  const entries = arr(archive?.entries)
    .filter((entry) => entry?.generatedAt)
    .sort(
      (a, b) =>
        new Date(a.generatedAt) -
        new Date(b.generatedAt)
    );

  const current = entries.at(-1) || null;
  const history = current
    ? entries.slice(0, -1)
    : [];

  const stage = historyStage(entries.length);

  const metrics = {};

  if (current) {
    for (const metric of METRICS) {
      metrics[metric.name] = buildMetric(
        metric,
        current,
        history
      );
    }
  }

  const drivers = buildDrivers(metrics);
  const anomalyScore = buildAnomalyScore(metrics);

  let status = "INSUFFICIENT_HISTORY";

  if (stage === "PRELIMINARY") {
    status = "PRELIMINARY_BASELINE";
  }

  if (stage === "USABLE" || stage === "STRONG") {
    if (anomalyScore >= 90) status = "EXTREME";
    else if (anomalyScore >= 80) status = "ELEVATED";
    else status = "NORMAL";
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),

    history: {
      stage,
      exactSweepCount: entries.length,
      baselineSweepCount: history.length,
      thresholds: {
        preliminary: MIN_PRELIMINARY_SWEEPS,
        usable: MIN_USABLE_SWEEPS,
        strong: MIN_STRONG_SWEEPS,
      },
    },

    current: {
      snapshotId: current?.snapshotId || null,
      generatedAt: current?.generatedAt || null,
      decisionState: current?.states?.decision || null,
    },

    status,
    anomalyScore:
      stage === "LEARNING" ? null : anomalyScore,

    metrics,
    drivers,

    methodology:
      "Score-neutral historical comparison of the latest exact sweep against prior exact sweeps. Percentiles and short trends are descriptive only and do not modify Radar scoring.",

    caution:
      "Historical Trend Intelligence must not be interpreted as launch probability, reward probability, causal evidence, or trading advice. Low sample counts remain explicitly classified as learning or preliminary.",
  };

  await fs.writeJson(
    OUTPUT_FILE,
    output,
    { spaces: 2 }
  );

  console.log(
    `Historical Trend Intelligence v1 | stage=${stage} sweeps=${entries.length} status=${status} anomaly=${output.anomalyScore ?? "n/a"} drivers=${drivers.length}`
  );
}

main().catch((error) => {
  console.error(
    "historical-trend-intelligence failed:",
    error
  );
  process.exit(1);
});