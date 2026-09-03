"use strict";

const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();

const { extractExternalClaims, simulateLedgerMerge } = require("./lib/mining-history-backfill");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const DISTRIBUTOR = "AYg4dKoZJudVkD7Eu3ZaJjkzfoaATUqfiv8w8pS53opT";
const REWARD_WALLET = "1orFCnFfgwPzSgUaoK6Wr3MjgXZ7mtk8NGz9Hh4iWWL";
const WPOND_MINT = "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const REQUEST_DELAY_MS = 650;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function option(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function boundedPages(value) {
  const parsed = Number(value || 8);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGES) {
    throw new Error(`--pages must be an integer between 1 and ${MAX_PAGES}`);
  }
  return parsed;
}

async function fetchPage(beforeSignature, attempt = 1) {
  const params = new URLSearchParams({
    "api-key": HELIUS_API_KEY,
    limit: String(PAGE_SIZE),
    "token-accounts": "balanceChanged",
  });
  if (beforeSignature) params.set("before-signature", beforeSignature);

  const response = await fetch(
    `https://api.helius.xyz/v0/addresses/${DISTRIBUTOR}/transactions?${params}`,
    { headers: { accept: "application/json" } }
  );

  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await sleep(500 * 2 ** (attempt - 1));
    return fetchPage(beforeSignature, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`Helius request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function fetchHistory(pages) {
  const transactions = [];
  const signatures = new Set();
  let beforeSignature = null;
  let exhausted = false;

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const rows = await fetchPage(beforeSignature);
    if (!Array.isArray(rows) || rows.length === 0) {
      exhausted = true;
      break;
    }
    for (const row of rows) {
      if (!row?.signature || signatures.has(row.signature)) continue;
      signatures.add(row.signature);
      transactions.push(row);
    }

    beforeSignature = rows.at(-1)?.signature || null;
    console.error(`Fetched page ${pageNumber}/${pages}: ${rows.length} transactions`);
    if (rows.length < PAGE_SIZE || !beforeSignature) {
      exhausted = true;
      break;
    }
    if (pageNumber < pages) await sleep(REQUEST_DELAY_MS);
  }

  return { transactions, exhausted };
}

async function main() {
  if (process.argv.includes("--write")) {
    throw new Error("Write mode is intentionally unavailable; review the dry-run report first");
  }
  if (!HELIUS_API_KEY) throw new Error("HELIUS_API_KEY is missing");

  const pages = boundedPages(option("pages"));
  const ledgerPath = path.resolve(
    option("ledger") || path.join(__dirname, "..", "public", "data", "reward-recipients.json")
  );
  const ledger = await fs.readJson(ledgerPath);
  const { transactions, exhausted } = await fetchHistory(pages);
  const claims = extractExternalClaims(transactions, {
    distributor: DISTRIBUTOR,
    rewardWallet: REWARD_WALLET,
    wpondMint: WPOND_MINT,
  });
  const generatedAt = new Date().toISOString();
  const simulation = simulateLedgerMerge(ledger, claims, generatedAt);

  console.log(JSON.stringify({
    version: "1.0.0",
    generatedAt,
    mode: "DRY_RUN",
    scoreNeutral: true,
    writesPerformed: false,
    request: { pages, pageSize: PAGE_SIZE, transactionsFetched: transactions.length },
    coverage: { historyExhausted: exhausted, pageLimitReached: !exhausted },
    ...simulation.summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Mining history backfill failed: ${error.message}`);
  process.exitCode = 1;
});
