const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(process.cwd(), "public", "data");
const OUTPUT = path.join(DATA_DIR, "ecosystem-snapshot-latest.json");
const HISTORY = path.join(DATA_DIR, "ecosystem-snapshot-history.json");
const MAX_HISTORY = 720;

function readJson(name) {
  const file = path.join(DATA_DIR, name);
  try {
    return { file: name, available: true, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (error) {
    return { file: name, available: false, error: error.message, data: null };
  }
}

function timestampOf(source) {
  if (!source?.data) return null;
  return source.data.generatedAt
    || source.data.lastSuccessAt
    || source.data.lastRunAt
    || source.data.observation?.checkedAt
    || source.data.details?.latest?.checkedAt
    || source.data.latest?.checkedAt
    || null;
}

function statusOf(source) {
  if (!source?.data) return null;
  return source.data.status
    || source.data.observation?.status
    || source.data.details?.latest?.status
    || source.data.latest?.status
    || source.data.freshness?.status
    || null;
}

function tokenState(market, trends, id) {
  const token = market?.data?.tokens?.find((item) => item.id === id);
  if (!token) return { status: "UNAVAILABLE" };
  const primary = token.primaryMarket || null;
  return {
    status: token.status || "OBSERVED",
    chain: token.chain,
    address: token.address,
    family: token.family,
    observationQuality: token.observationQuality || null,
    primaryMarket: primary ? {
      dexId: primary.dexId || null,
      pairAddress: primary.pairAddress || null,
      quoteSymbol: primary.quoteToken?.symbol || null,
      priceUsd: primary.priceUsd ?? null,
      priceNative: primary.priceNative ?? null,
      liquidityUsd: primary.liquidityUsd ?? null,
      volume24hUsd: primary.volume?.h24 ?? null,
      priceChange24hPct: primary.priceChangePct?.h24 ?? null
    } : null,
    aggregateObservedLiquidityUsd: token.aggregateObservedLiquidityUsd ?? null,
    aggregateObservedVolume24hUsd: token.aggregateObservedVolume24hUsd ?? null,
    executableQuotes: token.executableQuotes || { status: "NOT_MEASURED" },
    trends: trends?.data?.tokens?.[id]?.windows || null
  };
}

function sourceSummary(source) {
  return {
    file: source.file,
    available: source.available,
    generatedAt: timestampOf(source),
    status: statusOf(source)
  };
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const market = readJson("token-market-latest.json");
const chain = readJson("chain-intelligence.json");
const clear = readJson("clear-intelligence.json");
const swap = readJson("swap-observation.json");
const heartbeat = readJson("heartbeat.json");
const mining = readJson("mining-intelligence.json");
const trends = readJson("token-market-trends-latest.json");

const required = [market, trends, chain, clear, swap, heartbeat];
const availableRequired = required.filter((source) => source.available).length;
const generatedAt = new Date().toISOString();

const snapshot = {
  schemaVersion: 1,
  generatedAt,
  status: availableRequired === required.length ? "LIVE" : availableRequired > 0 ? "PARTIAL" : "UNAVAILABLE",
  scoreNeutral: true,
  purpose: "Timestamp-aligned factual Pond0x ecosystem snapshot for downstream research. No prediction, trading recommendation, strategy selection, or execution.",
  boundaries: {
    prediction: "NOT_INCLUDED",
    tradingSignal: "NOT_INCLUDED",
    strategy: "NOT_INCLUDED",
    execution: "NOT_INCLUDED",
    executableMarketQuotes: "PRESERVE_SOURCE_STATUS"
  },
  coverage: {
    required: required.length,
    availableRequired,
    optionalMiningAvailable: mining.available,
    ethereumTokens: ["PNDC", "PORK"],
    solanaTokens: ["wPOND", "PAPER"]
  },
  sources: {
    tokenMarket: sourceSummary(market),
    tokenMarketTrends: sourceSummary(trends),
    chainIntelligence: sourceSummary(chain),
    clearIntelligence: sourceSummary(clear),
    swapSurface: sourceSummary(swap),
    heartbeat: sourceSummary(heartbeat),
    miningIntelligence: sourceSummary(mining)
  },
  tokens: {
    PNDC: tokenState(market, trends, "pndc"),
    PORK: tokenState(market, trends, "pork"),
    wPOND: tokenState(market, trends, "wpond"),
    PAPER: tokenState(market, trends, "paper")
  },
  ecosystem: {
    chain: chain.available ? {
      status: chain.data.status || null,
      confidence: chain.data.confidence || null,
      activityState: chain.data.activityState || null,
      predictorStatus: chain.data.predictor?.status || null
    } : { status: "UNAVAILABLE" },
    clear: clear.available ? {
      status: clear.data.status || null,
      state: clear.data.state || null,
      scoreNeutral: clear.data.scoreNeutral ?? true
    } : { status: "UNAVAILABLE" },
    swapSurface: swap.available ? {
      status: statusOf(swap),
      comparison: swap.data.comparison || swap.data.details?.comparison || null,
      view: swap.data.view || swap.data.observation?.view || null
    } : { status: "UNAVAILABLE" },
    mining: mining.available ? {
      status: statusOf(mining) || mining.data.activityState || mining.data.classification || null,
      activityState: mining.data.activityState || null,
      scoreNeutral: mining.data.scoreNeutral ?? true
    } : { status: "UNAVAILABLE" }
  }
};

let history = { schemaVersion: 1, generatedAt, retention: { maxObservations: MAX_HISTORY, intendedCadenceMinutes: 60 }, observations: [] };
try {
  const previous = JSON.parse(fs.readFileSync(HISTORY, "utf8"));
  if (Array.isArray(previous.observations)) history.observations = previous.observations;
} catch {}

history.generatedAt = generatedAt;
history.observations.push(snapshot);
history.observations = history.observations.slice(-MAX_HISTORY);

fs.writeFileSync(OUTPUT, JSON.stringify(snapshot, null, 2));
fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2));

console.log(`Cross-chain Ecosystem Snapshot: ${snapshot.status} | sources=${availableRequired}/${required.length} | ETH=PNDC,PORK | SOL=wPOND,PAPER | history=${history.observations.length}`);
