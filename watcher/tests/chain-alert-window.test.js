const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChainAlertWindow, inspectChainAlertWindow } = require('../lib/chain-alert-window');
const end = Date.parse('2026-08-30T18:00:00Z');
const previous = { processedThrough: '2026-08-30T17:00:00Z' };
const row = (minutes, amount = 2) => ({ timestamp: (end - minutes * 60000) / 1000, amount });
function build(rewardTransfers = [], funding = [], prev = previous) {
  return buildChainAlertWindow({ rewardTransfers, funding, previous: prev,
    endAt: new Date(end).toISOString(), coverageComplete: true });
}

test('hourly sweep sees ten transfers twenty minutes ago', () => {
  const window = build(Array.from({ length: 10 }, () => row(20)));
  assert.equal(window.rewardTransfers, 10);
  assert.equal(window.wpondDistributed, 20);
  assert.equal(inspectChainAlertWindow(window, previous, end).rewardActivity, true);
});
test('interval boundaries exclude already processed and future events', () => {
  assert.equal(build([row(60), row(59), row(0), row(-1)]).rewardTransfers, 2);
});
test('same or older snapshot is not processed twice', () => {
  const window = build([row(20)]);
  assert.equal(inspectChainAlertWindow(window, { processedThrough: window.endAt }, end).duplicate, true);
});
test('funding between sweeps triggers; fewer than three rewards do not', () => {
  const result = inspectChainAlertWindow(build([row(20), row(21)], [row(40)]), previous, end);
  assert.equal(result.rewardActivity, false);
  assert.equal(result.fundingActivity, true);
});
test('migrates observedAt and initializes missing state to one hour', () => {
  assert.equal(build([], [], { observedAt: previous.processedThrough }).minutes, 60);
  assert.equal(build([], [], {}).initialized, true);
  assert.equal(build([], [], {}).minutes, 60);
});
test('long gap is capped and explicitly reported', () => {
  const window = build([row(1500), row(1000)], [], { processedThrough: '2026-08-28T18:00:00Z' });
  assert.equal(window.truncated, true);
  assert.equal(window.minutes, 1440);
  assert.equal(window.rewardTransfers, 1);
});
test('incomplete coverage and stale snapshots cannot advance the cursor', () => {
  assert.throws(() => inspectChainAlertWindow({ ...build(), coverageComplete: false }, previous, end), /coverage/);
  assert.throws(() => inspectChainAlertWindow(build(), previous, end + 16 * 60000), /stale/);
});

// Execute the real notifier with in-memory files and a mock transport.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
async function runNotifier({ transportOk = true, duplicate = false, credentials = true, count = 3, recentAlert = false } = {}) {
  const now = Date.now();
  const cutoff = new Date(now - 1000).toISOString();
  const state = { processedThrough: duplicate ? cutoff : new Date(now - 3600000).toISOString() };
  if (recentAlert) state.lastSentAt = new Date(now - 10 * 60000).toISOString();
  const chain = { generatedAt: cutoff, windows: { '5m': { rewardTransfers: 0 } }, activityState: 'QUIET',
    alertWindow: buildChainAlertWindow({ rewardTransfers: Array.from({ length: count }, () => ({ timestamp: (now - 1200000) / 1000, amount: 1 })),
      funding: [], previous: state, endAt: cutoff, coverageComplete: true }) };
  const writes = []; let sends = 0; let failed = false;
  const mockFs = { pathExists: async () => true, readJson: async p => p.endsWith('chain-intelligence.json') ? chain : p.endsWith('chain-notify-state.json') ? state : {},
    writeJson: async (p, value) => writes.push({ path: p, value }) };
  const context = vm.createContext({ __dirname: '/offline/watcher',
    require: name => {
      if (name === 'fs-extra') return mockFs;
      if (name === 'path') return path;
      if (name === 'dotenv') return { config() {} };
      if (name === './lib/chain-alert-window') return { inspectChainAlertWindow };
      if (name === './lib/distributor-behavior') return { buildDistributorBehavior: () => ({ version: 1, activityState: 'QUIET' }) };
      throw new Error('Unexpected import');
    },
    process: { env: credentials ? { TELEGRAM_TOKEN: 'mock', TELEGRAM_CHAT_ID: 'mock' } : {}, exit() { failed = true; } },
    console: { log() {}, warn() {}, error() {} },
    fetch: async () => { sends++; return { ok: transportOk, text: async () => 'mock failure' }; },
  });
  const source = fs.readFileSync(path.join(__dirname, '../chain-notify.js'), 'utf8');
  vm.runInContext(source.replace('main().catch((e) => {', 'completion = main().catch((e) => {'), context);
  await context.completion;
  return { sends, failed, cursor: writes.find(w => w.path.endsWith('chain-notify-state.json'))?.value.processedThrough };
}
test('notifier sends intermediate activity and advances cursor after delivery', async () => {
  const result = await runNotifier(); assert.equal(result.sends, 1); assert.ok(result.cursor); assert.equal(result.failed, false);
});
test('failed delivery or missing credentials preserves cursor', async () => {
  for (const options of [{ transportOk: false }, { credentials: false }]) {
    const result = await runNotifier(options); assert.equal(result.failed, true); assert.equal(result.cursor, undefined);
  }
});
test('duplicate sample does not send; quiet successful sample advances cursor', async () => {
  assert.equal((await runNotifier({ duplicate: true })).sends, 0);
  const quiet = await runNotifier({ count: 0 }); assert.equal(quiet.sends, 0); assert.ok(quiet.cursor);
});
test('interval summaries retain the thirty-minute cooldown', async () => {
  assert.equal((await runNotifier({ recentAlert: true })).sends, 0);
});
