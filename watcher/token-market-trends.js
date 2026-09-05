const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.RADAR_DATA_DIR
  ? path.resolve(process.env.RADAR_DATA_DIR)
  : path.join(process.cwd(), "public", "data");
const HISTORY_PATH = path.join(DATA_DIR, "token-market-history.json");
const OUTPUT_PATH = path.join(DATA_DIR, "token-market-trends-latest.json");
const WINDOWS = Object.freeze([
  { key: "1h", hours: 1 },
  { key: "6h", hours: 6 },
  { key: "24h", hours: 24 }
]);

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function changePct(current, previous) {
  const currentNumber = finiteOrNull(current);
  const previousNumber = finiteOrNull(previous);
  if (currentNumber === null || previousNumber === null || previousNumber === 0) return null;
  return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
}

function tokenById(observation, id) {
  return observation?.tokens?.find((token) => token.id === id) || null;
}

function pairByAddress(token, pairAddress) {
  if (!token || !pairAddress) return null;
  if (token.primaryMarket?.pairAddress === pairAddress) return token.primaryMarket;
  return token.topMarkets?.find((pair) => pair.pairAddress === pairAddress) || null;
}

function baselineFor(observations, currentTime, hours) {
  const target = currentTime - hours * 60 * 60 * 1000;
  const candidates = observations.filter((observation) => {
    const time = Date.parse(observation.generatedAt);
    return Number.isFinite(time) && time <= target;
  });
  if (!candidates.length) return null;
  return candidates.reduce((best, candidate) => {
    return Date.parse(candidate.generatedAt) > Date.parse(best.generatedAt) ? candidate : best;
  });
}

function qualityFor(actualHours, requestedHours) {
  const drift = Math.abs(actualHours - requestedHours);
  if (drift <= 0.5) return "ALIGNED";
  if (drift <= Math.max(1, requestedHours * 0.25)) return "APPROXIMATE";
  return "STALE_BASELINE";
}

function buildWindow(currentObservation, baseline, tokenId, requestedHours) {
  if (!baseline) {
    return {
      status: "INSUFFICIENT_HISTORY",
      requestedHours,
      baselineAt: null,
      actualHours: null
    };
  }

  const current = tokenById(currentObservation, tokenId);
  const previous = tokenById(baseline, tokenId);
  if (!current || !previous) {
    return {
      status: "TOKEN_UNAVAILABLE",
      requestedHours,
      baselineAt: baseline.generatedAt,
      actualHours: null
    };
  }

  const actualHours = (Date.parse(currentObservation.generatedAt) - Date.parse(baseline.generatedAt)) / 3_600_000;
  const currentPairAddress = current.primaryMarket?.pairAddress || null;
  const previousPrimaryPairAddress = previous.primaryMarket?.pairAddress || null;
  const comparablePreviousPair = pairByAddress(previous, currentPairAddress);
  const samePrimaryPair = Boolean(currentPairAddress && currentPairAddress === previousPrimaryPairAddress);
  const samePairObserved = Boolean(currentPairAddress && comparablePreviousPair);
  const anomalies = [];

  if (currentPairAddress && previousPrimaryPairAddress && !samePrimaryPair) {
    anomalies.push("PRIMARY_MARKET_CHANGED");
  }
  if (currentPairAddress && !samePairObserved) {
    anomalies.push("CURRENT_PAIR_NOT_PRESENT_IN_BASELINE");
  }

  return {
    status: "OBSERVED",
    requestedHours,
    baselineAt: baseline.generatedAt,
    actualHours,
    baselineQuality: qualityFor(actualHours, requestedHours),
    marketContinuity: {
      state: samePrimaryPair ? "SAME_PRIMARY_PAIR" : samePairObserved ? "PAIR_OBSERVED_NOT_PRIMARY" : "NOT_COMPARABLE",
      currentPairAddress,
      previousPrimaryPairAddress,
      samePairObserved
    },
    changes: {
      samePairPriceUsdPct: samePairObserved
        ? changePct(current.primaryMarket?.priceUsd, comparablePreviousPair.priceUsd)
        : null,
      aggregateObservedLiquidityUsdPct: changePct(
        current.aggregateObservedLiquidityUsd,
        previous.aggregateObservedLiquidityUsd
      ),
      aggregateObservedVolume24hUsdPct: changePct(
        current.aggregateObservedVolume24hUsd,
        previous.aggregateObservedVolume24hUsd
      )
    },
    anomalies
  };
}

function buildTrends(history) {
  const observations = Array.isArray(history?.observations)
    ? history.observations
      .filter((observation) => Number.isFinite(Date.parse(observation.generatedAt)))
      .sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt))
    : [];

  const current = observations.at(-1);
  if (!current) {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: "INSUFFICIENT_DATA",
      scoreNeutral: true,
      observationCount: 0,
      tokens: {}
    };
  }

  const currentTime = Date.parse(current.generatedAt);
  const tokens = {};
  for (const token of current.tokens || []) {
    const windows = {};
    for (const window of WINDOWS) {
      windows[window.key] = buildWindow(
        current,
        baselineFor(observations.slice(0, -1), currentTime, window.hours),
        token.id,
        window.hours
      );
    }
    tokens[token.id] = {
      symbol: token.symbol,
      chain: token.chain,
      status: token.status,
      currentPrimaryMarket: token.primaryMarket ? {
        dexId: token.primaryMarket.dexId || null,
        pairAddress: token.primaryMarket.pairAddress || null,
        quoteSymbol: token.primaryMarket.quoteToken?.symbol || null
      } : null,
      windows
    };
  }

  return {
    schemaVersion: 1,
    generatedAt: current.generatedAt,
    status: Object.keys(tokens).length ? "LIVE" : "INSUFFICIENT_DATA",
    scoreNeutral: true,
    purpose: "Factual same-pair market changes with explicit pool-continuity checks. No prediction, trading signal, execution, Radar score or alert impact.",
    methodology: {
      price: "Compared only when the current pair address exists in the baseline observation.",
      liquidity: "Change in aggregate liquidity observed across returned markets.",
      volume: "Change in the observed rolling 24-hour volume field; not interval flow.",
      baseline: "Latest observation at or before each requested lookback. Actual elapsed hours and quality are reported."
    },
    observationCount: observations.length,
    availableHistoryHours: (currentTime - Date.parse(observations[0].generatedAt)) / 3_600_000,
    tokens
  };
}

function main() {
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  const trends = buildTrends(history);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(trends, null, 2));
  const anomalyCount = Object.values(trends.tokens).reduce((sum, token) => {
    return sum + Object.values(token.windows).reduce((windowSum, window) => windowSum + (window.anomalies?.length || 0), 0);
  }, 0);
  console.log(`Token Market Trends: ${trends.status} | observations=${trends.observationCount} | anomalies=${anomalyCount}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("Token Market Trends failed:", error);
    process.exitCode = 1;
  }
}

module.exports = { buildTrends, buildWindow, changePct };
