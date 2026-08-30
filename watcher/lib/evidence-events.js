"use strict";
const { createHash } = require("node:crypto");
const HOUR = 3600000;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
const iso = value => new Date(value).toISOString();
const array = value => Array.isArray(value) ? value : [];
const fresh = (value, now) => Number.isFinite(Date.parse(value)) && Date.parse(value) <= now && now - Date.parse(value) <= 90 * 60000;

// Pure evaluation. No transport, credentials, filesystem, or browser-side scoring.
function evaluateEvidence({ chain = {}, latest = {}, previous = {}, now = Date.now(), chainOnly = false }) {
  const state = structuredClone(previous);
  state.seen = state.seen || {};
  // Keep transfer identities longer than the producer's maximum 24-hour fetch horizon.
  for (const [key, time] of Object.entries(state.seen)) if (now - time > 48 * HOUR) delete state.seen[key];
  const window = chain.alertWindow;
  const end = Date.parse(window?.endAt);
  const start = Date.parse(window?.startAt);
  const chainIssues = [];
  if (!window || !fresh(window.endAt, now) || !Number.isFinite(start) || start > end) chainIssues.push("Missing or stale chain interval");
  if (window?.coverageComplete !== true) chainIssues.push("Incomplete chain coverage");
  if (window?.truncated) chainIssues.push("History gap exceeds the 24-hour fetch horizon");
  if (!window?.evidence) chainIssues.push("Exact transfer evidence unavailable");
  const duplicate = Number.isFinite(end) && end <= Date.parse(state.chainProcessedThrough || "");
  const transfers = [];
  let invalid = false;
  if (chainIssues.length === 0 && !duplicate) {
    for (const kind of ["rewards", "funding", "external"]) {
      for (const row of array(window.evidence[kind])) {
        const time = Number(row.timestamp) * 1000;
        const amount = Number(row.amount);
        if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(row.signature || "") ||
            !row.from || !row.to || !row.mint || !Number.isInteger(row.transferIndex) ||
            !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(time) || time <= start || time > end) {
          invalid = true; continue;
        }
        const key = `${row.signature}:${row.transferIndex}`;
        if (state.seen[key]) continue;
        state.seen[key] = time;
        transfers.push({ id: key, kind, signature: row.signature, transferIndex: row.transferIndex,
          from: row.from, to: row.to, mint: row.mint, amount, occurredAt: iso(time),
          explorerUrl: `https://solscan.io/tx/${row.signature}` });
      }
    }
    if (invalid) chainIssues.push("Incomplete or invalid transfer evidence");
    // Never advance past incomplete coverage, truncated history, or invalid evidence.
    if (!invalid) state.chainProcessedThrough = window.endAt;
    else { state.seen = structuredClone(previous.seen || {}); transfers.length = 0; }
  }

  const webFresh = !chainOnly && fresh(latest.generatedAt, now);
  const feature = latest.featureActivationEvidence || {};
  const comparable = feature.comparable === true;
  const webChanges = [];
  const relevant = /reward|claim|portal|auth|account|connect/i;
  if (webFresh && comparable && latest.generatedAt !== state.webProcessedThrough) {
    for (const row of array(feature.activatedRoutes)) {
      if (relevant.test(row.route || "") && Number.isInteger(row.previousStatus) &&
          (row.previousStatus < 200 || row.previousStatus >= 400) &&
          Number.isInteger(row.currentStatus) && row.currentStatus >= 200 && row.currentStatus < 300) {
        webChanges.push({ kind: "route_reachable", target: row.route, before: row.previousStatus, after: row.currentStatus });
      }
    }
    for (const name of array(feature.unlockedFlags)) {
      if (typeof name === "string" && relevant.test(name)) webChanges.push({ kind: "flag_unlocked", target: name, before: true, after: false });
    }
    state.webProcessedThrough = latest.generatedAt;
  }
  const webStatus = chainOnly ? "NOT_EVALUATED" : !webFresh ? "STALE_OR_MISSING" : !comparable ? "BASELINE_ONLY" : webChanges.length ? "CHANGE_OBSERVED" : "NO_NEW_CHANGE";
  const chainStatus = chainIssues.length ? "INCOMPLETE" : transfers.length ? "TRANSFERS_OBSERVED" : "NO_NEW_TRANSFERS";
  const context = { chainStatus, webStatus, chainObservedAt: window?.endAt || null,
    webObservedAt: latest.generatedAt || null, claimsAvailable: "NOT_CONFIRMED" };
  const events = [];
  function event(kind, evidence, interval, eligible, reason) {
    const id = hash([kind, interval, evidence]);
    const record = { id, version: 1, kind, observedAt: iso(now), interval, context: { ...context },
      evidence, decision: { eligible, reason, ruleVersion: "evidence-v1" },
      delivery: { status: "OBSERVATION_ONLY", sentAt: null },
      detailPath: `/events/${id}` };
    record.message = formatEvidenceMessage(record);
    events.push(record);
  }
  if (transfers.length) {
    const rewardCount = transfers.filter(row => row.kind === "rewards").length;
    const eligible = rewardCount >= 3 || transfers.some(row => row.kind !== "rewards");
    event("FUNDS_MOVEMENT", { transfers }, { startAt: window.startAt, endAt: window.endAt }, eligible,
      eligible ? "New funding, external transfer, or at least three reward-wallet transfers" : "Below the three-transfer reward summary threshold; retained as evidence");
  }
  if (webChanges.length) event("WEB_CHANGE", { changes: webChanges, snapshotId: latest.id || null,
    previousBuildId: feature.previousBuildId || null, currentBuildId: feature.currentBuildId || null },
    { startAt: previous.webProcessedThrough || latest.generatedAt, endAt: latest.generatedAt }, true,
    "Observed access or flag transition; claim availability is not established");
  // Temporal co-occurrence is context, never proof of causality or an extra notification.
  if (transfers.length && webChanges.length && Math.abs(end - Date.parse(latest.generatedAt)) <= 15 * 60000) {
    for (const record of events) {
      record.context.coObserved = true;
      record.context.correlation = "Same sweep, within 15 minutes; causal relationship not established";
      record.message = formatEvidenceMessage(record);
    }
  }
  const issues = [...chainIssues, ...(!chainOnly && !webFresh ? ["Web evidence stale or missing"] : [])];
  const sweepId = hash([window?.endAt || null, chainOnly ? null : latest.generatedAt || null]);
  if (state.lastHealthSweep !== sweepId) {
    state.badSweeps = issues.length ? (state.badSweeps || 0) + 1 : 0;
    state.lastHealthSweep = sweepId;
  }
  const incident = issues.length ? hash(issues) : null;
  if (issues.length && state.badSweeps >= 2 && state.healthIncident !== incident) {
    event("MONITORING_PROBLEM", { issues }, { startAt: previous.healthObservedAt || iso(now), endAt: iso(now) }, true,
      "Monitoring problem persisted across at least two distinct samples");
    state.healthIncident = incident;
  }
  if (!issues.length) state.healthIncident = null;
  state.healthObservedAt = iso(now);
  return { version: 1, mode: "OBSERVATION_ONLY", generatedAt: iso(now), context, issues, events, state };
}

function formatEvidenceMessage(event) {
  const titles = { FUNDS_MOVEMENT: "Confirmed transfer evidence", WEB_CHANGE: "Observed web change", MONITORING_PROBLEM: "Monitoring problem" };
  const rows = array(event.evidence.transfers);
  const lines = [titles[event.kind], `Interval: ${event.interval.startAt} — ${event.interval.endAt}`];
  if (rows.length) {
    lines.push(`New transfers: ${rows.length}`);
    // Group amounts by mint: never mix tokens or cumulative recipient balances.
    for (const mint of [...new Set(rows.map(row => row.mint))]) {
      lines.push(`Amount (${mint}): ${rows.filter(row => row.mint === mint).reduce((sum, row) => sum + row.amount, 0)}`);
    }
  }
  if (event.evidence.changes) lines.push(`Web transitions: ${event.evidence.changes.length}`);
  if (event.evidence.issues) lines.push(...event.evidence.issues);
  lines.push(`Web: ${event.context.webStatus}`, "Claims available: NOT CONFIRMED");
  if (event.context.coObserved) lines.push(event.context.correlation);
  lines.push(`Evidence: https://pond0x-launch-radar.vercel.app${event.detailPath}`);
  return lines.join("\n");
}
module.exports = { evaluateEvidence, formatEvidenceMessage };
