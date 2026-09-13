"use strict";

const fs = require("fs-extra");
const path = require("path");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const ARCHIVE_FILE = path.join(PUBLIC_DATA, "historical-evidence-archive.json");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "historical-daily-summary.json");

const MAX_DAYS = 365;

async function readJson(file, fallback) {
  try {
    return await fs.readJson(file);
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

function dayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function maxOf(entries, selector) {
  return entries.reduce((max, entry) => Math.max(max, n(selector(entry))), 0);
}

function countTrue(entries, selector) {
  return entries.filter((entry) => selector(entry) === true).length;
}

function buildDailySummary(date, entries) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.generatedAt || 0) - new Date(b.generatedAt || 0)
  );

  return {
    date,
    sweepCount: sorted.length,
    firstObservedAt: sorted[0]?.generatedAt || null,
    lastObservedAt: sorted.at(-1)?.generatedAt || null,
    firstSnapshotId: sorted[0]?.snapshotId || null,
    lastSnapshotId: sorted.at(-1)?.snapshotId || null,

    maxScores: {
      radar: maxOf(sorted, (entry) => entry?.scores?.radar),
      semantic: maxOf(sorted, (entry) => entry?.scores?.semantic),
      correlation: maxOf(sorted, (entry) => entry?.scores?.correlation),
      evidenceConfidence: maxOf(
        sorted,
        (entry) => entry?.scores?.evidenceConfidence
      ),
      activationTimeline: maxOf(
        sorted,
        (entry) => entry?.scores?.activationTimeline
      ),
      decisionStrength: maxOf(
        sorted,
        (entry) => entry?.scores?.decisionStrength
      ),
    },

    states: {
      decisions: uniq(sorted.map((entry) => entry?.states?.decision)),
      nonQuietSweeps: sorted.filter(
        (entry) => entry?.states?.decision && entry.states.decision !== "QUIET"
      ).length,
    },

    gates: {
      activationTransitionSweeps: countTrue(
        sorted,
        (entry) => entry?.gates?.activationTransition
      ),
      runtimeEvidenceSweeps: countTrue(
        sorted,
        (entry) => entry?.gates?.runtimeEvidence
      ),
      distributionEvidenceSweeps: countTrue(
        sorted,
        (entry) => entry?.gates?.distributionEvidence
      ),
      maxDomainCount: maxOf(sorted, (entry) => entry?.gates?.domainCount),
      maxHighConfidenceEvidence: maxOf(
        sorted,
        (entry) => entry?.gates?.highConfidenceEvidence
      ),
    },

    evidence: {
      domains: uniq(
        sorted.flatMap((entry) => arr(entry?.evidence?.recentDomains))
      ),
      eventTypes: uniq(
        sorted.flatMap((entry) =>
          arr(entry?.evidence?.recentEvents).map((event) => event?.type)
        )
      ),
      recentEventCount: sorted.reduce(
        (sum, entry) => sum + arr(entry?.evidence?.recentEvents).length,
        0
      ),
      newTimelineEventCount: sorted.reduce(
        (sum, entry) => sum + arr(entry?.evidence?.newTimelineEvents).length,
        0
      ),
    },

    surfaces: {
      dormantToLiveCount: sorted.reduce(
        (sum, entry) => sum + arr(entry?.surfaces?.dormantToLive).length,
        0
      ),
      liveToDormantCount: sorted.reduce(
        (sum, entry) => sum + arr(entry?.surfaces?.liveToDormant).length,
        0
      ),
      freshDiscoveryCount: sorted.reduce(
        (sum, entry) => sum + arr(entry?.surfaces?.freshDiscoveries).length,
        0
      ),
    },

    onchain: {
      movementSweeps: countTrue(sorted, (entry) => entry?.onchain?.movement),
      totalNewExternalTransfers: sorted.reduce(
        (sum, entry) => sum + n(entry?.onchain?.newExternalTransfers),
        0
      ),
      totalNewExternalRecipients: sorted.reduce(
        (sum, entry) => sum + n(entry?.onchain?.newExternalRecipients),
        0
      ),
      lastRecipientLedger: sorted.at(-1)?.onchain?.recipientLedger || null,
    },
  };
}

async function main() {
  await fs.ensureDir(PUBLIC_DATA);

  const archive = await readJson(ARCHIVE_FILE, { entries: [] });
  const previous = await readJson(OUTPUT_FILE, { days: [] });

  const grouped = new Map();

  for (const entry of arr(archive?.entries)) {
    const date = dayKey(entry?.generatedAt);
    if (!date) continue;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(entry);
  }

  const rebuiltDays = [...grouped.entries()].map(([date, rows]) =>
    buildDailySummary(date, rows)
  );

  const merged = new Map();

  for (const day of arr(previous?.days)) {
    if (day?.date) merged.set(day.date, day);
  }

  for (const day of rebuiltDays) {
    merged.set(day.date, day);
  }

  const days = [...merged.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_DAYS);

  const output = {
    version: 1,
    updatedAt: new Date().toISOString(),
    retentionDays: MAX_DAYS,
    dayCount: days.length,
    firstDay: days[0]?.date || null,
    lastDay: days.at(-1)?.date || null,
    days,
  };

  await fs.writeJson(OUTPUT_FILE, output, { spaces: 2 });

  console.log(
    `Historical Daily Summary v1 | days=${output.dayCount} latest=${output.lastDay || "none"}`
  );
}

main().catch((error) => {
  console.error("historical-daily-summary failed:", error);
  process.exit(1);
});