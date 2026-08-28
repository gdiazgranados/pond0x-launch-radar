"use strict";

const DEFAULT_CONFIDENCE = {
  FLAG_UNLOCKED: 88,
  FLAG_VALUE_CHANGED: 78,
  FLAG_LOCKED: 82,
  API_DORMANT_TO_LIVE: 86,
  ROUTE_DORMANT_TO_LIVE: 78,
  API_LIVE_TO_DORMANT: 80,
  ROUTE_LIVE_TO_DORMANT: 72,
  DISTRIBUTOR_TRANSFER: 97,
  NEW_RECIPIENT: 95,
  ONCHAIN_ACTIVITY: 94,
  SEMANTIC_MATERIAL_CHANGE: 58,
};

const SOURCE_CLASS = {
  FLAG_UNLOCKED: "OBSERVED_FEATURE_STATE",
  FLAG_VALUE_CHANGED: "OBSERVED_FEATURE_STATE",
  FLAG_LOCKED: "OBSERVED_FEATURE_STATE",
  API_DORMANT_TO_LIVE: "HTTP_OR_RUNTIME_SURFACE",
  ROUTE_DORMANT_TO_LIVE: "HTTP_SURFACE_PROBE",
  API_LIVE_TO_DORMANT: "HTTP_OR_RUNTIME_SURFACE",
  ROUTE_LIVE_TO_DORMANT: "HTTP_SURFACE_PROBE",
  DISTRIBUTOR_TRANSFER: "CONFIRMED_ONCHAIN",
  NEW_RECIPIENT: "CONFIRMED_ONCHAIN",
  ONCHAIN_ACTIVITY: "CONFIRMED_ONCHAIN",
  SEMANTIC_MATERIAL_CHANGE: "STATIC_BUNDLE_EVIDENCE",
};

function clamp(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round(n)));
}

function eventConfidence(event) {
  let score = DEFAULT_CONFIDENCE[event?.type] ?? 35;

  // Runtime-observed APIs are stronger than probe-only references.
  if (event?.domain === "api" && (event?.status === "runtime" || event?.runtimeObserved === true)) {
    score = Math.max(score, 94);
  }

  // A concrete successful HTTP status is stronger than an unresolved surface reference.
  const status = Number(event?.status);
  if ((event?.domain === "api" || event?.domain === "route") && Number.isFinite(status)) {
    if (status >= 200 && status < 400) score = Math.max(score, event.domain === "api" ? 88 : 82);
    if (status >= 400) score = Math.min(score, 76);
  }

  return clamp(score);
}

function level(score) {
  if (score >= 90) return "VERY_HIGH";
  if (score >= 80) return "HIGH";
  if (score >= 65) return "MEDIUM";
  if (score >= 45) return "LOW";
  return "VERY_LOW";
}

function buildEvidenceConfidence(events) {
  const rows = (Array.isArray(events) ? events : []).map((event) => ({
    type: event.type,
    domain: event.domain,
    subject: event.subject || null,
    seenAt: event.seenAt || null,
    confidence: eventConfidence(event),
    sourceClass: SOURCE_CLASS[event.type] || "UNKNOWN_EVIDENCE",
    detail: event.detail || null,
  }));

  if (!rows.length) {
    return {
      score: 0,
      level: "NO_EVIDENCE",
      evidenceCount: 0,
      domainCount: 0,
      highConfidenceCount: 0,
      strongestEvidence: [],
      methodology: "Confidence scores evidence quality, not probability of launch or causality.",
    };
  }

  const sorted = rows.slice().sort((a, b) => b.confidence - a.confidence);
  const domains = new Set(rows.map((row) => row.domain).filter(Boolean));
  const top = sorted.slice(0, 5);

  // Weighted toward the strongest independent observations; weak evidence cannot swamp strong evidence by volume.
  const weights = [0.38, 0.25, 0.17, 0.12, 0.08];
  let weighted = 0;
  let usedWeight = 0;
  top.forEach((row, index) => {
    weighted += row.confidence * weights[index];
    usedWeight += weights[index];
  });
  let score = usedWeight ? weighted / usedWeight : 0;

  // Small independence bonus for corroboration across domains, deliberately capped.
  score += Math.min(6, Math.max(0, domains.size - 1) * 1.5);
  score = clamp(score);

  return {
    score,
    level: level(score),
    evidenceCount: rows.length,
    domainCount: domains.size,
    highConfidenceCount: rows.filter((row) => row.confidence >= 85).length,
    strongestEvidence: sorted.slice(0, 8),
    byDomain: Object.fromEntries([...domains].map((domain) => {
      const domainRows = rows.filter((row) => row.domain === domain);
      return [domain, {
        count: domainRows.length,
        maxConfidence: Math.max(...domainRows.map((row) => row.confidence)),
      }];
    })),
    methodology: "Evidence Confidence measures source quality and corroboration. Confirmed on-chain and runtime/state transitions outrank HTTP probes and static bundle semantics. It is not a launch probability and does not imply causality.",
  };
}

module.exports = { buildEvidenceConfidence, eventConfidence };
