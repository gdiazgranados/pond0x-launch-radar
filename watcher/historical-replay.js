"use strict";

const fs = require("fs-extra");
const path = require("path");
const { buildDecision, DEFAULT_THRESHOLDS, clamp100 } = require("./lib/activation-decision-engine");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const HISTORY_FILE = path.join(PUBLIC_DATA, "history.json");
const ARCHIVE_FILE = path.join(PUBLIC_DATA, "historical-evidence-archive.json");
const REPLAY_FILE = path.join(PUBLIC_DATA, "historical-replay.json");
const CALIBRATION_FILE = path.join(PUBLIC_DATA, "calibration-report.json");
const GROUND_TRUTH_SOURCE = path.join(__dirname, "ground-truth-events.json");
const GROUND_TRUTH_OUTPUT = path.join(PUBLIC_DATA, "ground-truth-events.json");
const MAX_REPLAY = 500;
const LOOKBACK_MINUTES = 24 * 60;
const POST_EVENT_GRACE_MINUTES = 60;

const PROFILES = {
  SENSITIVE: {
    criticalActivation: 60,
    criticalCorrelation: 55,
    criticalConfidence: 78,
    criticalDomains: 3,
    highCorrelation: 45,
    highConfidence: 72,
    highDomains: 2,
    runtimeConfidence: 65,
    structuralSemantic: 25,
    strongSemantic: 50,
  },
  DEFAULT: DEFAULT_THRESHOLDS,
  CONSERVATIVE: {
    criticalActivation: 80,
    criticalCorrelation: 75,
    criticalConfidence: 92,
    criticalDomains: 5,
    highCorrelation: 65,
    highConfidence: 88,
    highDomains: 4,
    runtimeConfidence: 80,
    structuralSemantic: 45,
    strongSemantic: 70,
  },
};

async function readJson(file, fallback) {
  try { return await fs.readJson(file); } catch { return fallback; }
}
function arr(v) { return Array.isArray(v) ? v : []; }
function bool(v) { return v === true; }
function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}
function minutesBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

function reconstructEvidence(item) {
  const feature = item?.featureActivationEvidence || {};
  const correlation = item?.evidenceCorrelation || {};
  const semantic = clamp100(feature?.semanticChange?.score);
  const correlationScore = clamp100(correlation?.score);
  const events = [];
  const domains = new Set();

  for (const flag of arr(feature?.unlockedFlags)) {
    events.push({ type: "FLAG_UNLOCKED", domain: "featureFlag", subject: flag?.name || flag?.flag || String(flag), seenAt: item.generatedAt });
    domains.add("featureFlag");
  }
  for (const route of arr(feature?.activatedRoutes)) {
    const name = route?.route || route?.path || String(route);
    const api = String(name).startsWith("/api");
    events.push({ type: api ? "API_DORMANT_TO_LIVE" : "ROUTE_DORMANT_TO_LIVE", domain: api ? "api" : "route", subject: name, seenAt: item.generatedAt, status: route?.status ?? null });
    domains.add(api ? "api" : "route");
  }
  if (bool(correlation?.externalClaimTransfer)) {
    events.push({ type: "DISTRIBUTOR_TRANSFER", domain: "distributor", subject: null, seenAt: item.generatedAt });
    domains.add("distributor");
  }
  if (bool(correlation?.newRecipient)) {
    events.push({ type: "NEW_RECIPIENT", domain: "recipients", subject: null, seenAt: item.generatedAt });
    domains.add("recipients");
  }
  if (bool(correlation?.onchainMovement) || bool(correlation?.fundingActive) || bool(correlation?.rewardActivity)) {
    events.push({ type: "ONCHAIN_ACTIVITY", domain: "onchain", subject: null, seenAt: item.generatedAt });
    domains.add("onchain");
  }
  if (semantic >= 35 || bool(correlation?.semanticMaterial)) {
    events.push({ type: "SEMANTIC_MATERIAL_CHANGE", domain: "semantic", subject: "historical-surface", seenAt: item.generatedAt });
    domains.add("semantic");
  }

  const strengths = events.map((event) => {
    const score = event.type === "DISTRIBUTOR_TRANSFER" ? 97 : event.type === "NEW_RECIPIENT" ? 95 : event.type === "ONCHAIN_ACTIVITY" ? 94 : event.type === "FLAG_UNLOCKED" ? 88 : event.type === "API_DORMANT_TO_LIVE" ? 86 : event.type === "ROUTE_DORMANT_TO_LIVE" ? 78 : 58;
    return { ...event, confidence: score };
  }).sort((a, b) => b.confidence - a.confidence);

  const weights = [0.38, 0.25, 0.17, 0.12, 0.08];
  const top = strengths.slice(0, 5);
  const weightUsed = top.reduce((sum, _, i) => sum + weights[i], 0);
  let confidence = weightUsed ? top.reduce((sum, e, i) => sum + e.confidence * weights[i], 0) / weightUsed : 0;
  confidence += Math.min(6, Math.max(0, domains.size - 1) * 1.5);
  confidence = clamp100(Math.round(confidence));

  const eventWeights = { FLAG_UNLOCKED: 22, API_DORMANT_TO_LIVE: 22, ROUTE_DORMANT_TO_LIVE: 18, DISTRIBUTOR_TRANSFER: 20, NEW_RECIPIENT: 16, SEMANTIC_MATERIAL_CHANGE: 14, ONCHAIN_ACTIVITY: 12 };
  const activation = clamp100(events.reduce((sum, e) => sum + (eventWeights[e.type] || 0), 0));

  return {
    semantic,
    correlation: correlationScore,
    confidence,
    activation,
    timeline: {
      snapshotId: item?.snapshotId || null,
      recent: { events, domains: [...domains], domainCount: domains.size },
      evidenceConfidence: { score: confidence, highConfidenceCount: strengths.filter((e) => e.confidence >= 85).length, strongestEvidence: strengths.slice(0, 8) },
    },
    replayQuality: events.length ? "RECONSTRUCTED_FROM_RECORDED_EVIDENCE" : "RECORDED_QUIET_OR_INCOMPLETE",
  };
}

function exactEvidenceFromArchive(entry) {
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
    replayQuality: "EXACT_SWEEP_ARCHIVE",
  };
}

function distribution(rows) {
  return rows.reduce((acc, row) => { acc[row.state] = (acc[row.state] || 0) + 1; return acc; }, {});
}

function replayRow(item, profileName, thresholds, evidence) {
  const latestLike = { snapshotId: item?.snapshotId || null };
  const decision = buildDecision({
    semantic: evidence.semantic,
    correlation: evidence.correlation,
    confidence: evidence.confidence,
    activation: evidence.activation,
    timeline: evidence.timeline,
    latest: latestLike,
    thresholds,
  });

  return {
    generatedAt: item?.generatedAt || null,
    snapshotId: item?.snapshotId || null,
    state: decision.state,
    severity: decision.severity,
    decisionStrength: decision.decisionStrength,
    scores: decision.scores,
    gates: decision.gates,
    replayQuality: evidence.replayQuality,
    profile: profileName,
  };
}

function replayProfile(historyItems, archiveEntries, profileName, thresholds) {
  const exactSnapshotIds = new Set(arr(archiveEntries).map((entry) => entry?.snapshotId).filter(Boolean));
  const compatibilityRows = arr(historyItems)
    .filter((item) => !item?.snapshotId || !exactSnapshotIds.has(item.snapshotId))
    .map((item) => replayRow(item, profileName, thresholds, reconstructEvidence(item)));

  const exactRows = arr(archiveEntries).map((entry) =>
    replayRow(entry, profileName, thresholds, exactEvidenceFromArchive(entry))
  );

  return [...compatibilityRows, ...exactRows]
    .filter((row) => row.generatedAt)
    .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt))
    .slice(-MAX_REPLAY);
}

function evaluateGroundTruth(rows, groundTruthEvents) {
  const truth = arr(groundTruthEvents).filter((event) => event?.occurredAt);
  const signals = rows.filter((row) => row.state !== "QUIET" && row.generatedAt);
  const eventResults = truth.map((event) => {
    const candidates = signals
      .map((row) => ({ row, leadMinutes: minutesBetween(row.generatedAt, event.occurredAt) }))
      .filter(({ leadMinutes }) => leadMinutes >= -POST_EVENT_GRACE_MINUTES && leadMinutes <= LOOKBACK_MINUTES)
      .sort((a, b) => Math.abs(a.leadMinutes) - Math.abs(b.leadMinutes));
    const match = candidates[0] || null;
    return {
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      detected: Boolean(match),
      matchedSnapshotId: match?.row?.snapshotId || null,
      matchedState: match?.row?.state || null,
      matchedReplayQuality: match?.row?.replayQuality || null,
      leadMinutes: match ? Math.round(match.leadMinutes * 100) / 100 : null,
    };
  });

  const matchedSignalIds = new Set();
  for (const signal of signals) {
    const matched = truth.some((event) => {
      const lead = minutesBetween(signal.generatedAt, event.occurredAt);
      return lead >= -POST_EVENT_GRACE_MINUTES && lead <= LOOKBACK_MINUTES;
    });
    if (matched) matchedSignalIds.add(signal.snapshotId || signal.generatedAt);
  }

  const truePositiveSignals = matchedSignalIds.size;
  const falsePositiveSignals = Math.max(0, signals.length - truePositiveSignals);
  const detectedEvents = eventResults.filter((event) => event.detected).length;
  const leadTimes = eventResults.map((event) => event.leadMinutes).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const medianLeadMinutes = leadTimes.length
    ? leadTimes.length % 2
      ? leadTimes[Math.floor(leadTimes.length / 2)]
      : Math.round(((leadTimes[leadTimes.length / 2 - 1] + leadTimes[leadTimes.length / 2]) / 2) * 100) / 100
    : null;

  return {
    eventCount: truth.length,
    signalCount: signals.length,
    detectedEvents,
    missedEvents: Math.max(0, truth.length - detectedEvents),
    truePositiveSignals,
    falsePositiveSignals,
    precision: pct(truePositiveSignals, signals.length),
    recall: pct(detectedEvents, truth.length),
    missRate: pct(Math.max(0, truth.length - detectedEvents), truth.length),
    falsePositiveRate: pct(falsePositiveSignals, rows.length),
    medianLeadMinutes,
    lookbackMinutes: LOOKBACK_MINUTES,
    postEventGraceMinutes: POST_EVENT_GRACE_MINUTES,
    eventResults,
  };
}

async function main() {
  const history = arr(await readJson(HISTORY_FILE, []))
    .filter((item) => item?.generatedAt)
    .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt))
    .slice(-MAX_REPLAY);
  const archive = await readJson(ARCHIVE_FILE, { entries: [] });
  const archiveEntries = arr(archive?.entries)
    .filter((entry) => entry?.generatedAt)
    .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt))
    .slice(-MAX_REPLAY);
  const groundTruthRegistry = await readJson(GROUND_TRUTH_SOURCE, { version: 1, events: [] });
  const groundTruthEvents = arr(groundTruthRegistry?.events);

  const profiles = {};
  for (const [name, thresholds] of Object.entries(PROFILES)) {
    const rows = replayProfile(history, archiveEntries, name, thresholds);
    profiles[name] = {
      thresholds,
      distribution: distribution(rows),
      nonQuietCount: rows.filter((r) => r.state !== "QUIET").length,
      runtimeOrHigherCount: rows.filter((r) => ["RUNTIME_ACTIVATION", "HIGH_CONFIDENCE_CONVERGENCE", "CRITICAL_ACTIVATION_CANDIDATE"].includes(r.state)).length,
      exactSweepCount: rows.filter((r) => r.replayQuality === "EXACT_SWEEP_ARCHIVE").length,
      reconstructedEvidenceCount: rows.filter((r) => r.replayQuality === "RECONSTRUCTED_FROM_RECORDED_EVIDENCE").length,
      usableEvidenceCount: rows.filter((r) => ["EXACT_SWEEP_ARCHIVE", "RECONSTRUCTED_FROM_RECORDED_EVIDENCE"].includes(r.replayQuality)).length,
      groundTruthMetrics: evaluateGroundTruth(rows, groundTruthEvents),
      rows,
    };
  }

  const defaultRows = profiles.DEFAULT.rows;
  const replay = {
    version: 3,
    generatedAt: new Date().toISOString(),
    sampleCount: defaultRows.length,
    historySampleCount: history.length,
    exactArchiveEntryCount: archiveEntries.length,
    firstObservedAt: defaultRows[0]?.generatedAt || null,
    lastObservedAt: defaultRows.at(-1)?.generatedAt || null,
    defaultProfile: "DEFAULT",
    rows: defaultRows,
    summary: {
      distribution: profiles.DEFAULT.distribution,
      nonQuietCount: profiles.DEFAULT.nonQuietCount,
      runtimeOrHigherCount: profiles.DEFAULT.runtimeOrHigherCount,
      exactSweepCount: profiles.DEFAULT.exactSweepCount,
      reconstructedEvidenceCount: profiles.DEFAULT.reconstructedEvidenceCount,
      usableEvidenceCount: profiles.DEFAULT.usableEvidenceCount,
      maxDecisionStrength: defaultRows.reduce((m, r) => Math.max(m, r.decisionStrength || 0), 0),
    },
    groundTruth: {
      registryVersion: groundTruthRegistry?.version || 1,
      eventCount: groundTruthEvents.length,
      eventTypes: [...new Set(groundTruthEvents.map((event) => event.type).filter(Boolean))],
      defaultMetrics: profiles.DEFAULT.groundTruthMetrics,
    },
    coverage: {
      mode: "HYBRID_EXACT_AND_COMPATIBILITY_REPLAY",
      exactHistoricalTimelineAvailable: archiveEntries.length > 0,
      exactSweepCount: profiles.DEFAULT.exactSweepCount,
      note: "New sweeps use exact archived decision evidence. Older periods fall back to compatibility reconstruction from history.json. Ground-truth metrics remain coverage-sensitive for events that predate the exact archive.",
    },
  };

  const enoughGroundTruth = groundTruthEvents.length >= 3;
  const enoughReplayEvidence = profiles.DEFAULT.usableEvidenceCount >= 12;
  const calibration = {
    version: 3,
    generatedAt: replay.generatedAt,
    sampleCount: defaultRows.length,
    groundTruthEventCount: groundTruthEvents.length,
    exactSweepCount: profiles.DEFAULT.exactSweepCount,
    profiles: Object.fromEntries(Object.entries(profiles).map(([name, value]) => [name, {
      thresholds: value.thresholds,
      distribution: value.distribution,
      nonQuietCount: value.nonQuietCount,
      runtimeOrHigherCount: value.runtimeOrHigherCount,
      exactSweepCount: value.exactSweepCount,
      reconstructedEvidenceCount: value.reconstructedEvidenceCount,
      usableEvidenceCount: value.usableEvidenceCount,
      groundTruthMetrics: value.groundTruthMetrics,
    }])),
    comparison: {
      sensitiveVsDefaultExtraSignals: profiles.SENSITIVE.nonQuietCount - profiles.DEFAULT.nonQuietCount,
      defaultVsConservativeExtraSignals: profiles.DEFAULT.nonQuietCount - profiles.CONSERVATIVE.nonQuietCount,
      sensitiveRecallDelta: profiles.SENSITIVE.groundTruthMetrics.recall == null || profiles.DEFAULT.groundTruthMetrics.recall == null ? null : Math.round((profiles.SENSITIVE.groundTruthMetrics.recall - profiles.DEFAULT.groundTruthMetrics.recall) * 100) / 100,
      conservativeRecallDelta: profiles.CONSERVATIVE.groundTruthMetrics.recall == null || profiles.DEFAULT.groundTruthMetrics.recall == null ? null : Math.round((profiles.CONSERVATIVE.groundTruthMetrics.recall - profiles.DEFAULT.groundTruthMetrics.recall) * 100) / 100,
    },
    recommendation: !enoughGroundTruth
      ? "COLLECT_MORE_GROUND_TRUTH"
      : !enoughReplayEvidence
        ? "ACCUMULATE_EXACT_SWEEP_EVIDENCE"
        : "KEEP_DEFAULT_PENDING_MORE_LABELED_EVENTS",
    groundTruth: {
      available: groundTruthEvents.length > 0,
      scope: "CONFIRMED_EXTERNAL_DISTRIBUTOR_TRANSFERS_ONLY",
      eventCount: groundTruthEvents.length,
      defaultMetrics: profiles.DEFAULT.groundTruthMetrics,
      note: "These metrics evaluate whether replayed decision states appeared near confirmed external distributor transfers. They do not measure launch prediction accuracy or reward eligibility.",
    },
    archive: {
      available: archiveEntries.length > 0,
      entryCount: archiveEntries.length,
      firstObservedAt: archiveEntries[0]?.generatedAt || null,
      lastObservedAt: archiveEntries.at(-1)?.generatedAt || null,
      note: "Exact sweep evidence will gradually replace compatibility reconstruction as the archive grows.",
    },
    caution: "Calibration v3 combines exact registered on-chain outcomes, exact sweep evidence, and compatibility replay for older periods. Precision/recall remain coverage-sensitive for events predating the archive.",
  };

  await fs.ensureDir(PUBLIC_DATA);
  await fs.writeJson(REPLAY_FILE, replay, { spaces: 2 });
  await fs.writeJson(CALIBRATION_FILE, calibration, { spaces: 2 });
  await fs.writeJson(GROUND_TRUTH_OUTPUT, groundTruthRegistry, { spaces: 2 });
  console.log(`Historical Replay v3 | samples=${defaultRows.length} exact=${profiles.DEFAULT.exactSweepCount} usable=${profiles.DEFAULT.usableEvidenceCount} truth=${groundTruthEvents.length} defaultRecall=${profiles.DEFAULT.groundTruthMetrics.recall}`);
}

main().catch((error) => {
  console.error("historical-replay failed:", error);
  process.exit(1);
});
