const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { evaluateEvidence, formatEvidenceMessage } = require('../lib/evidence-events');
const { buildChainAlertWindow } = require('../lib/chain-alert-window');
const { run } = require('../evidence-observe');
const now = Date.parse('2026-08-30T18:00:00Z');
const endAt = new Date(now).toISOString();
const startAt = '2026-08-30T17:00:00Z';
function transfer(index = 0, changes = {}) {
  return { signature: 'A'.repeat(88), transferIndex: index, from: 'distributor', to: 'rewards', mint: 'mint',
    timestamp: (now - 20 * 60000) / 1000, amount: 2, ...changes };
}
function input(rows = [], overrides = {}) {
  return { now, chain: { alertWindow: buildChainAlertWindow({ rewardTransfers: rows, funding: [],
    previous: { processedThrough: startAt }, endAt, coverageComplete: true }) },
    latest: { generatedAt: endAt, featureActivationEvidence: { comparable: true } }, ...overrides };
}
test('hourly sample groups exact evidence missed by the rolling five-minute view', () => {
  const result = evaluateEvidence(input([transfer(0), transfer(1), transfer(2)]));
  const event = result.events[0];
  assert.equal(event.decision.eligible, true);
  assert.equal(event.evidence.transfers.length, 3);
  assert.match(event.message, /New transfers: 3/);
  assert.equal(event.message, formatEvidenceMessage(event));
  assert.equal(event.delivery.status, 'OBSERVATION_ONLY');
  assert.equal(event.context.claimsAvailable, 'NOT_CONFIRMED');
});
test('below-threshold activity is preserved and is never called delivered', () => {
  const event = evaluateEvidence(input([transfer()])).events[0];
  assert.equal(event.decision.eligible, false);
  assert.equal(event.delivery.sentAt, null);
});
test('duplicate RPC rows collapse; identical transfers at distinct instruction indices survive', () => {
  const result = evaluateEvidence(input([transfer(0), transfer(0), transfer(1)]));
  assert.equal(result.events[0].evidence.transfers.length, 2);
});
test('repeated or overlapping samples never recount an already seen transfer', () => {
  const args = input([transfer()]); const first = evaluateEvidence(args);
  assert.equal(evaluateEvidence({ ...args, previous: first.state }).events.length, 0);
  args.chain.alertWindow.endAt = new Date(now + 60000).toISOString();
  const next = evaluateEvidence({ ...args, now: now + 60000, previous: first.state });
  assert.equal(next.events.length, 0);
});
test('incomplete coverage, stale data and truncated gaps preserve cursor and cannot trigger funds alerts', () => {
  for (const change of [{ coverageComplete: false }, { truncated: true }, { endAt: '2026-08-30T15:00:00Z' }, { evidence: null }]) {
    const args = input([transfer()]); Object.assign(args.chain.alertWindow, change);
    const result = evaluateEvidence(args);
    assert.equal(result.state.chainProcessedThrough, undefined);
    assert.equal(result.events.length, 0);
    assert.ok(result.issues.length);
  }
});
test('invalid evidence does not partially advance or quietly drop transactions', () => {
  const result = evaluateEvidence(input([transfer(), transfer(1, { signature: '' })]));
  assert.equal(result.events.length, 0);
  assert.equal(result.state.chainProcessedThrough, undefined);
  assert.deepEqual(result.state.seen, {});
});
test('predictions, high scores and reward keywords alone never qualify', () => {
  const args = input();
  args.chain.predictor = { status: 'IN_FUNDING_WINDOW' };
  args.chain.patternMatch = { historicalPatternMatchPct: 99 };
  Object.assign(args.latest, { score: 180, level: 'CRITICAL', launchImminent: true, signals: ['reward', 'claim'] });
  assert.equal(evaluateEvidence(args).events.length, 0);
});
test('functional web transition qualifies; unprobed route and baseline do not', () => {
  const args = input();
  args.latest.featureActivationEvidence.activatedRoutes = [{ route: '/claim', previousStatus: 404, currentStatus: 200 }];
  const result = evaluateEvidence(args);
  assert.equal(result.events[0].kind, 'WEB_CHANGE');
  assert.equal(evaluateEvidence({ ...args, previous: result.state }).events.length, 0);
  args.latest.featureActivationEvidence.activatedRoutes[0].previousStatus = null;
  assert.equal(evaluateEvidence(args).events.length, 0);
  args.latest.featureActivationEvidence.comparable = false;
  assert.equal(evaluateEvidence(args).events.length, 0);
});
test('co-observation is context, not causal confirmation or a third alert', () => {
  const args = input([transfer()]);
  args.latest.featureActivationEvidence.unlockedFlags = ['claimDisabled'];
  const result = evaluateEvidence(args);
  assert.equal(result.events.length, 2);
  for (const event of result.events) {
    assert.equal(event.context.coObserved, true);
    assert.match(event.message, /causal relationship not established/);
  }
});
test('stale web is unknown, not unchanged, while chain evidence remains eligible', () => {
  const args = input([transfer(0), transfer(1), transfer(2)]);
  args.latest.generatedAt = '2026-08-29T18:00:00Z';
  const event = evaluateEvidence(args).events[0];
  assert.equal(event.context.webStatus, 'STALE_OR_MISSING');
  assert.equal(event.decision.eligible, true);
});
test('funding and external evidence qualifies without using cumulative wallet balances', () => {
  for (const kind of ['funding', 'external']) {
    const args = input(); args.chain.alertWindow.evidence[kind] = [transfer(0, { amount: 7 })];
    const event = evaluateEvidence(args).events[0];
    assert.equal(event.decision.eligible, true); assert.match(event.message, /Amount \(mint\): 7/);
  }
});
test('persistent health incident requires distinct samples and only creates one incident', () => {
  const args = input(); args.chain.alertWindow.coverageComplete = false;
  const first = evaluateEvidence(args);
  assert.equal(first.events.length, 0);
  assert.equal(evaluateEvidence({ ...args, previous: first.state }).events.length, 0);
  args.chain.alertWindow.endAt = new Date(now + 60000).toISOString();
  const second = evaluateEvidence({ ...args, now: now + 60000, previous: first.state });
  assert.equal(second.events[0].kind, 'MONITORING_PROBLEM');
  args.chain.alertWindow.endAt = new Date(now + 120000).toISOString();
  assert.equal(evaluateEvidence({ ...args, now: now + 120000, previous: second.state }).events.length, 0);
});
test('chain-only sweep does not re-evaluate old web data', () => {
  const args = input(); args.latest.featureActivationEvidence.unlockedFlags = ['claimDisabled'];
  const result = evaluateEvidence({ ...args, chainOnly: true });
  assert.equal(result.context.webStatus, 'NOT_EVALUATED');
  assert.equal(result.events.length, 0);
});
test('pipeline publishes matching preview and event archive; retry does not duplicate', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-evidence-'));
  try {
    const args = input([transfer(0), transfer(1), transfer(2)]);
    await fs.writeFile(path.join(dir, 'chain-intelligence.json'), JSON.stringify(args.chain));
    await fs.writeFile(path.join(dir, 'latest.json'), JSON.stringify(args.latest));
    const first = await run({ dataDir: dir, now });
    const archived = JSON.parse(await fs.readFile(path.join(dir, 'evidence-events', `${first.events[0].id}.json`)));
    const ledger = JSON.parse(await fs.readFile(path.join(dir, 'evidence-ledger.json')));
    assert.deepEqual(ledger.events[0], archived);
    await run({ dataDir: dir, now });
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'evidence-ledger.json'))).events.length, 1);
    // Corrupt state fails closed instead of resetting deduplication.
    await fs.writeFile(path.join(dir, 'evidence-state.json'), '{broken');
    await assert.rejects(run({ dataDir: dir, now }));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('retired entrypoints cannot send even when Telegram credentials are present', () => {
  for (const file of ['notify.js', 'chain-notify.js']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', file)], {
      env: { ...process.env, TELEGRAM_TOKEN: 'test-only', TELEGRAM_CHAT_ID: 'test-only' }, encoding: 'utf8' });
    assert.equal(result.status, 0); assert.match(result.stdout, /disabled/);
  }
});
test('historical aggregates cannot masquerade as an exact zero-alert backtest', () => {
  const { replay } = require('../replay-evidence');
  const report = replay([{ generatedAt: endAt, rewardTransfers1h: 5 }]);
  assert.equal(report.exactHistoricalAlertCount, null);
  assert.equal(report.unsupported, 1);
  assert.equal(report.messagesSent, 0);
});
test('retry after partial persistence preserves immutable event and preview identity', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-retry-'));
  try {
    const args = input([transfer(0), transfer(1), transfer(2)]);
    await fs.writeFile(path.join(dir, 'chain-intelligence.json'), JSON.stringify(args.chain));
    await fs.writeFile(path.join(dir, 'latest.json'), JSON.stringify(args.latest));
    const first = await run({ dataDir: dir, now });
    await fs.rm(path.join(dir, 'evidence-state.json'));
    await fs.rm(path.join(dir, 'evidence-ledger.json'));
    const retry = await run({ dataDir: dir, now: now + 60000 });
    assert.deepEqual(retry.events[0], first.events[0]);
    const sweeps = await fs.readdir(path.join(dir, 'evidence-sweeps'));
    assert.equal(sweeps.length, 1);
    const sample = JSON.parse(await fs.readFile(path.join(dir, 'evidence-sweeps', sweeps[0])));
    assert.equal(require('../replay-evidence').replay([sample]).exactHistoricalAlertCount, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
