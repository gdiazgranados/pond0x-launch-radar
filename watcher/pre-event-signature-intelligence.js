"use strict";

const fs = require("fs-extra");
const path = require("path");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const GROUND_TRUTH_FILE = path.join(PUBLIC_DATA, "ground-truth-events.json");
const ARCHIVE_FILE = path.join(PUBLIC_DATA, "historical-evidence-archive.json");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "pre-event-signature-intelligence.json");
const WINDOWS = [1, 3, 6, 12, 24];

async function readJson(file, fallback) {
  try { return await fs.readJson(file); } catch { return fallback; }
}
function arr(v) { return Array.isArray(v) ? v : []; }
function pct(a, b) { return b ? Math.round((a / b) * 10000) / 100 : null; }
function ms(v) { return new Date(v).getTime(); }
function uniq(values) { return [...new Set(values.filter(Boolean))]; }
function max(rows, getter) { return rows.reduce((m, row) => Math.max(m, Number(getter(row) || 0)), 0); }

function windowSummary(entries, eventAt, hours) {
  const eventMs = ms(eventAt);
  const startMs = eventMs - hours * 60 * 60 * 1000;
  const rows = entries.filter((e) => {
    const t = ms(e?.generatedAt);
    return Number.isFinite(t) && t >= startMs && t <= eventMs;
  });
  const nonQuiet = rows.filter((e) => e?.states?.decision && e.states.decision !== "QUIET");
  const domains = uniq(rows.flatMap((e) => arr(e?.evidence?.recentDomains)));
  const eventTypes = uniq(rows.flatMap((e) => arr(e?.evidence?.recentEvents).map((x) => x?.type || x?.eventType || x?.kind || (typeof x === "string" ? x : null))));
  const strongest = rows.slice().sort((a, b) => Number(b?.scores?.decisionStrength || 0) - Number(a?.scores?.decisionStrength || 0))[0] || null;
  const gateCounts = {
    activationTransition: rows.filter((e) => !!e?.gates?.activationTransition).length,
    runtimeEvidence: rows.filter((e) => !!e?.gates?.runtimeEvidence).length,
    distributionEvidence: rows.filter((e) => !!e?.gates?.distributionEvidence).length,
    highConfidenceEvidence: rows.filter((e) => Number(e?.gates?.highConfidenceEvidence || 0) > 0).length,
  };
  return {
    exactSweepCount: rows.length,
    nonQuietSweepCount: nonQuiet.length,
    nonQuietRate: pct(nonQuiet.length, rows.length),
    maxScores: {
      semantic: max(rows, (e) => e?.scores?.semantic),
      correlation: max(rows, (e) => e?.scores?.correlation),
      evidenceConfidence: max(rows, (e) => e?.scores?.evidenceConfidence),
      activationTimeline: max(rows, (e) => e?.scores?.activationTimeline),
      decisionStrength: max(rows, (e) => e?.scores?.decisionStrength),
    },
    gateCounts,
    domains,
    eventTypes,
    strongestSnapshot: strongest ? {
      snapshotId: strongest.snapshotId || null,
      generatedAt: strongest.generatedAt || null,
      decision: strongest?.states?.decision || null,
      decisionStrength: Number(strongest?.scores?.decisionStrength || 0),
      leadMinutes: Math.round(((eventMs - ms(strongest.generatedAt)) / 60000) * 100) / 100,
    } : null,
  };
}

function eventSignature(event, entries) {
  const windows = Object.fromEntries(WINDOWS.map((h) => [`${h}h`, windowSummary(entries, event.occurredAt, h)]));
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    type: event.type,
    chain: event.chain,
    signature: event.signature,
    recipient: event.recipient,
    amountWPOND: event.amountWPOND,
    confidence: event.confidence,
    archiveCovered: Object.values(windows).some((w) => w.exactSweepCount > 0),
    windows,
  };
}

function aggregate(signatures) {
  const covered = signatures.filter((s) => s.archiveCovered);
  const windows = {};
  for (const h of WINDOWS) {
    const key = `${h}h`;
    const samples = covered.map((s) => s.windows[key]).filter((w) => w.exactSweepCount > 0);
    windows[key] = {
      coveredEventCount: samples.length,
      eventsWithNonQuietSignal: samples.filter((w) => w.nonQuietSweepCount > 0).length,
      signalEventRate: pct(samples.filter((w) => w.nonQuietSweepCount > 0).length, samples.length),
      maxObservedScores: {
        semantic: max(samples, (w) => w.maxScores.semantic),
        correlation: max(samples, (w) => w.maxScores.correlation),
        evidenceConfidence: max(samples, (w) => w.maxScores.evidenceConfidence),
        activationTimeline: max(samples, (w) => w.maxScores.activationTimeline),
        decisionStrength: max(samples, (w) => w.maxScores.decisionStrength),
      },
      recurringDomains: uniq(samples.flatMap((w) => w.domains)),
      recurringEventTypes: uniq(samples.flatMap((w) => w.eventTypes)),
    };
  }
  return { coveredEventCount: covered.length, windows };
}

async function main() {
  const registry = await readJson(GROUND_TRUTH_FILE, { events: [] });
  const archive = await readJson(ARCHIVE_FILE, { entries: [] });
  const entries = arr(archive?.entries)
    .filter((e) => e?.generatedAt && e?.provenance?.mode === "EXACT_SWEEP_ARCHIVE")
    .sort((a, b) => ms(a.generatedAt) - ms(b.generatedAt));
  const events = arr(registry?.events)
    .filter((e) => e?.occurredAt && e?.confidence === "CONFIRMED_ONCHAIN")
    .sort((a, b) => ms(a.occurredAt) - ms(b.occurredAt));
  const signatures = events.map((event) => eventSignature(event, entries));
  const aggregateSignature = aggregate(signatures);

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: "EXACT_PRE_EVENT_EVIDENCE_ONLY",
    eventScope: "CONFIRMED_EXTERNAL_DISTRIBUTOR_TRANSFERS",
    exactSweepCount: entries.length,
    eventCount: events.length,
    coveredEventCount: aggregateSignature.coveredEventCount,
    uncoveredEventCount: events.length - aggregateSignature.coveredEventCount,
    lookbackHours: WINDOWS,
    status: aggregateSignature.coveredEventCount === 0 ? "WAITING_FOR_EXACT_COVERED_EVENT" : aggregateSignature.coveredEventCount < 3 ? "EARLY_PATTERN_DISCOVERY" : "PATTERN_DISCOVERY_ACTIVE",
    events: signatures,
    aggregate: aggregateSignature,
    interpretation: "Summarizes exact archived evidence observed before confirmed on-chain distributor transfers. It describes recurring pre-event signatures; it does not assert causation, reward eligibility, or launch prediction accuracy.",
  };

  await fs.writeJson(OUTPUT_FILE, output, { spaces: 2 });
  console.log(`Pre-Event Signature Intelligence v1 | exact=${entries.length} events=${events.length} covered=${aggregateSignature.coveredEventCount} status=${output.status}`);
}

main().catch((error) => {
  console.error("pre-event-signature-intelligence failed:", error);
  process.exit(1);
});
