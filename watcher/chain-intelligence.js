const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const DISTRIBUTOR = 'AYg4dKoZJudVkD7Eu3ZaJjkzfoaATUqfiv8w8pS53opT';
const UPSTREAM = 'BbMgFxZGVq5x6WC1yFeVzgtyckMZgj5FjPwdppMtShf';
const REWARD_WALLET = '1orFCnFfgwPzSgUaoK6Wr3MjgXZ7mtk8NGz9Hh4iWWL';
const WPOND_MINT = '3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq';

const dataDir = path.join(__dirname, '..', 'public', 'data');
const outputFile = path.join(dataDir, 'chain-intelligence.json');
const historyFile = path.join(dataDir, 'chain-history.json');

const CORRELATION_WINDOW_SECONDS = 5 * 60;
const ACTIVE_FUNDING_WINDOW_MINUTES = 15;
const MAX_CYCLES_OUTPUT = 12;

function n(v) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function iso(ts) {
  return new Date(n(ts) * 1000).toISOString();
}

function within(ts, minutes, nowSec) {
  return n(ts) >= nowSec - minutes * 60;
}

function sum(xs, f) {
  return xs.reduce((a, x) => a + n(f(x)), 0);
}

function uniq(xs) {
  return [...new Set(xs.filter(Boolean))];
}

function round(v, d = 3) {
  const p = 10 ** d;
  return Math.round(n(v) * p) / p;
}

function median(values) {
  const xs = values.map(n).filter(Number.isFinite).sort((a, b) => a - b);

  if (!xs.length) return null;

  const mid = Math.floor(xs.length / 2);

  return xs.length % 2
    ? xs[mid]
    : (xs[mid - 1] + xs[mid]) / 2;
}

function stdDev(values) {
  const xs = values.map(n).filter(Number.isFinite);

  if (xs.length < 2) return 0;

  const avg = sum(xs, x => x) / xs.length;
  const variance = sum(xs, x => (x - avg) ** 2) / xs.length;

  return Math.sqrt(variance);
}

async function fetchAddressTransactions(address, limit = 100) {
  if (!HELIUS_API_KEY) {
    throw new Error('HELIUS_API_KEY is missing');
  }

  const url =
    `https://api.helius.xyz/v0/addresses/${address}/transactions` +
    `?api-key=${encodeURIComponent(HELIUS_API_KEY)}&limit=${limit}`;

  const res = await fetch(url, {
    headers: { accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(
      `Helius ${address.slice(0, 6)} failed: ` +
      `${res.status} ${await res.text()}`
    );
  }

  return res.json();
}

function extractTransfers(txs) {
  const out = [];

  for (const tx of Array.isArray(txs) ? txs : []) {
    for (const t of Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : []) {
      if (t.mint !== WPOND_MINT) continue;

      out.push({
        signature: tx.signature,
        timestamp: n(tx.timestamp),
        time: iso(tx.timestamp),
        from: t.fromUserAccount || t.fromTokenAccount || '',
        to: t.toUserAccount || t.toTokenAccount || '',
        amount: n(t.tokenAmount),
        type: tx.type || 'TRANSFER',
        source: tx.source || 'UNKNOWN',
      });
    }
  }

  return out;
}

function stats(claims, minutes, nowSec) {
  const rows = claims.filter(
    x => within(x.timestamp, minutes, nowSec)
  );

  const total = sum(rows, x => x.amount);

  return {
    minutes,
    rewards: rows.length,
    wpondDistributed: round(total),
    uniqueRecipients: uniq(rows.map(x => x.to)).length,
    avgReward: rows.length
      ? round(total / rows.length)
      : 0,
    largestReward: round(
      Math.max(0, ...rows.map(x => x.amount))
    ),
  };
}

/*
 * Build funding -> distribution cycles.
 *
 * A cycle starts with an UPSTREAM -> DISTRIBUTOR wPOND funding event.
 *
 * Claims are attached to the nearest preceding funding event until:
 *
 * 1. another funding event arrives, or
 * 2. the 5-minute correlation window expires.
 *
 * This prevents the same claim from being counted in multiple cycles.
 */
function buildDistributionCycles(funding, claims) {
  const f = [...funding].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const c = [...claims].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const cycles = [];

  for (let i = 0; i < f.length; i++) {
    const fundingEvent = f[i];

    const nextFundingTs =
      f[i + 1]?.timestamp || Infinity;

    const hardEnd =
      fundingEvent.timestamp + CORRELATION_WINDOW_SECONDS;

    const cycleEnd =
      Math.min(nextFundingTs, hardEnd);

    const cycleClaims = c.filter(
      x =>
        x.timestamp >= fundingEvent.timestamp &&
        x.timestamp < cycleEnd
    );

    const distributed =
      sum(cycleClaims, x => x.amount);

    const recipients =
      uniq(cycleClaims.map(x => x.to));

    const delays =
      cycleClaims.map(
        x => x.timestamp - fundingEvent.timestamp
      );

    const firstDelay =
      delays.length
        ? Math.min(...delays)
        : null;

    const lastDelay =
      delays.length
        ? Math.max(...delays)
        : null;

    cycles.push({
      fundingSignature: fundingEvent.signature,
      fundingTime: fundingEvent.time,
      fundingTimestamp: fundingEvent.timestamp,
      fundingAmount: round(fundingEvent.amount),
      fundingSource: fundingEvent.source,

      claimCount: cycleClaims.length,
      uniqueRecipients: recipients.length,

      distributedAmount: round(distributed),

      distributionRatioPct:
        fundingEvent.amount
          ? round(
              (distributed / fundingEvent.amount) * 100,
              2
            )
          : null,

      firstClaimDelaySeconds: firstDelay,
      lastClaimDelaySeconds: lastDelay,

      correlated: cycleClaims.length > 0,

      claims: cycleClaims.map(x => ({
        signature: x.signature,
        time: x.time,
        timestamp: x.timestamp,
        to: x.to,
        amount: round(x.amount),
        delaySeconds:
          x.timestamp - fundingEvent.timestamp,
      })),
    });
  }

  return cycles.sort(
    (a, b) =>
      b.fundingTimestamp - a.fundingTimestamp
  );
}

function buildCycleAnalytics(cycles, funding) {
  const correlated =
    cycles.filter(x => x.correlated);

  const delayValues =
    correlated
      .map(x => x.firstClaimDelaySeconds)
      .filter(x => x !== null);

  const chronologicalFunding =
    [...funding].sort(
      (a, b) => a.timestamp - b.timestamp
    );

  const cadenceSeconds = [];

  for (
    let i = 1;
    i < chronologicalFunding.length;
    i++
  ) {
    cadenceSeconds.push(
      chronologicalFunding[i].timestamp -
      chronologicalFunding[i - 1].timestamp
    );
  }

  const medDelay =
    median(delayValues);

  const medCadence =
    median(cadenceSeconds);

  const cadenceStdDev =
    stdDev(cadenceSeconds);

  const cadenceCV =
    medCadence && cadenceSeconds.length >= 2
      ? cadenceStdDev / medCadence
      : null;

  const correlationRate =
    cycles.length
      ? correlated.length / cycles.length
      : 0;

  /*
   * Explainable heuristic:
   * estimates whether the observed pattern resembles
   * a repeated automated funding/distribution cycle.
   */
  let automationConfidence = 0;

  if (correlated.length >= 1)
    automationConfidence += 20;

  if (correlated.length >= 3)
    automationConfidence += 20;

  if (correlated.length >= 5)
    automationConfidence += 15;

  if (correlationRate >= 0.5)
    automationConfidence += 15;

  if (correlationRate >= 0.75)
    automationConfidence += 10;

  if (
    medDelay !== null &&
    medDelay <= 180
  ) {
    automationConfidence += 10;
  }

  if (
    medDelay !== null &&
    medDelay <= 60
  ) {
    automationConfidence += 5;
  }

  if (
    cadenceCV !== null &&
    cadenceCV <= 0.25
  ) {
    automationConfidence += 5;
  }

  automationConfidence =
    Math.min(100, automationConfidence);

  const cycleSignal =
    correlated.length >= 3 &&
    correlationRate >= 0.6 &&
    medDelay !== null &&
    medDelay <= CORRELATION_WINDOW_SECONDS
      ? 'DISTRIBUTION_CYCLE_DETECTED'
      : 'NO_STABLE_CYCLE';

  return {
    cycleSignal,
    automationConfidence,

    fundingEventsAnalyzed:
      cycles.length,

    correlatedCycles:
      correlated.length,

    correlationRatePct:
      round(correlationRate * 100, 1),

    medianFirstClaimDelaySeconds:
      medDelay === null
        ? null
        : round(medDelay, 1),

    avgFirstClaimDelaySeconds:
      delayValues.length
        ? round(
            sum(delayValues, x => x) /
            delayValues.length,
            1
          )
        : null,

    medianFundingCadenceSeconds:
      medCadence === null
        ? null
        : round(medCadence, 1),

    fundingCadenceStdDevSeconds:
      cadenceSeconds.length
        ? round(cadenceStdDev, 1)
        : null,

    fundingCadenceCV:
      cadenceCV === null
        ? null
        : round(cadenceCV, 3),

    correlationWindowSeconds:
      CORRELATION_WINDOW_SECONDS,
  };
}

async function main() {
  await fs.ensureDir(dataDir);

  const [
    distTxs,
    upstreamTxs,
    rewardTxs
  ] = await Promise.all([
    fetchAddressTransactions(DISTRIBUTOR, 100),
    fetchAddressTransactions(UPSTREAM, 50),
    fetchAddressTransactions(REWARD_WALLET, 50),
  ]);

  const nowSec =
    Math.floor(Date.now() / 1000);

  const distTransfers =
    extractTransfers(distTxs);

  const claims =
    distTransfers
      .filter(
        x =>
          x.from === DISTRIBUTOR &&
          x.to &&
          x.to !== DISTRIBUTOR
      )
      .sort(
        (a, b) =>
          b.timestamp - a.timestamp
      );

  const funding =
    extractTransfers(upstreamTxs)
      .filter(
        x =>
          x.from === UPSTREAM &&
          x.to === DISTRIBUTOR
      )
      .sort(
        (a, b) =>
          b.timestamp - a.timestamp
      );

  const rewardFlow =
    extractTransfers(rewardTxs)
      .sort(
        (a, b) =>
          b.timestamp - a.timestamp
      );

  const w5 =
    stats(claims, 5, nowSec);

  const w15 =
    stats(claims, 15, nowSec);

  const w60 =
    stats(claims, 60, nowSec);

  const w24 =
    stats(claims, 1440, nowSec);

  const prev5Rows =
    claims.filter(
      x =>
        x.timestamp < nowSec - 300 &&
        x.timestamp >= nowSec - 600
    );

  const prev5Total =
    sum(prev5Rows, x => x.amount);

  const claimVelocityPct =
    prev5Rows.length
      ? round(
          (
            (
              w5.rewards -
              prev5Rows.length
            ) /
            prev5Rows.length
          ) * 100,
          1
        )
      : w5.rewards
        ? 100
        : 0;

  const volumeVelocityPct =
    prev5Total
      ? round(
          (
            (
              w5.wpondDistributed -
              prev5Total
            ) /
            prev5Total
          ) * 100,
          1
        )
      : w5.wpondDistributed
        ? 100
        : 0;

  const lastClaim =
    claims[0] || null;

  const silenceMinutes =
    lastClaim
      ? round(
          (
            nowSec -
            lastClaim.timestamp
          ) / 60,
          1
        )
      : null;

  const activityState =
    w5.rewards >= 10
      ? 'SURGING'
      : w5.rewards >= 4
        ? 'HIGH'
        : w5.rewards >= 1
          ? 'ACTIVE'
          : w15.rewards
            ? 'COOLING'
            : 'QUIET';

  const lastFunding =
    funding[0] || null;

  const fundingObservedInSample =
    funding.length > 0;

  const fundingActive15m =
    Boolean(
      funding.find(
        x =>
          within(
            x.timestamp,
            ACTIVE_FUNDING_WINDOW_MINUTES,
            nowSec
          )
      )
    );

  const fundingSilenceMinutes =
    lastFunding
      ? round(
          (
            nowSec -
            lastFunding.timestamp
          ) / 60,
          1
        )
      : null;

  const distributionCycles =
    buildDistributionCycles(
      funding,
      claims
    );

  const cycleAnalytics =
    buildCycleAnalytics(
      distributionCycles,
      funding
    );

  const rewardWalletActive15m =
    rewardFlow.some(
      x =>
        within(
          x.timestamp,
          15,
          nowSec
        )
    );

  const confirmationScore =
    Math.min(
      100,

      (w5.rewards ? 35 : 0) +

      (fundingActive15m ? 20 : 0) +

      (
        w5.uniqueRecipients >= 3
          ? 15
          : 0
      ) +

      (
        rewardWalletActive15m
          ? 10
          : 0
      ) +

      (
        cycleAnalytics.cycleSignal ===
        'DISTRIBUTION_CYCLE_DETECTED'
          ? 20
          : 0
      )
    );

  const latestCorrelatedCycle =
    distributionCycles.find(
      x => x.correlated
    ) || null;

  const output = {
    generatedAt:
      new Date().toISOString(),

    version: '1.1.0',

    status: 'LIVE',

    confidence: 'VERY HIGH',

    entities: {
      wpondMint: WPOND_MINT,
      claimDistributor: DISTRIBUTOR,
      upstream: UPSTREAM,
      rewardWallet: REWARD_WALLET,
    },

    activityState,

    chainConfirmationScore:
      confirmationScore,

    claimVelocityPct,

    volumeVelocityPct,

    silenceMinutes,

    /*
     * Backward-compatible field.
     * TRUE only when funding is active
     * during the last 15 minutes.
     */
    fundingDetected:
      fundingActive15m,

    fundingStatus: {
      observedInFetchedSample:
        fundingObservedInSample,

      active15m:
        fundingActive15m,

      lastSeenMinutesAgo:
        fundingSilenceMinutes,

      lastFunding,
    },

    lastFunding,

    lastClaim,

    windows: {
      '5m': w5,
      '15m': w15,
      '1h': w60,
      '24h': w24,
    },

    cycleAnalytics,

    latestCorrelatedCycle,

    distributionCycles:
      distributionCycles.slice(
        0,
        MAX_CYCLES_OUTPUT
      ),

    recentClaims:
      claims.slice(0, 20),

    recentFundingEvents:
      funding.slice(0, 10),

    methodology:
      'Direct wPOND transfers from the high-confidence Pond0x Claim Distributor are classified as reward/claim candidates. UPSTREAM -> DISTRIBUTOR Jupiter/swap flows are treated as funding events. Claims are correlated to the nearest preceding funding event until the next funding event or a 5-minute correlation window, whichever comes first. DEX/swap flows remain separate from reward distributions.',
  };

  await fs.writeJson(
    outputFile,
    output,
    { spaces: 2 }
  );

  let hist = [];

  try {
    hist =
      await fs.readJson(historyFile);

    if (!Array.isArray(hist))
      hist = [];
  } catch {}

  hist.unshift({
    generatedAt:
      output.generatedAt,

    activityState,

    chainConfirmationScore:
      confirmationScore,

    claimVelocityPct,

    fundingDetected:
      fundingActive15m,

    fundingObservedInSample,

    fundingSilenceMinutes,

    cycleSignal:
      cycleAnalytics.cycleSignal,

    automationConfidence:
      cycleAnalytics.automationConfidence,

    correlationRatePct:
      cycleAnalytics.correlationRatePct,

    medianFirstClaimDelaySeconds:
      cycleAnalytics
        .medianFirstClaimDelaySeconds,

    windows:
      output.windows,
  });

  await fs.writeJson(
    historyFile,
    hist.slice(0, 2016),
    { spaces: 2 }
  );

  console.log(
    `Chain Intelligence: ${activityState}` +
    ` | 5m=${w5.rewards} rewards` +
    ` | ${w5.wpondDistributed} wPOND` +
    ` | recipients=${w5.uniqueRecipients}` +
    ` | cycle=${cycleAnalytics.cycleSignal}` +
    ` | automation=${cycleAnalytics.automationConfidence}/100`
  );
}

main().catch(e => {
  console.error(
    'chain-intelligence failed:',
    e
  );

  process.exit(1);
});
