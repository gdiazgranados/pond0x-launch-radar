"use strict";

const { arr, n } = require("./runtime-data");

function evidenceReasons(entry) {
  if (!entry) return [];

  const reasons = [];

  if (
    entry?.states?.decision &&
    entry.states.decision !== "QUIET"
  ) {
    reasons.push(`decision_${entry.states.decision}`);
  }

  if (n(entry?.scores?.radar) > 0) {
    reasons.push("radar_score_positive");
  }

  if (n(entry?.scores?.correlation) > 0) {
    reasons.push("correlation_positive");
  }

  if (n(entry?.scores?.evidenceConfidence) > 0) {
    reasons.push("evidence_confidence_positive");
  }

  if (entry?.gates?.activationTransition === true) {
    reasons.push("activation_transition");
  }

  if (entry?.gates?.runtimeEvidence === true) {
    reasons.push("runtime_evidence");
  }

  if (entry?.gates?.distributionEvidence === true) {
    reasons.push("distribution_evidence");
  }

  if (entry?.onchain?.movement === true) {
    reasons.push("onchain_movement");
  }

  if (arr(entry?.surfaces?.dormantToLive).length) {
    reasons.push("dormant_to_live");
  }

  if (arr(entry?.surfaces?.freshDiscoveries).length) {
    reasons.push("fresh_discovery");
  }

  if (arr(entry?.evidence?.recentEvents).length) {
    reasons.push("recent_evidence_event");
  }

  return [...new Set(reasons)];
}

function selectSnapshotRetention({
  snapshotIds,
  archiveEntries,
  currentId,
  keepCount = 10,
}) {
  const archiveBySnapshot = new Map(
    arr(archiveEntries)
      .filter((entry) => entry?.snapshotId)
      .map((entry) => [entry.snapshotId, entry])
  );

  const rows = snapshotIds.map((snapshotId) => ({
    snapshotId,
    current: snapshotId === currentId,
    reasons: evidenceReasons(
      archiveBySnapshot.get(snapshotId)
    ),
  }));

  const newestQuietBaseline =
    rows
      .filter(
        (row) =>
          !row.current &&
          row.reasons.length === 0
      )
      .at(-1)?.snapshotId || null;

  const keep = new Set();

  if (
    currentId &&
    snapshotIds.includes(currentId)
  ) {
    keep.add(currentId);
  }

  if (newestQuietBaseline) {
    keep.add(newestQuietBaseline);
  }

  for (
    const row of rows
      .filter((row) => row.reasons.length > 0)
      .reverse()
  ) {
    if (keep.size >= keepCount) break;
    keep.add(row.snapshotId);
  }

  for (const snapshotId of [...snapshotIds].reverse()) {
    if (keep.size >= keepCount) break;
    keep.add(snapshotId);
  }

  return {
    keep,
    deleteCandidates:
      snapshotIds.filter(
        (snapshotId) => !keep.has(snapshotId)
      ),
    newestQuietBaseline,
    archiveBySnapshot,
  };
}

module.exports = {
  evidenceReasons,
  selectSnapshotRetention,
};