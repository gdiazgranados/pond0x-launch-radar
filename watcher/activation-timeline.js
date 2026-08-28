"use strict";

const fs = require("fs-extra");
const path = require("path");
const { buildEvidenceConfidence } = require("./lib/evidence-confidence");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "activation-timeline.json");
const STATE_FILE = path.join(PUBLIC_DATA, "activation-timeline-state.json");
const MAX_EVENTS = 300;
const RECENT_WINDOW_MS = 60 * 60 * 1000;

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function n(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
async function readJson(file, fallback) { try { return await fs.readJson(file); } catch { return fallback; } }
function latestSnapshotDir() {
  const root = path.join(process.cwd(), "snapshots");
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
  return dirs[0] ? path.join(root, dirs[0]) : null;
}
function eventId(event) { return [event.type, event.domain, event.subject || "", event.seenAt || ""].join("|"); }
function pushUnique(events, event, seenIds) {
  if (!event?.type || !event?.seenAt) return;
  const id = eventId(event);
  if (seenIds.has(id)) return;
  seenIds.add(id);
  events.push({ id, ...event });
}
function flagTransitionType(name, before, after) {
  const lockedStyle = /^locked/i.test(name) || /^lock[A-Z_]/.test(name);
  const unlockStyle = /^unlock/i.test(name);
  if (lockedStyle && before === true && after === false) return "FLAG_UNLOCKED";
  if (lockedStyle && before === false && after === true) return "FLAG_LOCKED";
  if (unlockStyle && before === false && after === true) return "FLAG_UNLOCKED";
  if (unlockStyle && before === true && after === false) return "FLAG_LOCKED";
  return "FLAG_VALUE_CHANGED";
}
function eventWeight(event) {
  switch (event.type) {
    case "FLAG_UNLOCKED": return 22;
    case "API_DORMANT_TO_LIVE": return 22;
    case "ROUTE_DORMANT_TO_LIVE": return 18;
    case "DISTRIBUTOR_TRANSFER": return 20;
    case "NEW_RECIPIENT": return 16;
    case "SEMANTIC_MATERIAL_CHANGE": return 14;
    case "ONCHAIN_ACTIVITY": return 12;
    case "FLAG_VALUE_CHANGED": return 10;
    case "FLAG_LOCKED": return 6;
    case "API_LIVE_TO_DORMANT": return 4;
    case "ROUTE_LIVE_TO_DORMANT": return 3;
    default: return 1;
  }
}

async function main() {
  const snapshotDir = latestSnapshotDir();
  if (!snapshotDir) throw new Error("No snapshot available for activation timeline");
  const manifest = await readJson(path.join(snapshotDir, "manifest.json"), {});
  const routeApi = await readJson(path.join(PUBLIC_DATA, "route-api-intelligence.json"), {});
  const chain = await readJson(path.join(PUBLIC_DATA, "chain-intelligence.json"), {});
  const recipients = await readJson(path.join(PUBLIC_DATA, "reward-recipients.json"), {});
  const state = await readJson(STATE_FILE, { flags: {}, events: [] });
  const checkedAt = new Date().toISOString();
  const snapshotId = path.basename(snapshotDir);
  const currentFlags = manifest?.featureSurface?.flags || {};
  const nextFlags = { ...(state.flags || {}) };
  const newEvents = [];
  const allEvents = ensureArray(state.events).slice();
  const seenIds = new Set(allEvents.map((event) => event.id || eventId(event)));

  for (const [name, flag] of Object.entries(currentFlags)) {
    if (flag?.observed !== true || typeof flag?.value !== "boolean") continue;
    const previous = nextFlags[name] || null;
    const currentValue = flag.value;
    if (!previous) {
      nextFlags[name] = { name, value: currentValue, firstSeenAt: checkedAt, lastSeenAt: checkedAt, lastTransitionAt: null, transitionCount: 0 };
      continue;
    }
    const changed = previous.value !== currentValue;
    nextFlags[name] = { ...previous, value: currentValue, lastSeenAt: checkedAt, lastTransitionAt: changed ? checkedAt : previous.lastTransitionAt || null, transitionCount: n(previous.transitionCount) + (changed ? 1 : 0) };
    if (changed) {
      const event = { type: flagTransitionType(name, previous.value, currentValue), domain: "featureFlag", subject: name, seenAt: checkedAt, snapshotId, previous: previous.value, current: currentValue, detail: `${name}: ${previous.value} -> ${currentValue}` };
      pushUnique(newEvents, event, seenIds); allEvents.push({ id: eventId(event), ...event });
    }
  }

  for (const transition of ensureArray(routeApi?.dormantToLive)) {
    const isApi = transition.kind === "API";
    const event = { type: isApi ? "API_DORMANT_TO_LIVE" : "ROUTE_DORMANT_TO_LIVE", domain: isApi ? "api" : "route", subject: transition.route, seenAt: transition.lastSeenAt || routeApi.checkedAt || checkedAt, snapshotId, status: transition.lastStatus ?? null, runtimeObserved: transition.runtimeObserved === true, detail: `${transition.kind || "ROUTE"} ${transition.route} became live` };
    pushUnique(newEvents, event, seenIds); allEvents.push({ id: eventId(event), ...event });
  }
  for (const transition of ensureArray(routeApi?.liveToDormant)) {
    const isApi = transition.kind === "API";
    const event = { type: isApi ? "API_LIVE_TO_DORMANT" : "ROUTE_LIVE_TO_DORMANT", domain: isApi ? "api" : "route", subject: transition.route, seenAt: transition.lastSeenAt || routeApi.checkedAt || checkedAt, snapshotId, status: transition.lastStatus ?? null, runtimeObserved: transition.runtimeObserved === true, detail: `${transition.kind || "ROUTE"} ${transition.route} became dormant` };
    pushUnique(newEvents, event, seenIds); allEvents.push({ id: eventId(event), ...event });
  }

  const bundleDiff = manifest?.featureSurfaceDrift?.bundleDiff || {};
  const semanticSignals = [...ensureArray(bundleDiff.addedApiRoutes), ...ensureArray(bundleDiff.addedKeywords), ...ensureArray(bundleDiff.addedFlags)];
  if (bundleDiff.status === "DRIFT" && semanticSignals.length > 0) {
    const event = { type: "SEMANTIC_MATERIAL_CHANGE", domain: "semantic", subject: "first-party-bundles", seenAt: checkedAt, snapshotId, detail: semanticSignals.slice(0, 8).join(", ") };
    pushUnique(newEvents, event, seenIds); allEvents.push({ id: eventId(event), ...event });
  }

  const newTransfers = n(recipients?.newTransfersThisSweep ?? chain?.recipientLedger?.newTransfersThisSweep);
  const newRecipients = n(recipients?.newRecipientsThisSweep ?? chain?.recipientLedger?.newRecipientsThisSweep);
  const chainSeenAt = recipients?.lastObservedAt || chain?.recipientLedger?.lastObservedAt || chain?.recentExternalClaims?.[0]?.time || chain?.recentExternalClaims?.[0]?.timestamp || chain?.generatedAt || checkedAt;
  if (newTransfers > 0) {
    const event = { type: "DISTRIBUTOR_TRANSFER", domain: "distributor", subject: chain?.entities?.claimDistributor || null, seenAt: chainSeenAt, snapshotId, count: newTransfers, detail: `${newTransfers} new external distributor transfer(s) observed` };
    pushUnique(newEvents, event, seenIds); allEvents.push({ id: eventId(event), ...event });
  }
  if (newRecipients > 0) {
    const event = { type: "NEW_RECIPIENT", domain: "recipients", subject: null, seenAt: chainSeenAt, snapshotId, count: newRecipients, detail: `${newRecipients} new recipient(s) observed` };
    pushUnique(newEvents, event, seenIds); allEvents.push({ id: eventId(event), ...event });
  }
  const rewardTransfers5m = n(chain?.windows?.["5m"]?.rewardTransfers ?? chain?.windows?.["5m"]?.rewards);
  const fundingActive = chain?.fundingStatus?.active15m === true || chain?.fundingDetected === true;
  if (rewardTransfers5m > 0 || fundingActive) {
    const event = { type: "ONCHAIN_ACTIVITY", domain: "onchain", subject: null, seenAt: chain?.generatedAt || checkedAt, snapshotId, detail: fundingActive ? `Funding active; reward transfers 5m=${rewardTransfers5m}` : `Reward transfers 5m=${rewardTransfers5m}` };
    pushUnique(newEvents, event, seenIds); allEvents.push({ id: eventId(event), ...event });
  }

  const deduped = [...new Map(allEvents.map((event) => [event.id || eventId(event), event])).values()].sort((a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime()).slice(0, MAX_EVENTS);
  const nowMs = new Date(checkedAt).getTime();
  const recentEvents = deduped.filter((event) => { const ts = new Date(event.seenAt).getTime(); return Number.isFinite(ts) && nowMs - ts >= 0 && nowMs - ts <= RECENT_WINDOW_MS; });
  const recentDomains = [...new Set(recentEvents.map((event) => event.domain).filter(Boolean))];
  const recentScore = Math.min(100, recentEvents.reduce((sum, event) => sum + eventWeight(event), 0));
  const evidenceConfidence = buildEvidenceConfidence(recentEvents);
  const activationLike = recentEvents.some((event) => ["FLAG_UNLOCKED", "API_DORMANT_TO_LIVE", "ROUTE_DORMANT_TO_LIVE"].includes(event.type));
  const distributionLike = recentDomains.includes("distributor") || recentDomains.includes("recipients");
  const classification = activationLike && distributionLike && recentDomains.length >= 4 ? "COORDINATED_ACTIVATION_CANDIDATE" : activationLike && recentDomains.length >= 3 ? "ACTIVATION_SEQUENCE" : activationLike ? "SURFACE_TRANSITION" : recentDomains.length >= 3 ? "MULTI_DOMAIN_ACTIVITY" : recentEvents.length > 0 ? "OBSERVED_ACTIVITY" : "QUIET";

  const result = {
    version: 2.1, checkedAt, snapshotId, classification, score: recentScore, windowMinutes: 60,
    evidenceConfidence,
    flagHistory: { observed: Object.keys(nextFlags).length, transitionsThisSweep: newEvents.filter((event) => event.domain === "featureFlag").length, states: nextFlags },
    dormantActive: { routeTransitionsThisSweep: ensureArray(routeApi?.dormantToLive).filter((x) => x.kind === "ROUTE").length, apiTransitionsThisSweep: ensureArray(routeApi?.dormantToLive).filter((x) => x.kind === "API").length, deactivationsThisSweep: ensureArray(routeApi?.liveToDormant).length },
    recent: { eventCount: recentEvents.length, domainCount: recentDomains.length, domains: recentDomains, events: recentEvents.slice(0, 60) },
    newEvents: newEvents.sort((a, b) => new Date(a.seenAt).getTime() - new Date(b.seenAt).getTime()),
    timeline: deduped.slice(0, 120),
    caution: "Activation timeline and Evidence Confidence are observational. Confidence measures evidence quality, not launch probability, causality, or reward eligibility.",
  };
  await fs.ensureDir(PUBLIC_DATA);
  await fs.writeJson(STATE_FILE, { flags: nextFlags, events: deduped }, { spaces: 2 });
  await fs.writeJson(OUTPUT_FILE, result, { spaces: 2 });
  console.log(`Activation Timeline v2.1 | class=${classification} score=${recentScore} evidence=${evidenceConfidence.score}/${evidenceConfidence.level} domains=${recentDomains.length} newEvents=${newEvents.length}`);
}
main().catch((error) => { console.error("activation-timeline failed:", error); process.exit(1); });
