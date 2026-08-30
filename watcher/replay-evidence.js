"use strict";
const fs = require('node:fs/promises');
const { evaluateEvidence } = require('./lib/evidence-events');
// Input: an array of {chain, latest, observedAt}. Legacy rolling aggregates cannot
// establish exact notification evidence and are reported as unsupported, not zero alerts.
function replay(samples) {
  if (!Array.isArray(samples)) throw new Error('Expected an array of captured sweeps');
  let previous = {}; let supported = 0; let unsupported = 0;
  const events = [];
  for (const sample of [...samples].sort((a, b) => Date.parse(a.observedAt || a.generatedAt) - Date.parse(b.observedAt || b.generatedAt))) {
    const now = Date.parse(sample.observedAt || sample.generatedAt);
    if (!sample.chain?.alertWindow?.evidence || !Number.isFinite(now)) { unsupported++; continue; }
    const result = evaluateEvidence({ chain: sample.chain, latest: sample.latest || {}, previous, now, chainOnly: sample.chainOnly === true });
    previous = result.state; supported++; events.push(...result.events);
  }
  return { mode: 'REPLAY_ONLY', samples: samples.length, supported, unsupported,
    exactHistoricalAlertCount: unsupported ? null : events.filter(event => event.decision.eligible).length,
    eligibleEventsInSupportedSamples: events.filter(event => event.decision.eligible).length,
    messagesSent: 0, limitation: unsupported ? 'Missing exact sweep evidence; no exact total can be inferred from rolling aggregates.' : null };
}
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node watcher/replay-evidence.js <sweeps.json>'); process.exitCode = 1; }
  else fs.stat(file).then(async stat => stat.isDirectory()
    ? Promise.all((await fs.readdir(file)).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await fs.readFile(require('node:path').join(file, name), 'utf8'))))
    : JSON.parse(await fs.readFile(file, 'utf8')))
    .then(samples => console.log(JSON.stringify(replay(samples), null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { replay };
