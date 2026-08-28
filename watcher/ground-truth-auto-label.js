"use strict";

const fs = require("fs-extra");
const path = require("path");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const RECIPIENTS_FILE = path.join(PUBLIC_DATA, "reward-recipients.json");
const ARCHIVE_FILE = path.join(PUBLIC_DATA, "historical-evidence-archive.json");
const STATIC_REGISTRY_FILE = path.join(__dirname, "ground-truth-events.json");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "ground-truth-events.json");

const LOOKBACK_HOURS = [1, 3, 6, 12, 24];

async function readJson(file, fallback) {
  try { return await fs.readJson(file); } catch { return fallback; }
}
function arr(value) { return Array.isArray(value) ? value : []; }
function iso(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
function ageMinutes(before, after) {
  return (new Date(after).getTime() - new Date(before).getTime()) / 60000;
}

function evidenceSummary(entry) {
  return {
    snapshotId: entry?.snapshotId || null,
    generatedAt: entry?.generatedAt || null,
    decision: entry?.states?.decision || null,
    decisionSeverity: entry?.states?.decisionSeverity || null,
    activationTimeline: entry?.states?.activationTimeline || null,
    scores: {
      radar: Number(entry?.scores?.radar || 0),
      semantic: Number(entry?.scores?.semantic || 0),
      correlation: Number(entry?.scores?.correlation || 0),
      evidenceConfidence: Number(entry?.scores?.evidenceConfidence || 0),
      activationTimeline: Number(entry?.scores?.activationTimeline || 0),
      decisionStrength: Number(entry?.scores?.decisionStrength || 0),
    },
    gates: entry?.gates || {},
    recentDomains: arr(entry?.evidence?.recentDomains),
    recentEvents: arr(entry?.evidence?.recentEvents),
    strongestEvidence: arr(entry?.evidence?.strongestEvidence),
  };
}

function correlateEvent(event, archiveEntries) {
  const eventTime = new Date(event.occurredAt).getTime();
  const prior = archiveEntries
    .filter((entry) => {
      const t = new Date(entry?.generatedAt).getTime();
      return Number.isFinite(t) && t <= eventTime && eventTime - t <= 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));

  const nearestPrior = prior.at(-1) || null;
  const windows = {};
  for (const hours of LOOKBACK_HOURS) {
    const within = prior.filter((entry) => ageMinutes(entry.generatedAt, event.occurredAt) <= hours * 60);
    const nonQuiet = within.filter((entry) => entry?.states?.decision && entry.states.decision !== "QUIET");
    const strongest = within.slice().sort((a, b) => Number(b?.scores?.decisionStrength || 0) - Number(a?.scores?.decisionStrength || 0))[0] || null;
    windows[`${hours}h`] = {
      exactSweepCount: within.length,
      nonQuietSweepCount: nonQuiet.length,
      strongestDecisionStrength: Number(strongest?.scores?.decisionStrength || 0),
      strongestSnapshotId: strongest?.snapshotId || null,
      latestPriorSnapshotId: within.at(-1)?.snapshotId || null,
    };
  }

  return {
    mode: "EXACT_SWEEP_PRE_EVENT_CORRELATION",
    archiveCovered: !!nearestPrior,
    nearestPriorSweep: nearestPrior ? {
      ...evidenceSummary(nearestPrior),
      leadMinutes: Math.round(ageMinutes(nearestPrior.generatedAt, event.occurredAt) * 100) / 100,
    } : null,
    windows,
  };
}

function recipientToEvent(recipient) {
  const signature = recipient?.lastSignature;
  const occurredAt = iso(recipient?.lastSeenAt || recipient?.firstSeenAt);
  if (!signature || !occurredAt || !recipient?.wallet) return null;
  return {
    id: `solana-${signature}`,
    occurredAt,
    type: "EXTERNAL_DISTRIBUTOR_TRANSFER",
    chain: "solana",
    signature,
    recipient: recipient.wallet,
    amountWPOND: Number(recipient?.totalWPOND || 0),
    confidence: "CONFIRMED_ONCHAIN",
    label: "Observed distributor transfer to external recipient",
    source: "AUTO_LABELED_FROM_RECIPIENT_LEDGER",
  };
}

async function main() {
  const [staticRegistry, existingPublished, recipients, archive] = await Promise.all([
    readJson(STATIC_REGISTRY_FILE, { events: [] }),
    readJson(OUTPUT_FILE, { events: [] }),
    readJson(RECIPIENTS_FILE, { recipients: [] }),
    readJson(ARCHIVE_FILE, { entries: [] }),
  ]);

  const archiveEntries = arr(archive?.entries)
    .filter((entry) => entry?.generatedAt && entry?.provenance?.mode === "EXACT_SWEEP_ARCHIVE")
    .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));

  const merged = new Map();
  for (const event of [...arr(staticRegistry?.events), ...arr(existingPublished?.events)]) {
    if (event?.id) merged.set(event.id, { ...event });
  }

  let autoAdded = 0;
  for (const recipient of arr(recipients?.recipients)) {
    const event = recipientToEvent(recipient);
    if (!event) continue;
    if (!merged.has(event.id)) autoAdded += 1;
    merged.set(event.id, { ...merged.get(event.id), ...event });
  }

  const events = [...merged.values()]
    .filter((event) => event?.occurredAt)
    .map((event) => ({ ...event, exactArchiveCorrelation: correlateEvent(event, archiveEntries) }))
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));

  const covered = events.filter((event) => event?.exactArchiveCorrelation?.archiveCovered).length;
  const output = {
    version: 2,
    updatedAt: new Date().toISOString(),
    methodology: "Ground-truth registry contains directly observed, timestamped on-chain distributor transfers with transaction signatures preserved by the radar. New external claim candidates are auto-labeled from the recipient ledger and correlated only with exact pre-event archive sweeps. They are not asserted to be rewards or launch events.",
    autoLabeling: {
      enabled: true,
      source: "reward-recipients.json",
      eventType: "EXTERNAL_DISTRIBUTOR_TRANSFER",
      confidenceRequired: "CONFIRMED_ONCHAIN",
      autoAddedThisSweep: autoAdded,
      exactLookbackHours: LOOKBACK_HOURS,
    },
    summary: {
      eventCount: events.length,
      exactArchiveCoveredEvents: covered,
      uncoveredEvents: events.length - covered,
    },
    events,
  };

  await fs.ensureDir(PUBLIC_DATA);
  await fs.writeJson(OUTPUT_FILE, output, { spaces: 2 });
  console.log(`Ground Truth Auto-Labeling v1 | events=${events.length} added=${autoAdded} exactCovered=${covered}`);
}

main().catch((error) => {
  console.error("ground-truth-auto-label failed:", error);
  process.exit(1);
});
