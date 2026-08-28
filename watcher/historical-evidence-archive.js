"use strict";

const fs = require("fs-extra");
const path = require("path");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "historical-evidence-archive.json");
const MAX_ENTRIES = 5000;

const FILES = {
  latest: "latest.json",
  timeline: "activation-timeline.json",
  decision: "activation-decision.json",
  chain: "chain-intelligence.json",
  recipients: "reward-recipients.json",
  routeApi: "route-api-intelligence.json",
};

async function readJson(name, fallback = null) {
  try {
    return await fs.readJson(path.join(PUBLIC_DATA, name));
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

function compactEvent(event) {
  return {
    type: event?.type || null,
    domain: event?.domain || null,
    subject: event?.subject || null,
    seenAt: event?.seenAt || null,
    status: event?.status ?? null,
    confidence: event?.confidence ?? null,
    sourceClass: event?.sourceClass || null,
  };
}

function compactRecipient(recipient) {
  return {
    wallet: recipient?.wallet || null,
    totalWPOND: n(recipient?.totalWPOND),
    transferCount: n(recipient?.transferCount),
    firstSeenAt: recipient?.firstSeenAt || null,
    lastSeenAt: recipient?.lastSeenAt || null,
    lastSignature: recipient?.lastSignature || null,
  };
}

function buildEntry({ latest, timeline, decision, chain, recipients, routeApi }) {
  const generatedAt =
    decision?.checkedAt ||
    latest?.generatedAt ||
    timeline?.checkedAt ||
    new Date().toISOString();

  const snapshotId =
    decision?.snapshotId ||
    latest?.snapshotId ||
    timeline?.snapshotId ||
    null;

  const recentEvents = arr(timeline?.recent?.events).map(compactEvent);
  const strongestEvidence = arr(timeline?.evidenceConfidence?.strongestEvidence).map(compactEvent);
  const recentDomains = arr(timeline?.recent?.domains);

  return {
    id: `${snapshotId || "no-snapshot"}__${generatedAt}`,
    snapshotId,
    generatedAt,
    scores: {
      radar: n(latest?.score ?? latest?.rawScore),
      semantic: n(latest?.featureActivationEvidence?.semanticChange?.score),
      correlation: n(latest?.evidenceCorrelation?.score),
      evidenceConfidence: n(timeline?.evidenceConfidence?.score),
      activationTimeline: n(timeline?.score),
      decisionStrength: n(decision?.decisionStrength),
    },
    states: {
      decision: decision?.state || null,
      decisionSeverity: decision?.severity || null,
      activationTimeline: timeline?.classification || null,
      featureActivation: latest?.featureActivationEvidence?.classification || null,
      correlation: latest?.evidenceCorrelation?.classification || null,
      onchain: latest?.advancedSignals?.onchainStatus || chain?.status || null,
    },
    gates: {
      activationTransition: decision?.gates?.activationTransition === true,
      runtimeEvidence: decision?.gates?.runtimeEvidence === true,
      distributionEvidence: decision?.gates?.distributionEvidence === true,
      domainCount: n(decision?.gates?.domainCount ?? timeline?.recent?.domainCount),
      highConfidenceEvidence: n(decision?.gates?.highConfidenceEvidence ?? timeline?.evidenceConfidence?.highConfidenceCount),
    },
    evidence: {
      recentDomains,
      recentEvents,
      strongestEvidence,
      newTimelineEvents: arr(timeline?.newEvents).map(compactEvent),
      semanticHighValueEvidence: arr(latest?.featureActivationEvidence?.semanticChange?.highValueEvidence),
      semanticReasons: arr(latest?.featureActivationEvidence?.semanticChange?.reasons),
      correlationDomains: latest?.evidenceCorrelation?.domains || {},
      temporalSequence: arr(latest?.temporalCorrelation?.sequence),
    },
    surfaces: {
      dormantToLive: arr(routeApi?.dormantToLive),
      liveToDormant: arr(routeApi?.liveToDormant),
      freshDiscoveries: arr(routeApi?.freshDiscoveries),
      liveApiRoutes: arr(routeApi?.liveApiRoutes),
      unlockedFlags: arr(latest?.featureActivationEvidence?.unlockedFlags),
      activatedRoutes: arr(latest?.featureActivationEvidence?.activatedRoutes),
    },
    onchain: {
      available: latest?.advancedSignals?.onchainAvailable === true,
      fresh: latest?.advancedSignals?.onchainFresh === true,
      movement: latest?.advancedSignals?.hasOnchainMovement === true,
      newExternalTransfers: n(latest?.evidenceCorrelation?.newExternalTransfers),
      newExternalRecipients: n(latest?.evidenceCorrelation?.newExternalRecipients),
      recipientLedger: {
        totalRecipients: n(recipients?.totalRecipients),
        totalTransfers: n(recipients?.totalTransfers),
        totalWPOND: n(recipients?.totalWPOND),
        newTransfersThisSweep: n(recipients?.newTransfersThisSweep),
        newRecipientsThisSweep: n(recipients?.newRecipientsThisSweep),
        lastObservedAt: recipients?.lastObservedAt || null,
        recipients: arr(recipients?.recipients).map(compactRecipient),
      },
      chainSummary: {
        checkedAt: chain?.checkedAt || chain?.updatedAt || null,
        status: chain?.status || null,
      },
    },
    provenance: {
      mode: "EXACT_SWEEP_ARCHIVE",
      sourceFiles: Object.values(FILES),
      note: "This row preserves the decision inputs and observed evidence available during this exact sweep. It is suitable for future replay/calibration without reconstructing missing historical state.",
    },
  };
}

async function main() {
  await fs.ensureDir(PUBLIC_DATA);

  const [latest, timeline, decision, chain, recipients, routeApi] = await Promise.all([
    readJson(FILES.latest, {}),
    readJson(FILES.timeline, {}),
    readJson(FILES.decision, {}),
    readJson(FILES.chain, {}),
    readJson(FILES.recipients, {}),
    readJson(FILES.routeApi, {}),
  ]);

  const entry = buildEntry({ latest, timeline, decision, chain, recipients, routeApi });
  const existing = await readJson("historical-evidence-archive.json", {});
  const previousEntries = arr(existing?.entries);

  const deduped = previousEntries.filter((row) => {
    if (entry.snapshotId && row?.snapshotId === entry.snapshotId) return false;
    return row?.id !== entry.id;
  });

  const entries = [...deduped, entry]
    .sort((a, b) => new Date(a.generatedAt || 0) - new Date(b.generatedAt || 0))
    .slice(-MAX_ENTRIES);

  const archive = {
    version: 1,
    updatedAt: new Date().toISOString(),
    capacity: MAX_ENTRIES,
    entryCount: entries.length,
    firstObservedAt: entries[0]?.generatedAt || null,
    lastObservedAt: entries.at(-1)?.generatedAt || null,
    exactSweepCount: entries.filter((row) => row?.provenance?.mode === "EXACT_SWEEP_ARCHIVE").length,
    latestSnapshotId: entry.snapshotId,
    entries,
    methodology: "One compact evidence row is persisted per Radar sweep after Activation Decision. Rows preserve exact observed decision inputs, states, domains, transitions, surface changes, and on-chain summary for future backtesting.",
    caution: "Archived evidence records what the Radar observed at each sweep. It does not establish causality, launch probability, reward eligibility, or correctness of future labels.",
  };

  await fs.writeJson(OUTPUT_FILE, archive, { spaces: 2 });

  console.log(
    `Historical Evidence Archive v1 | entries=${archive.entryCount} snapshot=${entry.snapshotId || "none"} state=${entry.states.decision || "UNKNOWN"}`
  );
}

main().catch((error) => {
  console.error("historical-evidence-archive failed:", error);
  process.exit(1);
});
