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
