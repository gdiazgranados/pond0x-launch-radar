const fs = require("fs");
const path = require("path");
const { listTokens } = require("./token-market-registry");

const DATA_DIR = path.join(process.cwd(), "public", "data");
const LATEST_PATH = path.join(DATA_DIR, "token-market-latest.json");
const HISTORY_PATH = path.join(DATA_DIR, "token-market-history.json");
const MAX_HISTORY = 24 * 30; // ~30 days at the current hourly Radar cadence.
const REQUEST_TIMEOUT_MS = 12_000;

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "pond0x-launch-radar/1.0" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizePair(pair) {
  return {
    dexId: pair.dexId || null,
    pairAddress: pair.pairAddress || null,
    url: pair.url || null,
    baseToken: pair.baseToken ? {
      address: pair.baseToken.address || null,
      symbol: pair.baseToken.symbol || null,
      name: pair.baseToken.name || null
    } : null,
    quoteToken: pair.quoteToken ? {
      address: pair.quoteToken.address || null,
      symbol: pair.quoteToken.symbol || null,
      name: pair.quoteToken.name || null
    } : null,
    priceNative: finiteOrNull(pair.priceNative),
    priceUsd: finiteOrNull(pair.priceUsd),
    liquidityUsd: finiteOrNull(pair.liquidity?.usd),
    fdv: finiteOrNull(pair.fdv),
    marketCap: finiteOrNull(pair.marketCap),
    volume: {
      m5: finiteOrNull(pair.volume?.m5),
      h1: finiteOrNull(pair.volume?.h1),
      h6: finiteOrNull(pair.volume?.h6),
      h24: finiteOrNull(pair.volume?.h24)
    },
    priceChangePct: {
      m5: finiteOrNull(pair.priceChange?.m5),
      h1: finiteOrNull(pair.priceChange?.h1),
      h6: finiteOrNull(pair.priceChange?.h6),
      h24: finiteOrNull(pair.priceChange?.h24)
    },
    transactions: {
      m5: pair.txns?.m5 || null,
      h1: pair.txns?.h1 || null,
      h6: pair.txns?.h6 || null,
      h24: pair.txns?.h24 || null
    },
    pairCreatedAt: pair.pairCreatedAt || null
  };
}

function rankPairs(pairs) {
  return [...pairs].sort((a, b) => {
    const liquidityDelta = (finiteOrNull(b.liquidity?.usd) || 0) - (finiteOrNull(a.liquidity?.usd) || 0);
    if (liquidityDelta !== 0) return liquidityDelta;
    return (finiteOrNull(b.volume?.h24) || 0) - (finiteOrNull(a.volume?.h24) || 0);
  });
}

async function observeToken(token) {
  const endpoint = `https://api.dexscreener.com/token-pairs/v1/${token.chainId}/${token.address}`;
  try {
    const payload = await fetchJson(endpoint);
    const pairs = Array.isArray(payload) ? payload : [];
    const ranked = rankPairs(pairs);
    const topPairs = ranked.slice(0, 5).map(normalizePair);
    const primary = topPairs[0] || null;

    return {
      id: token.id,
      symbol: token.symbol,
      name: token.name,
      chain: token.chain,
      address: token.address,
      family: token.family,
      status: primary ? "OBSERVED" : "NO_MARKET_FOUND",
      observationQuality: primary ? "MARKET_SNAPSHOT" : "INSUFFICIENT_DATA",
      scoreNeutral: true,
      primaryMarket: primary,
      topMarkets: topPairs,
      marketCountObserved: pairs.length,
      aggregateObservedLiquidityUsd: ranked.reduce((sum, pair) => sum + (finiteOrNull(pair.liquidity?.usd) || 0), 0),
      aggregateObservedVolume24hUsd: ranked.reduce((sum, pair) => sum + (finiteOrNull(pair.volume?.h24) || 0), 0),
      executableQuotes: {
        status: "NOT_MEASURED_V1",
        note: "DEX market snapshots are not executable quotes. Size-aware buy/sell quotes will be added separately."
      },
      source: {
        provider: "DexScreener",
        endpoint
      }
    };
  } catch (error) {
    return {
      id: token.id,
      symbol: token.symbol,
      name: token.name,
      chain: token.chain,
      address: token.address,
      family: token.family,
      status: "SOURCE_ERROR",
      observationQuality: "UNAVAILABLE",
      scoreNeutral: true,
      primaryMarket: null,
      topMarkets: [],
      marketCountObserved: 0,
      aggregateObservedLiquidityUsd: null,
      aggregateObservedVolume24hUsd: null,
      executableQuotes: {
        status: "NOT_MEASURED_V1",
        note: "DEX market snapshots are not executable quotes. Size-aware buy/sell quotes will be added separately."
      },
      source: {
        provider: "DexScreener",
        endpoint,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const tokens = await Promise.all(listTokens().map(observeToken));
  const observed = tokens.filter((token) => token.status === "OBSERVED").length;

  const latest = {
    schemaVersion: 1,
    generatedAt,
    status: observed === tokens.length ? "LIVE" : observed > 0 ? "PARTIAL" : "UNAVAILABLE",
    scoreNeutral: true,
    purpose: "Cross-chain factual market observation for PNDC, PORK, wPOND and PAPER. No trading recommendation or Radar score impact.",
    coverage: {
      requested: tokens.length,
      observed,
      ethereum: tokens.filter((token) => token.chain === "ethereum" && token.status === "OBSERVED").length,
      solana: tokens.filter((token) => token.chain === "solana" && token.status === "OBSERVED").length
    },
    tokens
  };

  fs.writeFileSync(LATEST_PATH, JSON.stringify(latest, null, 2));

  const previous = readJson(HISTORY_PATH, { schemaVersion: 1, observations: [] });
  const observations = Array.isArray(previous.observations) ? previous.observations : [];
  observations.push(latest);
  const history = {
    schemaVersion: 1,
    generatedAt,
    retention: {
      maxObservations: MAX_HISTORY,
      intendedCadenceMinutes: 60
    },
    observations: observations.slice(-MAX_HISTORY)
  };
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  console.log(`Token Market Observer: ${latest.status} (${observed}/${tokens.length} assets observed)`);
  for (const token of tokens) {
    const market = token.primaryMarket;
    console.log(`- ${token.symbol} [${token.chain}] ${token.status}${market ? ` ${market.dexId || "DEX"} liquidity=$${market.liquidityUsd ?? "n/a"}` : ""}`);
  }
}

main().catch((error) => {
  console.error("Token Market Observer failed:", error);
  process.exitCode = 1;
});
