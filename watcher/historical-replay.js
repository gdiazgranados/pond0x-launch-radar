"use strict";

const fs = require("fs-extra");
const path = require("path");
const { buildDecision, DEFAULT_THRESHOLDS, clamp100 } = require("./lib/activation-decision-engine");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const HISTORY_FILE = path.join(PUBLIC_DATA, "history.json");
const REPLAY_FILE = path.join(PUBLIC_DATA, "historical-replay.json");
const CALIBRATION_FILE = path.join(PUBLIC_DATA, "calibration-report.json");
const MAX_REPLAY = 500;

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

function distribution(rows) {
  return rows.reduce((acc, row) => { acc[row.state] = (acc[row.state] || 0) + 1; return acc; }, {});
}

function replayProfile(items, profileName, thresholds) {
  return items.map((item) => {
    const r = reconstructEvidence(item);
    const decision = buildDecision({ semantic: r.semantic, correlation: r.correlation, confidence: r.confidence, activation: r.activation, timeline: r.timeline, latest: item, thresholds });
    return {
      generatedAt: item?.generatedAt || null,
      snapshotId: item?.snapshotId || null,
      state: decision.state,
      severity: decision.severity,
      decisionStrength: decision.decisionStrength,
      scores: decision.scores,
      gates: decision.gates,
      replayQuality: r.replayQuality,
      profile: profileName,
    };
  });
}

async function main() {
  const history = arr(await readJson(HISTORY_FILE, []))
    .filter((item) => item?.generatedAt)
    .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt))
    .slice(-MAX_REPLAY);

  const profiles = {};
  for (const [name, thresholds] of Object.entries(PROFILES)) {
    const rows = replayProfile(history, name, thresholds);
    profiles[name] = {
      thresholds,
      distribution: distribution(rows),
      nonQuietCount: rows.filter((r) => r.state !== "QUIET").length,
      runtimeOrHigherCount: rows.filter((r) => ["RUNTIME_ACTIVATION", "HIGH_CONFIDENCE_CONVERGENCE", "CRITICAL_ACTIVATION_CANDIDATE"].includes(r.state)).length,
      rows,
    };
  }

  const defaultRows = profiles.DEFAULT.rows;
  const replay = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sampleCount: history.length,
    firstObservedAt: history[0]?.generatedAt || null,
    lastObservedAt: history.at(-1)?.generatedAt || null,
    defaultProfile: "DEFAULT",
    rows: defaultRows,
    summary: {
      distribution: profiles.DEFAULT.distribution,
      nonQuietCount: profiles.DEFAULT.nonQuietCount,
      runtimeOrHigherCount: profiles.DEFAULT.runtimeOrHigherCount,
      maxDecisionStrength: defaultRows.reduce((m, r) => Math.max(m, r.decisionStrength || 0), 0),
    },
    coverage: {
      mode: "COMPATIBILITY_REPLAY",
      exactHistoricalTimelineAvailable: false,
      note: "Historical entries predate persistent Activation Timeline/Evidence Confidence storage. Replay reconstructs only evidence preserved in history.json; absence of reconstructed evidence is not proof it did not exist at the time.",
    },
  };

  const calibration = {
    version: 1,
    generatedAt: replay.generatedAt,
    sampleCount: history.length,
    profiles: Object.fromEntries(Object.entries(profiles).map(([name, value]) => [name, {
      thresholds: value.thresholds,
      distribution: value.distribution,
      nonQuietCount: value.nonQuietCount,
      runtimeOrHigherCount: value.runtimeOrHigherCount,
    }])),
    comparison: {
      sensitiveVsDefaultExtraSignals: profiles.SENSITIVE.nonQuietCount - profiles.DEFAULT.nonQuietCount,
      defaultVsConservativeExtraSignals: profiles.DEFAULT.nonQuietCount - profiles.CONSERVATIVE.nonQuietCount,
    },
    recommendation: history.length < 24
      ? "COLLECT_MORE_HISTORY"
      : "KEEP_DEFAULT_UNTIL_GROUND_TRUTH_LABELS",
    groundTruth: {
      available: false,
      precision: null,
      recall: null,
      falsePositiveRate: null,
      note: "Threshold sensitivity can be measured now, but precision/recall and false-positive rate require labeled historical outcomes. The engine will not invent ground truth.",
    },
    caution: "Calibration is observational sensitivity analysis, not proof that a threshold predicts a launch or reward event.",
  };

  await fs.ensureDir(PUBLIC_DATA);
  await fs.writeJson(REPLAY_FILE, replay, { spaces: 2 });
  await fs.writeJson(CALIBRATION_FILE, calibration, { spaces: 2 });
  console.log(`Historical Replay v1 | samples=${history.length} defaultNonQuiet=${profiles.DEFAULT.nonQuietCount} sensitive=${profiles.SENSITIVE.nonQuietCount} conservative=${profiles.CONSERVATIVE.nonQuietCount}`);
}

main().catch((error) => {
  console.error("historical-replay failed:", error);
  process.exit(1);
});
