"use strict";

const fs = require("fs-extra");
const path = require("path");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const LATEST_FILE = path.join(PUBLIC_DATA, "latest.json");
const TIMELINE_FILE = path.join(PUBLIC_DATA, "activation-timeline.json");
const DECISION_FILE = path.join(PUBLIC_DATA, "activation-decision.json");
const RECIPIENTS_FILE = path.join(PUBLIC_DATA, "reward-recipients.json");
const CHAIN_FILE = path.join(PUBLIC_DATA, "chain-intelligence.json");
const ARCHIVE_FILE = path.join(PUBLIC_DATA, "evidence-archive.json");
const MAX_ENTRIES = 2000;

async function readJson(file, fallback = {}) {
  try { return await fs.readJson(file); } catch { return fallback; }
}
function arr(v) { return Array.isArray(v) ? v : []; }
function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; }

async function main() {
  const [latest, timeline, decision, recipients, chain, existing] = await Promise.all([
    readJson(LATEST_FILE, {}),
    readJson(TIMELINE_FILE, {}),
    readJson(DECISION_FILE, {}),
    readJson(RECIPIENTS_FILE, {}),
    readJson(CHAIN_FILE, {}),
    readJson(ARCHIVE_FILE, { version: 1, entries: [] }),
  ]);

  const snapshotId = latest?.snapshotId || timeline?.snapshotId || decision?.snapshotId || null;
  if (!snapshotId) throw new Error("Cannot archive evidence without a snapshotId");

  const recentEvents = arr(timeline?.recent?.events).slice(0, 40);
  const newEvents = arr(timeline?.newEvents).slice(0, 40);
  const domains = arr(timeline?.recent?.domains);
  const correlation = latest?.evidenceCorrelation || {};
  const semantic = latest?.featureActivationEvidence?.semanticChange || {};

  const entry = {
    schemaVersion: 1,
    snapshotId,
    capturedAt: new Date().toISOString(),
    generatedAt: latest?.generatedAt || timeline?.checkedAt || decision?.checkedAt || new Date().toISOString(),
    exactEvidence: true,
    scores: {
      semanticChange: n(semantic?.score),
      correlation: n(correlation?.score),
      evidenceConfidence: n(timeline?.evidenceConfidence?.score),
      activationTimeline: n(timeline?.score),
    },
    decision: {
      state: decision?.state || "QUIET",
      severity: decision?.severity || "INFO",
      decisionStrength: n(decision?.decisionStrength),
      gates: decision?.gates || {},
    },
    semantic: {
      level: semantic?.level || null,
      classification: semantic?.classification || null,
      material: semantic?.material === true,
      highValueEvidence: arr(semantic?.highValueEvidence).slice(0, 12),
    },
    correlation: {
      level: correlation?.level || null,
      classification: correlation?.classification || null,
      evidenceCount: n(correlation?.evidenceCount),
      domainCount: n(correlation?.domainCount),
      domains: correlation?.domains || {},
      componentScores: correlation?.componentScores || {},
    },
    evidenceConfidence: {
      level: timeline?.evidenceConfidence?.level || "NO_EVIDENCE",
      evidenceCount: n(timeline?.evidenceConfidence?.evidenceCount),
      domainCount: n(timeline?.evidenceConfidence?.domainCount),
      highConfidenceCount: n(timeline?.evidenceConfidence?.highConfidenceCount),
      strongestEvidence: arr(timeline?.evidenceConfidence?.strongestEvidence).slice(0, 12),
    },
    timeline: {
      classification: timeline?.classification || "QUIET",
      windowMinutes: n(timeline?.windowMinutes || 60),
      domainCount: n(timeline?.recent?.domainCount),
      domains,
      eventCount: n(timeline?.recent?.eventCount),
      events: recentEvents,
      newEvents,
      transitionsThisSweep: {
        flags: n(timeline?.flagHistory?.transitionsThisSweep),
        routes: n(timeline?.dormantActive?.routeTransitionsThisSweep),
        apis: n(timeline?.dormantActive?.apiTransitionsThisSweep),
        deactivations: n(timeline?.dormantActive?.deactivationsThisSweep),
      },
    },
    onchain: {
      newTransfersThisSweep: n(recipients?.newTransfersThisSweep ?? chain?.recipientLedger?.newTransfersThisSweep),
      newRecipientsThisSweep: n(recipients?.newRecipientsThisSweep ?? chain?.recipientLedger?.newRecipientsThisSweep),
      lastObservedAt: recipients?.lastObservedAt || chain?.recipientLedger?.lastObservedAt || null,
      fundingActive: chain?.fundingStatus?.active15m === true || chain?.fundingDetected === true,
      rewardTransfers5m: n(chain?.windows?.["5m"]?.rewardTransfers ?? chain?.windows?.["5m"]?.rewards),
    },
  };

  const previous = arr(existing?.entries).filter((row) => row?.snapshotId && row.snapshotId !== snapshotId);
  const entries = [...previous, entry]
    .sort((a, b) => new Date(a.generatedAt || a.capturedAt).getTime() - new Date(b.generatedAt || b.capturedAt).getTime())
    .slice(-MAX_ENTRIES);

  const archive = {
    version: 1,
    updatedAt: entry.capturedAt,
    maxEntries: MAX_ENTRIES,
    entryCount: entries.length,
    firstCapturedAt: entries[0]?.generatedAt || entries[0]?.capturedAt || null,
    lastCapturedAt: entries.at(-1)?.generatedAt || entries.at(-1)?.capturedAt || null,
    exactEvidenceEntries: entries.filter((row) => row?.exactEvidence === true).length,
    entries,
    methodology: "One compact, exact evidence row is preserved per successful radar sweep after Activation Decision is built. This archive exists to support future replay and calibration without reconstructing missing historical telemetry.",
  };

  await fs.ensureDir(PUBLIC_DATA);
  await fs.writeJson(ARCHIVE_FILE, archive, { spaces: 2 });
  console.log(`Evidence Archive v1 | entries=${archive.entryCount} snapshot=${snapshotId} state=${entry.decision.state} domains=${entry.timeline.domainCount}`);
}

main().catch((error) => {
  console.error("evidence-archive failed:", error);
  process.exit(1);
});
