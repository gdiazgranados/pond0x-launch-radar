const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();
const { buildClearIntelligence } = require("./lib/clear-intelligence");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const PAPER_MINT = "PAPERu8xjrqfjBLj8XG6FCiokuk7pG1GzUbRTYwX1nU";
const CCPU_MINT = "CCPU6wgqmMiWigL3Tffpg7NgPfKuBRePTmrhxqqizWSa";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CCPU_RESERVE = "8oJug97gz4nQktCJnGwhJ8Dvt7j9fFUhGoS3T17YvP9T";
const CLEARUSD_VAULT = "3VgwNAh4nxenN1g53WWVLn289tt84jRTPY6qHtXbFJzV";
const CLEAR_GATEWAY = "CLEARGWMrGw4pK3xTJS7WaUYPLZEhN4JGLx9f943WtP6";
const PAPER_PRINTER = "PRNT89RGpbBtzkCJMxgCyCeVkqaqVuVFLa1Cv5NsMpr";
const OUTPUT = path.join(__dirname, "..", "public", "data", "clear-intelligence.json");

function tokenAmount(value) {
  return Number(value?.uiAmountString ?? value?.uiAmount ?? 0) || 0;
}

async function rpc(method, params) {
  if (!HELIUS_API_KEY) throw new Error("HELIUS_API_KEY is missing");
  const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`${method} failed: ${body.error?.message || response.status}`);
  }
  return body.result;
}

async function getSupply(mint) {
  const result = await rpc("getTokenSupply", [mint, { commitment: "confirmed" }]);
  return tokenAmount(result?.value);
}

async function getOwnerTokenBalance(owner, mint) {
  const result = await rpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  return (result?.value || []).reduce((total, account) => {
    return total + tokenAmount(account?.account?.data?.parsed?.info?.tokenAmount);
  }, 0);
}

async function fetchEnhancedTransactions(address) {
  const response = await fetch(
    `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=100`,
    { headers: { accept: "application/json" } }
  );
  if (!response.ok) throw new Error(`Helius transactions failed: ${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

function programsIn(tx) {
  const ids = new Set();
  const walk = (instructions) => {
    for (const instruction of Array.isArray(instructions) ? instructions : []) {
      if (instruction?.programId) ids.add(instruction.programId);
      walk(instruction?.innerInstructions);
    }
  };
  walk(tx?.instructions);
  return ids;
}

function detectIssuanceEvents(transactions, nowSec = Math.floor(Date.now() / 1000)) {
  return transactions
    .filter((tx) => !tx?.transactionError && Number(tx?.timestamp || 0) >= nowSec - 24 * 60 * 60)
    .filter((tx) => {
      const programs = programsIn(tx);
      const transfers = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
      return programs.has(PAPER_PRINTER) &&
        transfers.some((transfer) => transfer?.mint === PAPER_MINT) &&
        transfers.some((transfer) => transfer?.mint === CCPU_MINT);
    })
    .map((tx) => ({
      signature: tx.signature,
      timestamp: new Date(Number(tx.timestamp) * 1000).toISOString(),
      paperAmount: (tx.tokenTransfers || [])
        .filter((transfer) => transfer?.mint === PAPER_MINT)
        .reduce((sum, transfer) => sum + Number(transfer?.tokenAmount || 0), 0),
      ccpuAmount: (tx.tokenTransfers || [])
        .filter((transfer) => transfer?.mint === CCPU_MINT)
        .reduce((sum, transfer) => sum + Number(transfer?.tokenAmount || 0), 0),
    }));
}

async function quote(inputMint, outputMint, amount) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    slippageBps: "100",
  });
  try {
    const response = await fetch(`https://lite-api.jup.ag/swap/v1/quote?${params}`);
    if (!response.ok) return { error: `HTTP_${response.status}` };
    const body = await response.json();
    return {
      inputMint,
      outputMint,
      inAmount: body.inAmount || String(amount),
      outAmount: body.outAmount || "0",
      priceImpactPct: body.priceImpactPct ?? null,
      routeLabels: (body.routePlan || []).map((step) => step?.swapInfo?.label).filter(Boolean),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "QUOTE_FAILED" };
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const [paperSupply, ccpuSupply, ccpuReserveBalance, vaultUsdc, transactions, usdcToPaper, paperToUsdc, usdcToCcpu, ccpuToUsdc] = await Promise.all([
    getSupply(PAPER_MINT),
    getSupply(CCPU_MINT),
    getOwnerTokenBalance(CCPU_RESERVE, CCPU_MINT),
    getOwnerTokenBalance(CLEARUSD_VAULT, USDC_MINT),
    fetchEnhancedTransactions(CCPU_MINT),
    quote(USDC_MINT, PAPER_MINT, 1_000_000),
    quote(PAPER_MINT, USDC_MINT, 1_000_000),
    quote(USDC_MINT, CCPU_MINT, 1_000_000),
    quote(CCPU_MINT, USDC_MINT, 1_000_000),
  ]);

  const issuanceEvents = detectIssuanceEvents(transactions);
  const previous = await fs.readJson(OUTPUT).catch(() => null);
  const intelligence = buildClearIntelligence({
    generatedAt,
    paperMint: PAPER_MINT,
    ccpuMint: CCPU_MINT,
    paperSupply,
    ccpuSupply,
    ccpuReserveBalance,
    vaultUsdc,
    issuanceEvents,
    issuanceObserved: issuanceEvents.length > 0 || previous?.activity?.issuanceObserved === true,
    redemptionObserved: previous?.activity?.redemptionObserved === true,
    portalPaperState: previous?.routes?.portalPaper || "HISTORICAL_QUOTE",
    quotes: { usdcToPaper, paperToUsdc, usdcToCcpu, ccpuToUsdc },
    evidence: [
      {
        type: "ON-CHAIN FACT",
        label: "PAPER/CCPU atomic issuance",
        source: "Solscan",
        url: "https://solscan.io/tx/XQAxmcFXdUUZpimT4LQ59rcs2RrZZyyeRwRjiiefZq2WMiqSA5z1bcLX8syYJLHUKaMkVvYU4hCNKkFZKecwW8V",
      },
      {
        type: "DOCUMENTATION",
        label: "Clear USD Factory specification",
        source: "Clear Protocol",
        url: "https://docs.clearsol.network/create_token/4_clear_usd",
      },
    ],
  });

  await fs.ensureDir(path.dirname(OUTPUT));
  await fs.writeJson(OUTPUT, intelligence, { spaces: 2 });
  console.log(`Clear Intelligence: ${intelligence.state} | PAPER=${paperSupply} | CCPU=${ccpuSupply} | reverse=${intelligence.routes.paperToUsdc}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("clear-intelligence failed:", error);
    process.exit(1);
  });
}

module.exports = { detectIssuanceEvents, programsIn };
