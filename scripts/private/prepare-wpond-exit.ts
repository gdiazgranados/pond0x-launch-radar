import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import type { MarketTrends } from "../../src/private-alpha/public-market-evidence-adapter"
import { loadShadowExecutionBasis } from "../../src/private-alpha/shadow-execution-basis"
import { loadShadowSimulationState } from "../../src/private-alpha/shadow-simulation-coordinator"
import { observeWpondExactExit } from "../../src/private-alpha/wpond-exit-quote"
import {
  WPOND_MINT,
  type WpondMarketSnapshot,
} from "../../src/private-alpha/wpond-quote-observer"

const SNAPSHOT_URL =
  "https://raw.githubusercontent.com/gdiazgranados/pond0x-launch-radar/radar-data/data/token-market-latest.json"
const TRENDS_URL =
  "https://raw.githubusercontent.com/gdiazgranados/pond0x-launch-radar/radar-data/data/token-market-trends-latest.json"
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ??
  "https://api.mainnet-beta.solana.com"

async function jsonGet<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GET failed with HTTP ${response.status}`)
  return response.json() as Promise<T>
}

async function verifiedDecimals() {
  const response = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenSupply",
      params: [WPOND_MINT],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new Error(`Solana RPC failed with HTTP ${response.status}`)
  }
  const payload = await response.json() as {
    result?: { value?: { decimals?: unknown } }
  }
  const decimals = Number(payload.result?.value?.decimals)
  if (decimals !== 3) {
    throw new Error("unexpected on-chain wPOND decimals")
  }
  return decimals
}

function positiveEnvironment(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive`)
  }
  return value
}

async function main() {
  const positionId = process.env.SHADOW_POSITION_ID
  if (!positionId?.trim()) {
    throw new Error("SHADOW_POSITION_ID is required")
  }
  const dataDirectory = resolve(
    process.env.SHADOW_DATA_DIR ?? "private-data"
  )
  const portfolioStore = new PrivateFileLedgerStore(
    resolve(dataDirectory, "shadow-portfolio.json")
  )
  const basisStore = new PrivateFileLedgerStore(
    resolve(dataDirectory, "shadow-execution-basis.json")
  )
  const [state, basisLedger, snapshot, trends, decimals] =
    await Promise.all([
      loadShadowSimulationState(portfolioStore),
      loadShadowExecutionBasis(basisStore),
      jsonGet<WpondMarketSnapshot>(SNAPSHOT_URL),
      jsonGet<MarketTrends>(TRENDS_URL),
      verifiedDecimals(),
    ])

  const position = state.portfolio.positions.find(
    (item) => item.positionId === positionId
  )
  if (!position || position.status !== "OPEN") {
    throw new Error("open shadow position not found")
  }
  const basis = basisLedger.records.find(
    (item) => item.positionId === positionId
  )
  if (!basis) {
    throw new Error("LEGACY_EXECUTION_BASIS_UNAVAILABLE")
  }
  if (
    basis.tokenId !== position.tokenId ||
    basis.chain !== position.chain ||
    basis.tokenDecimals !== decimals
  ) {
    throw new Error("shadow execution basis identity mismatch")
  }
  if (snapshot.generatedAt !== trends.generatedAt) {
    throw new Error("market snapshot and trends timestamps do not match")
  }

  const evaluatedAt = new Date().toISOString()
  const feeLamports = positiveEnvironment(
    "SHADOW_SOL_FEE_LAMPORTS",
    10_000
  )
  const sizeAwareQuote = await observeWpondExactExit(
    snapshot,
    basis,
    {
      observedAt: evaluatedAt,
      estimatedFeeLamports: feeLamports,
      apiKey: process.env.JUPITER_API_KEY,
    }
  )
  const outputPath = resolve(
    process.env.SHADOW_EXIT_INPUT ??
      "private-data/shadow-exit-input.json"
  )
  const archivePath = resolve(
    dataDirectory,
    "exits",
    `${positionId}-${evaluatedAt.replace(/[^0-9A-Za-z]/g, "")}.json`
  )
  const envelope = {
    positionId,
    evaluatedAt,
    snapshot,
    trends,
    sizeAwareQuote,
    windowKey: "24h" as const,
    maxAgeMinutes: 15,
  }
  const serialized = JSON.stringify(envelope, null, 2)

  await mkdir(dirname(archivePath), { recursive: true })
  await writeFile(archivePath, serialized, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, serialized, {
    encoding: "utf8",
    mode: 0o600,
  })

  console.log(JSON.stringify({
    simulationOnly: true,
    positionId,
    outputPath,
    archivePath,
    sourceGeneratedAt: snapshot.generatedAt,
    evaluatedAt,
    rawTokenAmount: basis.simulatedTokenAmountBaseUnits,
    tokenDecimals: basis.tokenDecimals,
    quoteStatus: sizeAwareQuote.status,
    sellRouteId: sizeAwareQuote.sellRouteId,
    blockingReasons: sizeAwareQuote.blockingReasons,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "wPOND exit quote failed"
  )
  process.exitCode = 1
})
