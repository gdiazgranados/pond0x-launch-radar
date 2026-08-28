"use strict";

const fs = require("fs-extra");
const path = require("path");
const { buildDecision, DEFAULT_THRESHOLDS, clamp100 } = require("./lib/activation-decision-engine");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const ARCHIVE_FILE = path.join(PUBLIC_DATA, "historical-evidence-archive.json");
const GROUND_TRUTH_SOURCE = path.join(PUBLIC_DATA, "ground-truth-events.json");
const GROUND_TRUTH_FALLBACK = path.join(__dirname, "ground-truth-events.json");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "threshold-drift-report.json");
const LOOKBACK_MINUTES = 24 * 60;
const POST_EVENT_GRACE_MINUTES = 60;
const MIN_EXACT_SWEEPS_FOR_TUNING = 72;
const MIN_COVERED_EVENTS_FOR_TUNING = 3;

const PROFILES = {
  SENSITIVE: { criticalActivation: 60, criticalCorrelation: 55, criticalConfidence: 78, criticalDomains: 3, highCorrelation: 45, highConfidence: 72, highDomains: 2, runtimeConfidence: 65, structuralSemantic: 25, strongSemantic: 50 },
  DEFAULT: DEFAULT_THRESHOLDS,
  CONSERVATIVE: { criticalActivation: 80, criticalCorrelation: 75, criticalConfidence: 92, criticalDomains: 5, highCorrelation: 65, highConfidence: 88, highDomains: 4, runtimeConfidence: 80, structuralSemantic: 45, strongSemantic: 70 },
};

async function readJson(file, fallback) {
  try { return await fs.readJson(file); } catch { return fallback; }
}
function arr(v) { return Array.isArray(v) ? v : []; }
function pct(a, b) { return b ? Math.round((a / b) * 10000) / 100 : null; }
function minutesBetween(a, b) { return (new Date(b).getTime() - new Date(a).getTime()) / 60000; }

function exactEvidence(entry) {
  return {
    semantic: clamp100(entry?.scores?.semantic),
    correlation: clamp100(entry?.scores?.correlation),
    confidence: clamp100(entry?.scores?.evidenceConfidence),
    activation: clamp100(entry?.scores?.activationTimeline),
    timeline: {
      snapshotId: entry?.snapshotId || null,
      recent: {
        events: arr(entry?.evidence?.recentEvents),
        domains: arr(entry?.evidence?.recentDomains),
        domainCount: Number(entry?.gates?.domainCount || arr(entry?.evidence?.recentDomains).length || 0),
      },
      evidenceConfidence: {
        score: clamp100(entry?.scores?.evidenceConfidence),
        highConfidenceCount: Number(entry?.gates?.highConfidenceEvidence || 0),
        strongestEvidence: arr(entry?.evidence?.strongestEvidence),
      },
    },
  };
}

function replayExact(entries, profileName, thresholds) {
  return entries.map((entry) => {
    const evidence = exactEvidence(entry);
    const decision = buildDecision({
      semantic: evidence.semantic,
      correlation: evidence.correlation,
      confidence: evidence.confidence,
      activation: evidence.activation,
      timeline: evidence.timeline,
      latest: { snapshotId: entry?.snapshotId || null },
      thresholds,
    });
    return {
      generatedAt: entry.generatedAt,
      snapshotId: entry.snapshotId || null,
      profile: profileName,
      state: decision.state,
      decisionStrength: decision.decisionStrength,
      scores: decision.scores,
    };
  });
}

function evaluate(rows, truth) {
  const signals = rows.filter((row) => row.state !== "QUIET");
  const coveredEvents = truth.filter((event) => rows.some((row) => {
    const lead = minutesBetween(row.generatedAt, event.occurredAt);
    return lead >= -POST_EVENT_GRACE_MINUTES && lead <= LOOKBACK_MINUTES;
  }));
  const eventResults = coveredEvents.map((event) => {
    const matches = signals.map((row) => ({ row, lead: minutesBetween(row.generatedAt, event.occurredAt) }))
      .filter((x) => x.lead >= -POST_EVENT_GRACE_MINUTES && x.lead <= LOOKBACK_MINUTES)
      .sort((a, b) => Math.abs(a.lead) - Math.abs(b.lead));
    return { id: event.id, occurredAt: event.occurredAt, detected: matches.length > 0, leadMinutes: matches[0] ? Math.round(matches[0].lead * 100) / 100 : null };
  });
  const detected = eventResults.filter((x) => x.detected).length;
  const matchedSignals = signals.filter((signal) => coveredEvents.some((event) => {
    const lead = minutesBetween(signal.generatedAt, event.occurredAt);
    return lead >= -POST_EVENT_GRACE_MINUTES && lead <= LOOKBACK_MINUTES;
  }));
  const falseSignals = signals.length - matchedSignals.length;
  const positiveLeads = eventResults.map((x) => x.leadMinutes).filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const medianLeadMinutes = positiveLeads.length ? positiveLeads[Math.floor(positiveLeads.length / 2)] : null;
  return {
    exactSweepCount: rows.length,
    coveredGroundTruthEvents: coveredEvents.length,
    signalCount: signals.length,
    detectedCoveredEvents: detected,
    falseSignalCount: falseSignals,
    precision: pct(matchedSignals.length, signals.length),
    recall: pct(detected, coveredEvents.length),
    falseSignalRate: pct(falseSignals, rows.length),
    medianLeadMinutes,
    eventResults,
  };
}

function thresholdDelta(profile) {
  const out = {};
  for (const key of Object.keys(DEFAULT_THRESHOLDS)) out[key] = Number(profile[key] || 0) - Number(DEFAULT_THRESHOLDS[key] || 0);
  return out;
}

async function main() {
  const archive = await readJson(ARCHIVE_FILE, { entries: [] });
  const entries = arr(archive?.entries).filter((e) => e?.generatedAt && e?.provenance?.mode === "EXACT_SWEEP_ARCHIVE")
    .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));
  const fallbackRegistry = await readJson(GROUND_TRUTH_FALLBACK, { events: [] });
  const registry = await readJson(GROUND_TRUTH_SOURCE, fallbackRegistry);
  const truth = arr(registry?.events).filter((e) => e?.occurredAt);

  const profiles = {};
  for (const [name, thresholds] of Object.entries(PROFILES)) {
    const rows = replayExact(entries, name, thresholds);
    profiles[name] = { thresholds, deltaFromDefault: thresholdDelta(thresholds), metrics: evaluate(rows, truth) };
  }

  const defaultMetrics = profiles.DEFAULT.metrics;
  const enoughSweeps = entries.length >= MIN_EXACT_SWEEPS_FOR_TUNING;
  const enoughCoveredEvents = defaultMetrics.coveredGroundTruthEvents >= MIN_COVERED_EVENTS_FOR_TUNING;
  let recommendation = "ACCUMULATE_EXACT_SWEEPS";
  if (enoughSweeps && !enoughCoveredEvents) recommendation = "COLLECT_NEW_GROUND_TRUTH_WITHIN_EXACT_ARCHIVE";
  if (enoughSweeps && enoughCoveredEvents) recommendation = "REVIEW_PROFILE_PERFORMANCE_BEFORE_THRESHOLD_CHANGES";

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: "EXACT_SWEEPS_ONLY",
    groundTruthSource: registry?.autoLabeling?.enabled ? "AUTO_LABELED_RUNTIME_REGISTRY" : "STATIC_FALLBACK_REGISTRY",
    automaticThresholdChanges: false,
    exactSweepCount: entries.length,
    exactCoverage: { firstObservedAt: entries[0]?.generatedAt || null, lastObservedAt: entries.at(-1)?.generatedAt || null },
    groundTruth: { registryEventCount: truth.length, coveredByExactArchive: defaultMetrics.coveredGroundTruthEvents },
    readiness: {
      minExactSweepsForTuning: MIN_EXACT_SWEEPS_FOR_TUNING,
      minCoveredEventsForTuning: MIN_COVERED_EVENTS_FOR_TUNING,
      enoughExactSweeps: enoughSweeps,
      enoughCoveredEvents,
      readyForThresholdReview: enoughSweeps && enoughCoveredEvents,
    },
    profiles,
    comparison: {
      sensitiveExtraSignalsVsDefault: profiles.SENSITIVE.metrics.signalCount - defaultMetrics.signalCount,
      conservativeSignalReductionVsDefault: defaultMetrics.signalCount - profiles.CONSERVATIVE.metrics.signalCount,
      sensitiveRecallDelta: profiles.SENSITIVE.metrics.recall == null || defaultMetrics.recall == null ? null : Math.round((profiles.SENSITIVE.metrics.recall - defaultMetrics.recall) * 100) / 100,
      conservativeRecallDelta: profiles.CONSERVATIVE.metrics.recall == null || defaultMetrics.recall == null ? null : Math.round((profiles.CONSERVATIVE.metrics.recall - defaultMetrics.recall) * 100) / 100,
    },
    recommendation,
    interpretation: "This report compares threshold profiles using only exact archived sweeps and the runtime auto-labeled ground-truth registry when available. It never changes live thresholds automatically. Old compatibility-replay rows are excluded from learning metrics.",
    caution: "Performance metrics are meaningful only for ground-truth events covered by the exact archive window. Absence of covered events is not evidence that a profile is accurate or inaccurate."
  };

  await fs.ensureDir(PUBLIC_DATA);
  await fs.writeJson(OUTPUT_FILE, report, { spaces: 2 });
  console.log(`Calibration Learning v1 | exact=${entries.length} coveredTruth=${defaultMetrics.coveredGroundTruthEvents} source=${report.groundTruthSource} recommendation=${recommendation}`);
}

main().catch((error) => {
  console.error("calibration-learning failed:", error);
  process.exit(1);
});
