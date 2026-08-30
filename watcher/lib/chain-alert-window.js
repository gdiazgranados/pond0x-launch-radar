// Notification intervals are separate from the dashboard's rolling 5m metrics.
const HOUR = 60 * 60 * 1000;
const MAX_LOOKBACK = 24 * HOUR;

function buildChainAlertWindow({ rewardTransfers, funding, previous, endAt, coverageComplete }) {
  const end = Date.parse(endAt);
  if (!Number.isFinite(end)) throw new Error('Invalid chain sample cutoff');
  const prior = previous?.processedThrough || previous?.observedAt;
  const parsed = Date.parse(prior);
  const validPrior = Number.isFinite(parsed) && parsed <= end;
  const start = Math.max(validPrior ? parsed : end - HOUR, end - MAX_LOOKBACK);
  const select = rows => (Array.isArray(rows) ? rows : []).filter(row => {
    const timestamp = Number(row.timestamp) * 1000;
    return Number.isFinite(timestamp) && timestamp > start && timestamp <= end;
  });
  const rewards = select(rewardTransfers);
  const funds = select(funding);
  return {
    version: 1,
    startAt: new Date(start).toISOString(),
    endAt,
    minutes: (end - start) / 60000,
    coverageComplete: coverageComplete === true,
    truncated: validPrior && parsed < end - MAX_LOOKBACK,
    initialized: !validPrior,
    rewardTransfers: rewards.length,
    wpondDistributed: rewards.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    fundingEvents: funds.length,
  };
}

function inspectChainAlertWindow(window, previous, now = Date.now()) {
  if (!window || window.version !== 1) throw new Error('Missing chain alert interval');
  const end = Date.parse(window.endAt);
  const start = Date.parse(window.startAt);
  if (!Number.isFinite(end) || !Number.isFinite(start) || start > end ||
      end > now || now - end > 15 * 60000) {
    throw new Error('Invalid or stale chain alert interval');
  }
  const processed = Date.parse(previous?.processedThrough || '');
  if (Number.isFinite(processed) && end <= processed) return { duplicate: true };
  if (window.coverageComplete !== true) throw new Error('Incomplete chain alert coverage; cursor preserved');
  return {
    duplicate: false,
    // Keep the existing periodic summary threshold of three transfers.
    rewardActivity: window.rewardTransfers >= 3,
    fundingActivity: window.fundingEvents > 0,
  };
}

module.exports = { buildChainAlertWindow, inspectChainAlertWindow };
