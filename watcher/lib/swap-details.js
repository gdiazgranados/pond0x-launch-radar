"use strict";

const MAX_ITEMS = 100;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Store only public first-party paths, never query strings, bodies or headers.
function responseEvidence(url, target, method, status) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(target).origin) return null;
    const pathname = parsed.pathname
      .replace(/0x[a-f0-9]{40,}/gi, ":address")
      .replace(/[1-9A-HJ-NP-Za-km-z]{32,}/g, ":id")
      .replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, ":id");
    return `${method} ${pathname} → ${status}`;
  } catch { return null; }
}

function normalizeControls(controls) {
  return [...new Set(controls.map((control) => JSON.stringify({
    role: control.role,
    // Suppress balances, prices and counters, retaining alphabetic labels.
    label: control.label.replace(/0x[a-f0-9]{6,}/gi, ":address")
      .replace(/[1-9A-HJ-NP-Za-km-z]{32,}/g, ":id")
      .replace(/\d[\d,.]*/g, "#").replace(/\s+/g, " ").trim().slice(0, 120),
    disabled: control.disabled,
    selected: control.selected,
  })))].sort();
}

function buildDetails(previous, observation, controls, responses, truncated) {
  const compatible = previous?.version === 1 && previous.target === observation.target;
  const baseline = compatible ? previous.lastSuccessful : null;
  const latest = {
    checkedAt: observation.checkedAt,
    status: observation.status === "OBSERVED" ? (truncated ? "INCOMPLETE" : "OBSERVED") : observation.status,
    controls: normalizeControls(controls).slice(0, MAX_ITEMS),
    responses: [...new Set(responses)].sort().slice(0, MAX_ITEMS),
    truncated,
  };
  const age = Date.parse(latest.checkedAt) - Date.parse(baseline?.checkedAt);
  const comparable = baseline?.status === "OBSERVED" && Number.isFinite(age) && age >= 0 && age <= MAX_AGE_MS;
  const comparison = { state: latest.status, baselineAt: baseline?.checkedAt || null };
  if (latest.status === "OBSERVED") {
    comparison.state = comparable ? "UNCHANGED" : "BASELINE";
    if (comparable) {
      for (const key of ["controls", "responses"]) {
        comparison[key] = {
          added: latest[key].filter(item => !baseline[key].includes(item)),
          removed: baseline[key].filter(item => !latest[key].includes(item)),
        };
        if (comparison[key].added.length || comparison[key].removed.length) comparison.state = "CHANGED";
      }
    } else comparison.reason = "No compatible successful observation within six hours.";
  }
  const event = { observedAt: latest.checkedAt, comparison };
  return {
    version: 1, target: observation.target,
    scope: "Visible controls and first-party fetch/XHR responses during initial page load; no clicks or extra requests. Numbers in labels are normalized. Missing requests may reflect timing or caching, not removed endpoints.",
    latest, comparison,
    lastSuccessful: latest.status === "OBSERVED" ? latest : baseline || null,
    history: [...(compatible && Array.isArray(previous.history) ? previous.history : []), { latest, comparison }].slice(-48),
    changes: [...(compatible && Array.isArray(previous.changes) ? previous.changes : []), ...(comparison.state === "CHANGED" ? [event] : [])].slice(-48),
  };
}

module.exports = { MAX_ITEMS, responseEvidence, normalizeControls, buildDetails };
