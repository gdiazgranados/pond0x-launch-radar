"use strict";

const DEFAULT_THRESHOLDS = {
  criticalActivation: 70,
  criticalCorrelation: 65,
  criticalConfidence: 85,
  criticalDomains: 4,
  highCorrelation: 55,
  highConfidence: 80,
  highDomains: 3,
  runtimeConfidence: 70,
  structuralSemantic: 35,
  strongSemantic: 60,
};

function clamp100(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildDecision({ semantic, correlation, confidence, activation, timeline, latest, thresholds = {} }) {
  const t = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  semantic = clamp100(semantic);
  correlation = clamp100(correlation);
  confidence = clamp100(confidence);
  activation = clamp100(activation);

  const recentEvents = ensureArray(timeline?.recent?.events);
  const recentDomains = ensureArray(timeline?.recent?.domains);
  const activationLike = recentEvents.some((event) =>
    ["FLAG_UNLOCKED", "API_DORMANT_TO_LIVE", "ROUTE_DORMANT_TO_LIVE"].includes(event?.type)
  );
  const distributionLike = recentDomains.includes("distributor") || recentDomains.includes("recipients");
  const runtimeEvidence = recentEvents.some((event) =>
    ["API_DORMANT_TO_LIVE", "ROUTE_DORMANT_TO_LIVE", "FLAG_UNLOCKED", "FLAG_VALUE_CHANGED"].includes(event?.type)
  );
  const highConfidenceEvidence = Number(timeline?.evidenceConfidence?.highConfidenceCount || 0);
  const domainCount = Number(timeline?.recent?.domainCount || recentDomains.length || 0);
  const reasons = [];
  let state = "QUIET";
  let severity = "INFO";

  if (activationLike && distributionLike && activation >= t.criticalActivation && correlation >= t.criticalCorrelation && confidence >= t.criticalConfidence && domainCount >= t.criticalDomains) {
    state = "CRITICAL_ACTIVATION_CANDIDATE";
    severity = "CRITICAL";
    reasons.push("Activation transition, distribution evidence, strong correlation, and high-confidence evidence are converging across independent domains.");
  } else if (correlation >= t.highCorrelation && confidence >= t.highConfidence && domainCount >= t.highDomains && (activationLike || runtimeEvidence)) {
    state = "HIGH_CONFIDENCE_CONVERGENCE";
    severity = "HIGH";
    reasons.push("Multiple independent domains are converging with high-quality evidence and runtime/state activation context.");
  } else if (activationLike && confidence >= t.runtimeConfidence) {
    state = "RUNTIME_ACTIVATION";
    severity = "HIGH";
    reasons.push("A feature flag or dormant surface transitioned into an active state with sufficient evidence quality.");
  } else if (semantic >= t.structuralSemantic) {
    state = "STRUCTURAL_CHANGE";
    severity = semantic >= t.strongSemantic ? "MEDIUM" : "LOW";
    reasons.push("Material semantic or structural change exists, but runtime and cross-domain confirmation are not yet strong enough.");
  } else if (semantic > 0 || correlation > 0 || confidence > 0 || activation > 0) {
    state = "WATCH";
    severity = "LOW";
    reasons.push("Fresh evidence exists, but it does not yet satisfy runtime-activation or multi-domain convergence gates.");
  } else {
    reasons.push("No fresh activation evidence is present in the current decision window.");
  }

  if (confidence > 0 && confidence < 65) reasons.push("Evidence quality remains limited; weak sources are intentionally prevented from driving a stronger decision state.");
  if (correlation >= 50 && confidence < 70) reasons.push("Correlation is notable, but confidence is too low to promote the decision state.");
  if (confidence >= 85 && correlation < 30) reasons.push("Evidence quality is high, but it remains isolated rather than broadly corroborated.");
  if (semantic >= 60 && !runtimeEvidence) reasons.push("Semantic change is strong, but no fresh runtime/state activation transition is confirmed.");

  const decisionStrength = state === "QUIET" ? 0 : Math.round(Math.min(100, Math.max(correlation, activation) * 0.55 + confidence * 0.35 + Math.min(semantic, 60) * 0.1));

  return {
    version: 1,
    checkedAt: new Date().toISOString(),
    snapshotId: latest?.snapshotId || timeline?.snapshotId || null,
    state,
    severity,
    decisionStrength,
    scores: { semanticChange: semantic, correlation, evidenceConfidence: confidence, activationTimeline: activation },
    gates: { activationTransition: activationLike, runtimeEvidence, distributionEvidence: distributionLike, domainCount, highConfidenceEvidence },
    thresholds: t,
    reasons,
    strongestEvidence: ensureArray(timeline?.evidenceConfidence?.strongestEvidence).slice(0, 8),
    interpretation: state === "CRITICAL_ACTIVATION_CANDIDATE" ? "A high-confidence, multi-domain activation candidate is present and warrants immediate investigation." : state === "HIGH_CONFIDENCE_CONVERGENCE" ? "Independent evidence is converging with strong source quality; monitor closely for additional activation or distribution confirmation." : state === "RUNTIME_ACTIVATION" ? "A runtime/state activation transition is confirmed observationally, but broader convergence may still be incomplete." : state === "STRUCTURAL_CHANGE" ? "Meaningful code/surface change is present without enough runtime confirmation to call it activation." : state === "WATCH" ? "There is fresh evidence worth watching, but promotion gates are not satisfied." : "No fresh decision-grade activation evidence is present.",
    caution: "Activation Decision is an explainable evidence state, not a probability of launch, causality, claim readiness, or reward eligibility.",
  };
}

module.exports = { DEFAULT_THRESHOLDS, buildDecision, clamp100 };
