"use strict";

const fs = require("fs-extra");
const path = require("path");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const DAILY_FILE = path.join(PUBLIC_DATA, "historical-daily-summary.json");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "historical-monthly-summary.json");

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

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function monthKey(date) {
  return typeof date === "string" && date.length >= 7
    ? date.slice(0, 7)
    : null;
}

function maxOf(days, selector) {
  return days.reduce((max, day) => Math.max(max, n(selector(day))), 0);
}

function buildMonthlySummary(month, days) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  return {
    month,
    dayCount: sorted.length,
    firstDay: sorted[0]?.date || null,
    lastDay: sorted.at(-1)?.date || null,

    sweepCount: sorted.reduce(
      (sum, day) => sum + n(day?.sweepCount),
      0
    ),

    maxScores: {
      radar: maxOf(sorted, (day) => day?.maxScores?.radar),
      semantic: maxOf(sorted, (day) => day?.maxScores?.semantic),
      correlation: maxOf(sorted, (day) => day?.maxScores?.correlation),
      evidenceConfidence: maxOf(
        sorted,
        (day) => day?.maxScores?.evidenceConfidence
      ),
      activationTimeline: maxOf(
        sorted,
        (day) => day?.maxScores?.activationTimeline
      ),
      decisionStrength: maxOf(
        sorted,
        (day) => day?.maxScores?.decisionStrength
      ),
    },

    states: {
      decisions: uniq(
        sorted.flatMap((day) => arr(day?.states?.decisions))
      ),
      nonQuietSweeps: sorted.reduce(
        (sum, day) => sum + n(day?.states?.nonQuietSweeps),
        0
      ),
    },

    evidence: {
      domains: uniq(
        sorted.flatMap((day) => arr(day?.evidence?.domains))
      ),
      eventTypes: uniq(
        sorted.flatMap((day) => arr(day?.evidence?.eventTypes))
      ),
      recentEventCount: sorted.reduce(
        (sum, day) => sum + n(day?.evidence?.recentEventCount),
        0
      ),
      newTimelineEventCount: sorted.reduce(
        (sum, day) => sum + n(day?.evidence?.newTimelineEventCount),
        0
      ),
    },

    surfaces: {
      dormantToLiveCount: sorted.reduce(
        (sum, day) => sum + n(day?.surfaces?.dormantToLiveCount),
        0
      ),
      liveToDormantCount: sorted.reduce(
        (sum, day) => sum + n(day?.surfaces?.liveToDormantCount),
        0
      ),
      freshDiscoveryCount: sorted.reduce(
        (sum, day) => sum + n(day?.surfaces?.freshDiscoveryCount),
        0
      ),
    },

    onchain: {
      movementSweeps: sorted.reduce(
        (sum, day) => sum + n(day?.onchain?.movementSweeps),
        0
      ),
      totalNewExternalTransfers: sorted.reduce(
        (sum, day) => sum + n(day?.onchain?.totalNewExternalTransfers),
        0
      ),
      totalNewExternalRecipients: sorted.reduce(
        (sum, day) => sum + n(day?.onchain?.totalNewExternalRecipients),
        0
      ),
      lastRecipientLedger: sorted.at(-1)?.onchain?.lastRecipientLedger || null,
    },
  };
}

async function main() {
  await fs.ensureDir(PUBLIC_DATA);

  const daily = await readJson(DAILY_FILE, { days: [] });
  const previous = await readJson(OUTPUT_FILE, { months: [] });

  const grouped = new Map();

  for (const day of arr(daily?.days)) {
    const month = monthKey(day?.date);
    if (!month) continue;
    if (!grouped.has(month)) grouped.set(month, []);
    grouped.get(month).push(day);
  }

  const rebuiltMonths = [...grouped.entries()].map(([month, days]) =>
    buildMonthlySummary(month, days)
  );

  const merged = new Map();

  for (const month of arr(previous?.months)) {
    if (month?.month) merged.set(month.month, month);
  }

  for (const month of rebuiltMonths) {
    merged.set(month.month, month);
  }

  const months = [...merged.values()].sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  const output = {
    version: 1,
    updatedAt: new Date().toISOString(),
    monthCount: months.length,
    firstMonth: months[0]?.month || null,
    lastMonth: months.at(-1)?.month || null,
    months,
  };

  await fs.writeJson(OUTPUT_FILE, output, { spaces: 2 });

  console.log(
    `Historical Monthly Summary v1 | months=${output.monthCount} latest=${output.lastMonth || "none"}`
  );
}

main().catch((error) => {
  console.error("historical-monthly-summary failed:", error);
  process.exit(1);
});