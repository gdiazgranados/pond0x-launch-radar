"use strict";

function buildEvidenceCorrelation({
  discoveryMatchesCurrentSnapshot = false,
  discovery = {},
  discoveryNewApiRoutes = [],
  discoveryNewLiveApiRoutes = [],
  freshBackendSignals = [],
  discoveryCriticalKeywords = [],
  hasFreshSurfaceMovement = false,
  normalizedOnchain = {},
  existingHistory = [],
  generatedAt,
}) {
  if (!generatedAt) {
    throw new TypeError("generatedAt is required");
  }

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

    surfaceMovement:
      hasFreshSurfaceMovement,

    onchainMovement:
      normalizedOnchain.available === true &&
      normalizedOnchain.fresh === true &&
      normalizedOnchain.hasOnchainMovement === true,
  };

  const correlationDomains = {
    api:
      correlationEvidence.apiResponseDrift ||
      correlationEvidence.newApiRoute ||
      correlationEvidence.newLiveApiRoute,

    backend:
      correlationEvidence.backendSignal,

    semantic:
      correlationEvidence.criticalKeyword,

    webSurface:
      correlationEvidence.surfaceMovement,

    onchain:
      correlationEvidence.onchainMovement,
  };

  const correlationEvidenceCount =
    Object.values(correlationEvidence)
      .filter(Boolean)
      .length;

  const correlationDomainCount =
    Object.values(correlationDomains)
      .filter(Boolean)
      .length;

  const evidenceCorrelation = {
    ...correlationEvidence,
    evidenceCount: correlationEvidenceCount,
    domainCount: correlationDomainCount,
    domains: correlationDomains,
    classification:
      correlationDomainCount >= 4
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

  for (const [domain, active] of Object.entries(correlationDomains)) {
    if (active) {
      temporalDomainEvents.push({
        domain,
        seenAt: generatedAt,
        source: "current",
      });
    }
  }

  for (const historicalResult of existingHistory) {
    const historicalTime = new Date(historicalResult?.generatedAt || 0).getTime();

    if (!Number.isFinite(historicalTime)) continue;
    if (historicalTime > temporalNow) continue;
    if (temporalNow - historicalTime > TEMPORAL_CORRELATION_WINDOW_MS) continue;

    const historicalDomains =
      historicalResult?.evidenceCorrelation?.domains || {};

    for (const [domain, active] of Object.entries(historicalDomains)) {
      if (active) {
        temporalDomainEvents.push({
          domain,
          seenAt: historicalResult.generatedAt,
          source: "history",
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

  const temporalSequence = [...temporalFirstByDomain.values()]
    .sort((a, b) => new Date(a.seenAt).getTime() - new Date(b.seenAt).getTime());

  const temporalFirstSeenAt = temporalSequence[0]?.seenAt || null;
  const temporalLastSeenAt =
    temporalSequence[temporalSequence.length - 1]?.seenAt || null;

  const temporalSpanMinutes =
    temporalFirstSeenAt && temporalLastSeenAt
      ? Math.round(
          (new Date(temporalLastSeenAt).getTime() -
            new Date(temporalFirstSeenAt).getTime()) /
            60000
        )
      : null;

  const temporalDomainCount = temporalSequence.length;

  const temporalCorrelation = {
    windowMinutes: 60,
    domainCount: temporalDomainCount,
    sequence: temporalSequence.map((event) => event.domain),
    events: temporalSequence,
    firstSeenAt: temporalFirstSeenAt,
    lastSeenAt: temporalLastSeenAt,
    spanMinutes: temporalSpanMinutes,
    classification:
      temporalDomainCount >= 3 &&
      temporalSpanMinutes !== null &&
      temporalSpanMinutes <= 10
        ? "TIGHT_CLUSTER"
        : temporalDomainCount >= 3
          ? "CLUSTERED"
          : temporalDomainCount >= 2
            ? "LOOSE"
            : "NONE",
  };

  return {
    evidenceCorrelation,
    temporalCorrelation,
  };
}

module.exports = {
  buildEvidenceCorrelation,
};
