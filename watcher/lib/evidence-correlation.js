"use strict";

function n(value) {
  const x = Number(value || 0);
  return Number.isFinite(x) ? x : 0;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function validTime(value, fallback) {
  const ts = new Date(value || 0).getTime();
  return Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : fallback;
}

function buildEvidenceCorrelation({
  discoveryMatchesCurrentSnapshot = false,
  discovery = {},
  discoveryNewApiRoutes = [],
  discoveryNewLiveApiRoutes = [],
  freshBackendSignals = [],
  discoveryCriticalKeywords = [],
  hasFreshSurfaceMovement = false,
  normalizedOnchain = {},
  featureActivationEvidence = {},
  chainIntelligence = {},
  existingHistory = [],
  generatedAt,
}) {
  if (!generatedAt) {
    throw new TypeError("generatedAt is required");
  }

  const semanticChange = featureActivationEvidence?.semanticChange || {};
  const semanticProxyScore = Math.min(
    100,
    discoveryCriticalKeywords.length * 10 +
      discoveryNewApiRoutes.length * 12 +
      discoveryNewLiveApiRoutes.length * 18 +
      freshBackendSignals.length * 10 +
      (hasFreshSurfaceMovement ? 8 : 0)
  );
  const semanticScore = Math.max(n(semanticChange.score), semanticProxyScore);
  const semanticMaterial =
    semanticChange.material === true ||
    semanticScore >= 35;
  const activationRelevantSemantic =
    semanticChange.classification === "ACTIVATION_RELEVANT_CHANGE" ||
    semanticScore >= 60;

  const recipientLedger = chainIntelligence?.recipientLedger || {};
  const newExternalTransfers = Math.max(
    n(recipientLedger.newTransfersThisSweep),
    n(normalizedOnchain.newExternalTransfers)
  );
  const newExternalRecipients = Math.max(
    n(recipientLedger.newRecipientsThisSweep),
    n(normalizedOnchain.newExternalRecipients)
  );
  const externalClaimTransfer =
    normalizedOnchain.externalClaimTransfer === true ||
    newExternalTransfers > 0;
  const newRecipient = newExternalRecipients > 0;

  const fundingActive =
    normalizedOnchain.fundingActive15m === true ||
    chainIntelligence?.fundingStatus?.active15m === true ||
    chainIntelligence?.fundingDetected === true;

  const rewardTransfers5m = Math.max(
    n(normalizedOnchain.rewardTransfers5m),
    n(
      chainIntelligence?.windows?.["5m"]?.rewardTransfers ??
        chainIntelligence?.windows?.["5m"]?.rewards
    )
  );
  const rewardActivity = rewardTransfers5m > 0;

  const correlationEvidence = {
    apiResponseDrift:
      discoveryMatchesCurrentSnapshot &&
      discovery.apiResponseDrift?.detected === true,

    newApiRoute:
      discoveryMatchesCurrentSnapshot &&
      discoveryNewApiRoutes.length > 0,

    newLiveApiRoute:
      discoveryMatchesCurrentSnapshot &&
      discoveryNewLiveApiRoutes.length > 0,

    backendSignal:
      freshBackendSignals.length > 0,

    criticalKeyword:
      discoveryMatchesCurrentSnapshot &&
      discoveryCriticalKeywords.length > 0,

    semanticMaterial,
    activationRelevantSemantic,

    surfaceMovement:
      hasFreshSurfaceMovement,

    onchainMovement:
      normalizedOnchain.available === true &&
      normalizedOnchain.fresh === true &&
      normalizedOnchain.hasOnchainMovement === true,

    fundingActive,
    rewardActivity,
    externalClaimTransfer,
    newRecipient,
  };

  const correlationDomains = {
    api:
      correlationEvidence.apiResponseDrift ||
      correlationEvidence.newApiRoute ||
      correlationEvidence.newLiveApiRoute,

    backend:
      correlationEvidence.backendSignal,

    semantic:
      correlationEvidence.semanticMaterial ||
      correlationEvidence.criticalKeyword,

    webSurface:
      correlationEvidence.surfaceMovement,

    onchain:
      correlationEvidence.onchainMovement ||
      correlationEvidence.fundingActive ||
      correlationEvidence.rewardActivity,

    distributor:
      correlationEvidence.externalClaimTransfer,

    recipients:
      correlationEvidence.newRecipient,
  };

  const correlationEvidenceCount = Object.values(correlationEvidence).filter(Boolean).length;
  const correlationDomainCount = Object.values(correlationDomains).filter(Boolean).length;

  const componentScores = {
    api: correlationDomains.api ? 12 : 0,
    backend: correlationDomains.backend ? 15 : 0,
    semantic: correlationDomains.semantic
      ? Math.min(20, 8 + Math.round(semanticScore * 0.12))
      : 0,
    webSurface: correlationDomains.webSurface ? 8 : 0,
    onchain: correlationDomains.onchain ? 12 : 0,
    distributor: correlationDomains.distributor ? 18 : 0,
    recipients: correlationDomains.recipients ? 15 : 0,
  };

  const convergenceBonus =
    correlationDomains.semantic && correlationDomains.distributor
      ? 10
      : correlationDomainCount >= 4
        ? 6
        : correlationDomainCount >= 3
          ? 3
          : 0;

  const correlationScore = Math.min(
    100,
    Object.values(componentScores).reduce((sum, value) => sum + n(value), 0) +
      convergenceBonus
  );

  const coordinatedSequence =
    correlationDomains.semantic &&
    (correlationDomains.distributor || correlationDomains.recipients);

  const evidenceCorrelation = {
    ...correlationEvidence,
    evidenceCount: correlationEvidenceCount,
    domainCount: correlationDomainCount,
    domains: correlationDomains,
    score: correlationScore,
    level:
      correlationScore >= 80
        ? "CRITICAL"
        : correlationScore >= 60
          ? "HIGH"
          : correlationScore >= 35
            ? "MEDIUM"
            : correlationScore > 0
              ? "LOW"
              : "NONE",
    componentScores,
    convergenceBonus,
    semanticScore,
    semanticScoreSource:
      n(semanticChange.score) >= semanticProxyScore
        ? "FEATURE_SEMANTIC_ENGINE"
        : "DISCOVERY_PROXY",
    semanticClassification:
      semanticChange.classification ||
      (semanticScore >= 60
        ? "ACTIVATION_RELEVANT_PROXY"
        : semanticScore >= 35
          ? "SEMANTICALLY_MEANINGFUL_PROXY"
          : null),
    newExternalTransfers,
    newExternalRecipients,
    classification:
      coordinatedSequence && correlationDomainCount >= 5
        ? "STRONG_CONVERGENCE"
        : coordinatedSequence
          ? "COORDINATED_SEQUENCE"
          : correlationDomainCount >= 4
            ? "STRONG"
            : correlationDomainCount >= 2
              ? "MULTI_SURFACE"
              : correlationEvidenceCount > 0
                ? "ISOLATED"
                : "NONE",
  };

  const TEMPORAL_CORRELATION_WINDOW_MS = 60 * 60 * 1000;
  const temporalNow = new Date(generatedAt).getTime();
  const temporalDomainEvents = [];

  function pushCurrent(domain, active, seenAt, detail = null) {
    if (!active) return;
    temporalDomainEvents.push({
      domain,
      seenAt: validTime(seenAt, generatedAt),
      source: "current",
      detail,
    });
  }

  pushCurrent("api", correlationDomains.api, generatedAt);
  pushCurrent("backend", correlationDomains.backend, generatedAt);
  pushCurrent(
    "semantic",
    correlationDomains.semantic,
    generatedAt,
    semanticChange.classification || evidenceCorrelation.semanticClassification || null
  );
  pushCurrent("webSurface", correlationDomains.webSurface, generatedAt);
  pushCurrent(
    "onchain",
    correlationDomains.onchain,
    chainIntelligence?.generatedAt || generatedAt
  );

  const externalObservedAt =
    recipientLedger.lastObservedAt ||
    normalizedOnchain.externalClaimLastObservedAt ||
    chainIntelligence?.recentExternalClaims?.[0]?.time ||
    chainIntelligence?.recentExternalClaims?.[0]?.timestamp ||
    generatedAt;

  pushCurrent(
    "distributor",
    correlationDomains.distributor,
    externalObservedAt,
    newExternalTransfers ? `${newExternalTransfers} new transfer(s)` : null
  );
  pushCurrent(
    "recipients",
    correlationDomains.recipients,
    externalObservedAt,
    newExternalRecipients ? `${newExternalRecipients} new recipient(s)` : null
  );

  for (const historicalResult of existingHistory) {
    const historicalTime = new Date(historicalResult?.generatedAt || 0).getTime();
    if (!Number.isFinite(historicalTime)) continue;
    if (historicalTime > temporalNow) continue;
    if (temporalNow - historicalTime > TEMPORAL_CORRELATION_WINDOW_MS) continue;

    const historicalDomains = historicalResult?.evidenceCorrelation?.domains || {};
    for (const [domain, active] of Object.entries(historicalDomains)) {
      if (active) {
        temporalDomainEvents.push({
          domain,
          seenAt: historicalResult.generatedAt,
          source: "history",
          detail: null,
        });
      }
    }
  }

  const temporalFirstByDomain = new Map();
  for (const event of temporalDomainEvents) {
    const eventTime = new Date(event.seenAt).getTime();
    const previous = temporalFirstByDomain.get(event.domain);
    if (!previous || eventTime < new Date(previous.seenAt).getTime()) {
      temporalFirstByDomain.set(event.domain, event);
    }
  }

  const temporalSequence = [...temporalFirstByDomain.values()].sort(
    (a, b) => new Date(a.seenAt).getTime() - new Date(b.seenAt).getTime()
  );

  const temporalFirstSeenAt = temporalSequence[0]?.seenAt || null;
  const temporalLastSeenAt = temporalSequence[temporalSequence.length - 1]?.seenAt || null;

  const temporalSpanMinutes =
    temporalFirstSeenAt && temporalLastSeenAt
      ? Math.round(
          (new Date(temporalLastSeenAt).getTime() -
            new Date(temporalFirstSeenAt).getTime()) /
            60000
        )
      : null;

  const temporalDomainCount = temporalSequence.length;
  const sequenceNames = temporalSequence.map((event) => event.domain);
  const semanticIndex = sequenceNames.indexOf("semantic");
  const distributorIndex = sequenceNames.indexOf("distributor");

  let observedSequencePattern = null;
  if (semanticIndex >= 0 && distributorIndex >= 0) {
    observedSequencePattern =
      semanticIndex < distributorIndex
        ? "FRONTEND_THEN_DISTRIBUTION"
        : distributorIndex < semanticIndex
          ? "DISTRIBUTION_THEN_FRONTEND"
          : "SAME_OBSERVATION_WINDOW";
  } else if (temporalDomainCount >= 3) {
    observedSequencePattern = "MULTI_DOMAIN_CONVERGENCE";
  }

  const temporalCorrelation = {
    windowMinutes: 60,
    domainCount: temporalDomainCount,
    sequence: sequenceNames,
    events: temporalSequence,
    firstSeenAt: temporalFirstSeenAt,
    lastSeenAt: temporalLastSeenAt,
    spanMinutes: temporalSpanMinutes,
    observedSequencePattern,
    classification:
      temporalDomainCount >= 4 &&
      temporalSpanMinutes !== null &&
      temporalSpanMinutes <= 15 &&
      sequenceNames.includes("semantic") &&
      sequenceNames.includes("distributor")
        ? "COORDINATED_CLUSTER"
        : temporalDomainCount >= 3 &&
            temporalSpanMinutes !== null &&
            temporalSpanMinutes <= 10
          ? "TIGHT_CLUSTER"
          : temporalDomainCount >= 3
            ? "CLUSTERED"
            : temporalDomainCount >= 2
              ? "LOOSE"
              : "NONE",
    interpretation:
      observedSequencePattern === "FRONTEND_THEN_DISTRIBUTION"
        ? "A semantic frontend signal was observed before distributor activity inside the rolling correlation window. This is temporal correlation, not proof of causation."
        : observedSequencePattern === "DISTRIBUTION_THEN_FRONTEND"
          ? "Distributor activity was observed before the semantic frontend signal inside the rolling correlation window. This is temporal correlation, not proof of causation."
          : temporalDomainCount >= 3
            ? "Multiple independent monitoring domains converged inside the rolling correlation window."
            : "No strong cross-domain temporal sequence is established yet.",
  };

  return {
    evidenceCorrelation,
    temporalCorrelation,
  };
}

module.exports = {
  buildEvidenceCorrelation,
};
