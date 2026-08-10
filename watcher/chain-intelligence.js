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
const baselineFile = path.join(dataDir, 'chain-baseline.json');

const CORRELATION_WINDOW_SECONDS = 5 * 60;
const MAX_CADENCE_GAP_SECONDS = 30 * 60;
const ACTIVE_FUNDING_WINDOW_MINUTES = 15;
const MAX_CYCLES_OUTPUT = 12;

function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; }
function iso(ts) { return new Date(n(ts) * 1000).toISOString(); }
function within(ts, minutes, nowSec) { return n(ts) >= nowSec - minutes * 60; }
function sum(xs, f) { return xs.reduce((a, x) => a + n(f(x)), 0); }
function uniq(xs) { return [...new Set(xs.filter(Boolean))]; }
function round(v, d = 3) { const p = 10 ** d; return Math.round(n(v) * p) / p; }

function median(values) {
  const xs = values.map(n).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m-1] + xs[m]) / 2;
}

function stdDev(values) {
  const xs = values.map(n).filter(Number.isFinite);
  if (xs.length < 2) return 0;
  const avg = sum(xs, x => x) / xs.length;
  return Math.sqrt(sum(xs, x => (x - avg) ** 2) / xs.length);
}

async function fetchAddressTransactions(
  address,
  {
    horizonMinutes = 1440,
    pageSize = 100,
    maxPages = 20,
  } = {}
) {
  if (!HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY is missing");
  }

  const cutoffSec =
    Math.floor(Date.now() / 1000) - horizonMinutes * 60;

  const all = [];
  const seenSignatures = new Set();

  let beforeSignature = null;
  let reachedCutoff = false;
  let pagesFetched = 0;

  while (pagesFetched < maxPages && !reachedCutoff) {
    const params = new URLSearchParams({
      "api-key": HELIUS_API_KEY,
      limit: String(pageSize),
    });

    if (beforeSignature) {
      params.set("before-signature", beforeSignature);
    }

    const url =
      `https://api.helius.xyz/v0/addresses/${address}/transactions?` +
      params.toString();

    const res = await fetch(url, {
      headers: {
        accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(
        `Helius ${address.slice(0, 6)} failed: ` +
          `${res.status} ${await res.text()}`
      );
    }

    const page = await res.json();

    if (!Array.isArray(page) || page.length === 0) {
      reachedCutoff = true;
      break;
    }

    pagesFetched += 1;

    for (const tx of page) {
      const signature = tx?.signature;

      if (signature && seenSignatures.has(signature)) {
        continue;
      }

      if (signature) {
        seenSignatures.add(signature);
      }

      const timestamp = n(tx?.timestamp);

      if (timestamp >= cutoffSec) {
        all.push(tx);
      } else {
        reachedCutoff = true;
      }
    }

    const lastTx = page[page.length - 1];
    const lastSignature = lastTx?.signature;
    const lastTimestamp = n(lastTx?.timestamp);

    if (!lastSignature) {
      break;
    }

    beforeSignature = lastSignature;

    if (lastTimestamp > 0 && lastTimestamp < cutoffSec) {
      reachedCutoff = true;
    }

    if (page.length < pageSize) {
      reachedCutoff = true;
    }
  }

  const coverageComplete =
    reachedCutoff || pagesFetched < maxPages;

  return {
    transactions: all,
    coverage: {
      address,
      horizonMinutes,
      pagesFetched,
      transactionsFetched: all.length,
      cutoffTime: new Date(cutoffSec * 1000).toISOString(),
      coverageComplete,
      maxPagesReached:
        pagesFetched >= maxPages && !reachedCutoff,
    },
  };
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

function stats(transfers, minutes, nowSec) {
  const rows = transfers.filter(x => within(x.timestamp, minutes, nowSec));
  const total = sum(rows, x => x.amount);
  return {
    minutes,
    rewards: rows.length,
    wpondDistributed: round(total),
    uniqueRecipients: uniq(rows.map(x=>x.to)).length,
    avgReward: rows.length ? round(total / rows.length) : 0,
    largestReward: round(Math.max(0, ...rows.map(x=>x.amount))),
  };
}

function buildDistributionCycles(funding, rewardTransfers) {
  const f = [...funding].sort((a,b)=>a.timestamp-b.timestamp);
  const c = [...rewardTransfers].sort((a,b)=>a.timestamp-b.timestamp);
  const cycles = [];

  for (let i=0; i<f.length; i++) {
    const fe = f[i];
    const nextFundingTs = f[i+1]?.timestamp || Infinity;
    const cycleEnd = Math.min(nextFundingTs, fe.timestamp + CORRELATION_WINDOW_SECONDS);
    const cc = c.filter(x => x.timestamp >= fe.timestamp && x.timestamp < cycleEnd);
    const distributed = sum(cc, x=>x.amount);
    const delays = cc.map(x=>x.timestamp-fe.timestamp);

    cycles.push({
      fundingSignature: fe.signature,
      fundingTime: fe.time,
      fundingTimestamp: fe.timestamp,
      fundingAmount: round(fe.amount),
      fundingSource: fe.source,
      rewardTransferCount: cc.length,
      uniqueRecipients: uniq(cc.map(x=>x.to)).length,
      distributedAmount: round(distributed),
      distributionRatioPct: fe.amount
        ? round((distributed / fe.amount) * 100, 2)
        : null,
      firstRewardTransferDelaySeconds: delays.length
        ? Math.min(...delays)
        : null,
      lastRewardTransferDelaySeconds: delays.length
        ? Math.max(...delays)
        : null,
      correlated: cc.length > 0,
      rewardTransfers: cc.map(x=>({
        signature: x.signature,
        time: x.time,
        timestamp: x.timestamp,
        to: x.to,
        amount: round(x.amount),
        delaySeconds: x.timestamp - fe.timestamp
      })),
     });
   }
  return cycles.sort((a,b)=>b.fundingTimestamp-a.fundingTimestamp);
}

function cadenceFromFunding(funding) {
  const f = [...funding].sort((a,b)=>a.timestamp-b.timestamp);
  const gaps = [];

  for (let i = 1; i < f.length; i++) {
    const gap = f[i].timestamp - f[i - 1].timestamp;

    if (gap <= MAX_CADENCE_GAP_SECONDS) {
      gaps.push(gap);
    }
  }

  return gaps;
}

function buildCycleAnalytics(cycles, funding, baseline) {
  const correlated = cycles.filter(x=>x.correlated);
  const delays = correlated
    .map(x => x.firstRewardTransferDelaySeconds)
    .filter(x => x !== null);;
  const liveCadence = cadenceFromFunding(funding);

  const baselineDelays = Array.isArray(baseline?.firstRewardTransferDelaySeconds)
    ? baseline.firstRewardTransferDelaySeconds
    : Array.isArray(baseline?.firstClaimDelaySeconds)
      ? baseline.firstClaimDelaySeconds
      : [];
  const baselineCadence = Array.isArray(baseline?.fundingCadenceSeconds) ? baseline.fundingCadenceSeconds : [];

  const combinedDelays = [...baselineDelays, ...delays];
  const combinedCadence = [...baselineCadence, ...liveCadence];

  const liveMedDelay = median(delays);
  const historicalMedDelay = median(baselineDelays);

  const liveMedCadence = median(liveCadence);
  const liveCadenceStdDev = stdDev(liveCadence);
  const liveCadenceCV =
    liveMedCadence && liveCadence.length >= 2
      ? liveCadenceStdDev / liveMedCadence
      : null;

const historicalMedCadence = median(baselineCadence);

  const medDelay = median(combinedDelays);
  const medCadence = median(combinedCadence);
  const cadenceStdDev = stdDev(combinedCadence);
  const cadenceCV = medCadence && combinedCadence.length >= 2 ? cadenceStdDev / medCadence : null;

  const correlationRate = cycles.length ? correlated.length / cycles.length : 0;
  const baselineCorrelationRate = n(baseline?.correlationRatePct) / 100;
  const weightedCorrelationRate = baseline?.cyclesAnalyzed
    ? ((baselineCorrelationRate * n(baseline.cyclesAnalyzed)) + correlated.length) / (n(baseline.cyclesAnalyzed) + cycles.length)
    : correlationRate;

  const liveRewardTransferAfterFundingPct =
    round(correlationRate * 100, 1);

  const historicalRewardTransferAfterFundingPct =
    round(baselineCorrelationRate * 100, 1);

  const combinedRewardTransferAfterFundingPct =
    round(weightedCorrelationRate * 100, 1);

  let liveAutomationConfidence = 0;

  if (correlated.length >= 1) liveAutomationConfidence += 20;
  if (correlated.length >= 3) liveAutomationConfidence += 20;
  if (correlated.length >= 5) liveAutomationConfidence += 15;

  if (correlationRate >= 0.5) liveAutomationConfidence += 15;
  if (correlationRate >= 0.75) liveAutomationConfidence += 10;

  if (liveMedDelay !== null && liveMedDelay <= 180) {
    liveAutomationConfidence += 10;
  }

  if (liveMedDelay !== null && liveMedDelay <= 60) {
    liveAutomationConfidence += 5;
  }

  if (
    liveCadenceCV !== null &&
    liveCadenceCV <= 0.25
  ) {
    liveAutomationConfidence += 5;
  }

  liveAutomationConfidence = Math.min(
    100,
    liveAutomationConfidence
  );

  let combinedAutomationConfidence = 0;

  const totalCorrelated =
    n(baseline?.correlatedCycles) + correlated.length;

  if (totalCorrelated >= 1) combinedAutomationConfidence += 20;
  if (totalCorrelated >= 3) combinedAutomationConfidence += 20;
  if (totalCorrelated >= 5) combinedAutomationConfidence += 15;

  if (weightedCorrelationRate >= 0.5) {
    combinedAutomationConfidence += 15;
  }

  if (weightedCorrelationRate >= 0.75) {
    combinedAutomationConfidence += 10;
  }

  if (medDelay !== null && medDelay <= 180) {
    combinedAutomationConfidence += 10;
  }

  if (medDelay !== null && medDelay <= 60) {
    combinedAutomationConfidence += 5;
  }

  if (cadenceCV !== null && cadenceCV <= 0.25) {
    combinedAutomationConfidence += 5;
  }

  combinedAutomationConfidence = Math.min(
    100,
    combinedAutomationConfidence
  );

  const automationConfidence = liveAutomationConfidence;

  const cadenceConfidence =
    liveCadence.length >= 12 &&
    liveCadenceCV !== null &&
    liveCadenceCV <= 0.10
      ? 'VERY HIGH'
      : liveCadence.length >= 6 &&
          liveCadenceCV !== null &&
          liveCadenceCV <= 0.20
        ? 'HIGH'
        : liveCadence.length >= 3
          ? 'MEDIUM'
          : 'LOW';

  const rewardTransferAfterFundingPct =
    liveRewardTransferAfterFundingPct;

  const stableCycle =
    correlated.length >= 5 &&
    rewardTransferAfterFundingPct >= 50 &&
    liveMedDelay !== null &&
    liveMedDelay <= CORRELATION_WINDOW_SECONDS &&
    cadenceConfidence !== 'LOW';

return {
    cycleSignal: stableCycle ? 'DISTRIBUTION_CYCLE_DETECTED' : 'NO_STABLE_CYCLE',
    automationConfidence,
    liveAutomationConfidence,
    combinedAutomationConfidence,
    cadenceConfidence,
    rewardTransferAfterFundingPct,
    claimAfterFundingProbabilityPct:
      rewardTransferAfterFundingPct,
    liveRewardTransferAfterFundingPct,
    historicalRewardTransferAfterFundingPct,
    combinedRewardTransferAfterFundingPct,

    liveClaimAfterFundingProbabilityPct:
      liveRewardTransferAfterFundingPct,

    historicalClaimAfterFundingProbabilityPct:
      historicalRewardTransferAfterFundingPct,

    combinedClaimAfterFundingProbabilityPct:
      combinedRewardTransferAfterFundingPct,
    liveFundingEventsAnalyzed: cycles.length,
    liveCorrelatedCycles: correlated.length,
    historicalCyclesAnalyzed: n(baseline?.cyclesAnalyzed),
    historicalCorrelatedCycles: n(baseline?.correlatedCycles),
    liveMedianFirstRewardTransferDelaySeconds:
      liveMedDelay === null ? null : round(liveMedDelay, 1),

    historicalMedianFirstRewardTransferDelaySeconds:
      historicalMedDelay === null ? null : round(historicalMedDelay, 1),

    combinedMedianFirstRewardTransferDelaySeconds:
      medDelay === null ? null : round(medDelay, 1),

    medianFirstRewardTransferDelaySeconds:
      liveMedDelay === null ? null : round(liveMedDelay, 1),

    avgFirstRewardTransferDelaySeconds:
      combinedDelays.length
        ? round(
            sum(combinedDelays, x => x) /
              combinedDelays.length,
            1
          )
        : null,

    liveMedianFirstClaimDelaySeconds:
      liveMedDelay === null ? null : round(liveMedDelay, 1),

    historicalMedianFirstClaimDelaySeconds:
      historicalMedDelay === null ? null : round(historicalMedDelay, 1),

    combinedMedianFirstClaimDelaySeconds:
      medDelay === null ? null : round(medDelay, 1),

    medianFirstClaimDelaySeconds:
      liveMedDelay === null ? null : round(liveMedDelay, 1),

    avgFirstClaimDelaySeconds:
      combinedDelays.length
        ? round(
            sum(combinedDelays, x => x) /
              combinedDelays.length,
            1
          )
        : null,
    
    liveMedianFundingCadenceSeconds:
      liveMedCadence === null ? null : round(liveMedCadence, 1),

    liveFundingCadenceStdDevSeconds:
      liveCadence.length ? round(liveCadenceStdDev, 1) : null,

    liveFundingCadenceCV:
      liveCadenceCV === null ? null : round(liveCadenceCV, 3),

    liveFundingCadenceSamples:
      liveCadence.length,

    historicalMedianFundingCadenceSeconds:
      historicalMedCadence === null ? null : round(historicalMedCadence, 1),

    historicalFundingCadenceSamples:
      baselineCadence.length,
    medianFundingCadenceSeconds: medCadence === null ? null : round(medCadence,1),
    fundingCadenceStdDevSeconds: combinedCadence.length ? round(cadenceStdDev,1) : null,
    fundingCadenceCV: cadenceCV === null ? null : round(cadenceCV,3),
    correlationWindowSeconds: CORRELATION_WINDOW_SECONDS,
    baselineLoaded: Boolean(baseline),
  };
}

function buildPredictor(funding, analytics, nowSec) {
  const latest = [...funding].sort((a,b)=>b.timestamp-a.timestamp)[0] || null;
  const cadence = n(
    analytics.liveMedianFundingCadenceSeconds ||
    analytics.medianFundingCadenceSeconds
  );

  const sigma = n(
    analytics.liveFundingCadenceStdDevSeconds ||
    analytics.fundingCadenceStdDevSeconds
  );

  if (!latest || !cadence) {
    return {
      status: 'INSUFFICIENT_DATA',
      nextFundingExpectedAt: null,
      nextFundingWindowStart: null,
      nextFundingWindowEnd: null,
      secondsToExpectedFunding: null,
      fundingCadenceConfidence: analytics.cadenceConfidence,
      claimAfterFundingProbabilityPct: analytics.rewardTransferAfterFundingPct ??
      analytics.claimAfterFundingProbabilityPct,
      expectedClaimWindowSeconds: null,
      rewardTransferAfterFundingPct:
        analytics.rewardTransferAfterFundingPct ??
        analytics.claimAfterFundingProbabilityPct,

      expectedRewardTransferWindowSeconds: null,
    };
  }

  let expectedTs = latest.timestamp + cadence;
  while (expectedTs < nowSec - Math.max(60, sigma * 3)) expectedTs += cadence;

  const halfWindow = Math.max(25, Math.min(180, sigma ? sigma * 2.5 : 45));
  const secondsTo = round(expectedTs - nowSec, 0);

  const status =
    Math.abs(secondsTo) <= halfWindow ? 'IN_FUNDING_WINDOW' :
    secondsTo > halfWindow ? 'WATCHING' : 'WINDOW_PASSED';

  const medDelay = n(
    analytics.medianFirstRewardTransferDelaySeconds ??
    analytics.medianFirstClaimDelaySeconds
  );

  return {
    status,
    nextFundingExpectedAt: iso(expectedTs),
    nextFundingExpectedTimestamp: round(expectedTs,0),
    nextFundingWindowStart: iso(expectedTs - halfWindow),
    nextFundingWindowEnd: iso(expectedTs + halfWindow),
    fundingWindowHalfWidthSeconds: round(halfWindow,0),
    secondsToExpectedFunding: secondsTo,
    fundingCadenceConfidence: analytics.cadenceConfidence,
    claimAfterFundingProbabilityPct: analytics.rewardTransferAfterFundingPct ??
    analytics.claimAfterFundingProbabilityPct
    expectedClaimWindowSeconds: medDelay
      ? { start: Math.max(10, round(medDelay - 20,0)), center: round(medDelay,0), end: Math.min(CORRELATION_WINDOW_SECONDS, round(medDelay + 45,0)) }
      : null,
    warning: 'Predictive timing is statistical, not a guarantee of a claim or launch.',
    rewardTransferAfterFundingPct:
      analytics.rewardTransferAfterFundingPct ??
      analytics.claimAfterFundingProbabilityPct,

    expectedRewardTransferWindowSeconds: medDelay
      ? {
          start: Math.max(10, round(medDelay - 20, 0)),
          center: round(medDelay, 0),
          end: Math.min(
            CORRELATION_WINDOW_SECONDS,
            round(medDelay + 45, 0)
          )
        }
      : null,
  };
}


function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n(v)));
}

function similarityPct(actual, expected, tolerance) {
  actual = n(actual); expected = n(expected); tolerance = Math.max(1, n(tolerance));
  if (!actual || !expected) return null;
  return round(clamp(100 - (Math.abs(actual - expected) / tolerance) * 100), 1);
}

function buildPatternMatch({ funding, cycles, analytics, predictor, baseline, nowSec }) {
  if (!baseline || !n(baseline.cyclesAnalyzed)) {
    return {
      status: 'NO_BASELINE',
      historicalPatternMatchPct: null,
      confidence: 'LOW',
      liveEvidence: false,
      components: {},
      interpretation: 'Historical baseline is not available yet.',
    };
  }

  const chronologicalFunding = [...funding].sort((a,b)=>a.timestamp-b.timestamp);
  const recentGaps = [];
  for (let i=Math.max(1, chronologicalFunding.length-6); i<chronologicalFunding.length; i++) {
    recentGaps.push(chronologicalFunding[i].timestamp - chronologicalFunding[i-1].timestamp);
  }

  const liveMedianCadence = median(recentGaps);
  const historicalMedianCadence = n(baseline?.summary?.medianFundingCadenceSeconds || analytics.medianFundingCadenceSeconds);
  const historicalCadenceSd = Math.max(15, n(baseline?.summary?.fundingCadenceStdDevSeconds || analytics.fundingCadenceStdDevSeconds));
  const cadenceSimilarityPct = similarityPct(liveMedianCadence, historicalMedianCadence, historicalCadenceSd * 3);

  const latestCorrelated = cycles.find(x=>x.correlated) || null;
  const historicalMedianDelay = n(
    baseline?.summary?.medianFirstRewardTransferDelaySeconds ??
    baseline?.summary?.medianFirstClaimDelaySeconds ??
    analytics.medianFirstRewardTransferDelaySeconds ??
    analytics.medianFirstClaimDelaySeconds
  );
  const delayTolerance = Math.max(30, historicalMedianDelay || 60);
  const rewardTransferDelaySimilarityPct =
    latestCorrelated &&
    latestCorrelated.firstRewardTransferDelaySeconds !== null
      ? similarityPct(
          latestCorrelated.firstRewardTransferDelaySeconds,
          historicalMedianDelay,
          delayTolerance
        )
      : null;

  const predictorProximityPct =
    predictor.status === 'IN_FUNDING_WINDOW' ? 100 :
    predictor.status === 'WATCHING' && predictor.fundingWindowHalfWidthSeconds
      ? round(clamp(100 - Math.max(0, n(predictor.secondsToExpectedFunding) - n(predictor.fundingWindowHalfWidthSeconds)) / Math.max(60, historicalMedianCadence) * 100), 1)
      : predictor.status === 'WINDOW_PASSED' ? 20 : 0;

  const correlationPct = clamp(
    analytics.rewardTransferAfterFundingPct ??
    analytics.rewardTransferAfterFundingPct ??
    analytics.claimAfterFundingProbabilityPct
  );
  const automationPct = clamp(analytics.automationConfidence);
  const cadencePct = cadenceSimilarityPct === null ? 50 : cadenceSimilarityPct;
  const delayPct =
    rewardTransferDelaySimilarityPct === null
      ? 50
      : rewardTransferDelaySimilarityPct;

  const score = round(
    cadencePct * 0.30 +
    delayPct * 0.15 +
    correlationPct * 0.20 +
    automationPct * 0.20 +
    predictorProximityPct * 0.15,
    1
  );

  const latestFunding = funding[0] || null;
  const fundingRecent = latestFunding ? within(latestFunding.timestamp, ACTIVE_FUNDING_WINDOW_MINUTES, nowSec) : false;
  const latestRewardTransferTs = Math.max(
    0,
    ...cycles.flatMap(c =>
      (c.rewardTransfers || []).map(x => n(x.timestamp))
    )
  );
  
  const rewardTransferRecent = latestRewardTransferTs
    ? within(latestRewardTransferTs, 15, nowSec)
    : false;
  
  const liveEvidence =
    fundingRecent ||
    rewardTransferRecent ||
    predictor.status === 'IN_FUNDING_WINDOW';

  const confidence =
    n(baseline.cyclesAnalyzed) >= 100 ? 'VERY HIGH' :
    n(baseline.cyclesAnalyzed) >= 30 ? 'HIGH' :
    n(baseline.cyclesAnalyzed) >= 12 ? 'MEDIUM' : 'LOW';

  const status =
    score >= 80 && liveEvidence ? 'STRONG_MATCH' :
    score >= 65 && liveEvidence ? 'MATCH' :
    score >= 65 ? 'HISTORICAL_MATCH' :
    score >= 45 ? 'PARTIAL_MATCH' :
    'WEAK_MATCH';

  return {
    status,
    historicalPatternMatchPct: score,
    confidence,
    sampleCycles: n(baseline.cyclesAnalyzed),
    liveEvidence,
    components: {
      cadenceSimilarityPct,
      rewardTransferDelaySimilarityPct,
      rewardTransferAfterFundingPct: correlationPct,
      claimAfterFundingProbabilityPct: correlationPct,
      automationConfidencePct: automationPct,
      predictorProximityPct,
    },
    live: {
      medianRecentFundingCadenceSeconds: liveMedianCadence === null ? null : round(liveMedianCadence,1),
      latestCorrelatedRewardTransferDelaySeconds:
        latestCorrelated?.firstRewardTransferDelaySeconds ?? null,
    },
    baseline: {
      medianFundingCadenceSeconds: historicalMedianCadence || null,
      medianFirstClaimDelaySeconds: historicalMedianDelay || null,
      correlationRatePct: n(baseline.correlationRatePct),
    },
    interpretation: liveEvidence
      ? 'Current on-chain timing is compared with the historical reward-cycle baseline. This is a similarity score, not a probability of a claim or launch.'
      : 'Historical timing similarity is present, but no fresh on-chain trigger is active. This is not a claim or launch probability.',
  };
}

async function main() {
  await fs.ensureDir(dataDir);

  let baseline = null;
  try { baseline = await fs.readJson(baselineFile); } catch {}

  const [distResult, upstreamResult, rewardResult] =
  await Promise.all([
    fetchAddressTransactions(DISTRIBUTOR, {
      horizonMinutes: 1440,
    }),
    fetchAddressTransactions(UPSTREAM, {
      horizonMinutes: 1440,
    }),
    fetchAddressTransactions(REWARD_WALLET, {
      horizonMinutes: 60,
    }),
  ]);

const distTxs = distResult.transactions;
const upstreamTxs = upstreamResult.transactions;
const rewardTxs = rewardResult.transactions;

  const nowSec = Math.floor(Date.now()/1000);
  const distTransfers = extractTransfers(distTxs);

  const distributorOutflows = distTransfers
    .filter(
      x =>
        x.from === DISTRIBUTOR &&
        x.to &&
        x.to !== DISTRIBUTOR
    )
    .sort((a,b)=>b.timestamp-a.timestamp);
  
  const rewardWalletTransfers = distributorOutflows
    .filter(x => x.to === REWARD_WALLET);
  
  const externalClaims = distributorOutflows
    .filter(x => x.to !== REWARD_WALLET);
  
  const funding = extractTransfers(upstreamTxs)
    .filter(x=>x.from===UPSTREAM && x.to===DISTRIBUTOR)
    .sort((a,b)=>b.timestamp-a.timestamp);

  const rewardFlow = extractTransfers(rewardTxs).sort((a,b)=>b.timestamp-a.timestamp);

  const w5 = stats(rewardWalletTransfers, 5, nowSec);
  const w15 = stats(rewardWalletTransfers, 15, nowSec);
  const w60 = stats(rewardWalletTransfers, 60, nowSec);
  const w24 = stats(rewardWalletTransfers, 1440, nowSec);

  const prev5Rows = rewardWalletTransfers.filter(
    x =>
      x.timestamp < nowSec - 300 &&
      x.timestamp >= nowSec - 600
  );
  const prev5Total = sum(prev5Rows,x=>x.amount);
  const rewardTransferVelocityPct = prev5Rows.length
    ? round(
        ((w5.rewards - prev5Rows.length) / prev5Rows.length) * 100,
        1
      )
    : (w5.rewards ? 100 : 0);
  const volumeVelocityPct = prev5Total ? round(((w5.wpondDistributed-prev5Total)/prev5Total)*100,1) : (w5.wpondDistributed?100:0);

  const lastRewardTransfer = rewardWalletTransfers[0] || null;
  const silenceMinutes = lastRewardTransfer
    ? round((nowSec - lastRewardTransfer.timestamp) / 60, 1)
    : null;
  const activityState = w5.rewards>=10?'SURGING':w5.rewards>=4?'HIGH':w5.rewards>=1?'ACTIVE':(w15.rewards?'COOLING':'QUIET');

  const lastFunding = funding[0] || null;
  const fundingActive15m = Boolean(funding.find(x=>within(x.timestamp,ACTIVE_FUNDING_WINDOW_MINUTES,nowSec)));
  const fundingSilenceMinutes = lastFunding ? round((nowSec-lastFunding.timestamp)/60,1) : null;

  const cycles = buildDistributionCycles(
    funding,
    rewardWalletTransfers
  );
  const cycleAnalytics = buildCycleAnalytics(cycles, funding, baseline);
  const predictor = buildPredictor(funding, cycleAnalytics, nowSec);
  const patternMatch = buildPatternMatch({ funding, cycles, analytics: cycleAnalytics, predictor, baseline, nowSec });

  const rewardWalletActive15m =
    rewardFlow.some(x => within(x.timestamp, 15, nowSec)) ||
    rewardWalletTransfers.some(
      x => within(x.timestamp, 15, nowSec)
    );

  const confirmationScore = Math.min(100,
    (w5.rewards?30:0) +
    (fundingActive15m?20:0) +
    (w5.uniqueRecipients>=3?10:0) +
    (rewardWalletActive15m?10:0) +
    (cycleAnalytics.cycleSignal==='DISTRIBUTION_CYCLE_DETECTED'?15:0) +
    (predictor.status==='IN_FUNDING_WINDOW'?15:0)
  );

  const output = {
    generatedAt:new Date().toISOString(),
    version:'1.3.0',
    status:'LIVE',
    confidence:'VERY HIGH',
    
    dataCoverage: {
    distributor: distResult.coverage,
    upstream: upstreamResult.coverage,
    rewardWallet: rewardResult.coverage,
   },
    
    entities:{wpondMint:WPOND_MINT,claimDistributor:DISTRIBUTOR,upstream:UPSTREAM,rewardWallet:REWARD_WALLET},
    flowClassification: {
    distributorOutflows: distributorOutflows.length,
    rewardWalletTransfers: rewardWalletTransfers.length,
    externalClaims: externalClaims.length,
  },
    
    activityState,
    chainConfirmationScore:confirmationScore,
    claimVelocityPct: rewardTransferVelocityPct,
    rewardTransferVelocityPct,
    volumeVelocityPct,
    silenceMinutes,
    fundingDetected:fundingActive15m,
    fundingStatus:{
      observedInFetchedSample:funding.length>0,
      active15m:fundingActive15m,
      lastSeenMinutesAgo:fundingSilenceMinutes,
      lastFunding,
    },
    predictor,
    patternMatch,
    cycleAnalytics,
    lastFunding,
    lastRewardTransfer,
    windows:{'5m':w5,'15m':w15,'1h':w60,'24h':w24},
    latestCorrelatedCycle:cycles.find(x=>x.correlated)||null,
    distributionCycles:cycles.slice(0,MAX_CYCLES_OUTPUT),
    recentRewardWalletTransfers: rewardWalletTransfers.slice(0,20),
    recentExternalClaims: externalClaims.slice(0,20),
    recentFundingEvents:funding.slice(0,20),
    methodology:'Direct wPOND transfers from the Distributor are classified into reward-wallet transfers and external claims. DISTRIBUTOR -> REWARD_WALLET flows are treated as reward-distribution activity, while DISTRIBUTOR -> other recipients are tracked separately as external claim candidates. UPSTREAM -> DISTRIBUTOR Jupiter/swap flows are treated as funding events. Cycle timing and prediction currently analyze reward-wallet distribution cycles. Historical pattern similarity is contextual and is not a probability of a claim or launch.',
  };

  await fs.writeJson(outputFile,output,{spaces:2});

  let hist=[]; try { hist=await fs.readJson(historyFile); if(!Array.isArray(hist)) hist=[]; } catch {}
  hist.unshift({
    generatedAt:output.generatedAt,
    activityState,
    chainConfirmationScore:confirmationScore,
    fundingDetected:fundingActive15m,
    cycleSignal:cycleAnalytics.cycleSignal,
    automationConfidence:cycleAnalytics.automationConfidence,
    cadenceConfidence:cycleAnalytics.cadenceConfidence,
    claimAfterFundingProbabilityPct:cycleAnalytics.claimAfterFundingProbabilityPct,
    rewardTransferAfterFundingPct:
      cycleAnalytics.rewardTransferAfterFundingPct ??
      cycleAnalytics.claimAfterFundingProbabilityPct,
    medianFirstRewardTransferDelaySeconds:
      cycleAnalytics.medianFirstRewardTransferDelaySeconds ??
      cycleAnalytics.medianFirstClaimDelaySeconds,

    medianFirstClaimDelaySeconds:
      cycleAnalytics.medianFirstRewardTransferDelaySeconds ??
      cycleAnalytics.medianFirstClaimDelaySeconds,
    medianFundingCadenceSeconds:cycleAnalytics.medianFundingCadenceSeconds,
    predictorStatus:predictor.status,
    nextFundingExpectedAt:predictor.nextFundingExpectedAt,
    historicalPatternMatchPct:patternMatch.historicalPatternMatchPct,
    patternMatchStatus:patternMatch.status,
    patternMatchLiveEvidence:patternMatch.liveEvidence,
    windows:output.windows,
  });
  await fs.writeJson(historyFile,hist.slice(0,2016),{spaces:2});

  console.log(
    `Chain Intelligence v1.3: ${activityState}` +
    ` | cycle=${cycleAnalytics.cycleSignal}` +
    ` | automation=${cycleAnalytics.automationConfidence}/100` +
    ` | cadence=${cycleAnalytics.cadenceConfidence}` +
    ` | reward-transfer-after-funding=${
      cycleAnalytics.rewardTransferAfterFundingPct ??
      cycleAnalytics.claimAfterFundingProbabilityPct
    }%` +
    ` | predictor=${predictor.status}` +
    ` | pattern=${patternMatch.historicalPatternMatchPct ?? 'n/a'}%/${patternMatch.status}`
  );
}

main().catch(e=>{console.error('chain-intelligence failed:',e);process.exit(1);});
