import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type {
  MarketTrends,
} from "../../src/private-alpha/public-market-evidence-adapter"
import {
  observeWpondRoundTrip,
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

async function wpondDecimals() {
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
  if (!Number.isInteger(decimals)) {
    throw new Error("Solana RPC did not return mint decimals")
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

function timestampKey(value: string) {
  return value.replace(/[^0-9A-Za-z]/g, "")
}

async function main() {
  const [snapshot, trends, targetDecimals] = await Promise.all([
    jsonGet<WpondMarketSnapshot>(SNAPSHOT_URL),
    jsonGet<MarketTrends>(TRENDS_URL),
    wpondDecimals(),
  ])
  if (snapshot.generatedAt !== trends.generatedAt) {
    throw new Error("market snapshot and trends timestamps do not match")
  }

  const evaluatedAt = new Date().toISOString()
  const requestedNotionalUsd = positiveEnvironment(
    "SHADOW_NOTIONAL_USD",
    10
  )
  const maxAgeMinutes = positiveEnvironment(
    "SHADOW_MAX_AGE_MINUTES",
    15
  )
  const feeLamports = positiveEnvironment(
    "SHADOW_SOL_FEE_LAMPORTS",
    10_000
  )
  const sizeAwareQuote = await observeWpondRoundTrip(
    snapshot,
    {
      observedAt: evaluatedAt,
      requestedNotionalUsd,
      targetDecimals,
      estimatedFeeLamportsPerLeg: feeLamports,
      apiKey: process.env.JUPITER_API_KEY,
    }
  )
  const snapshotKey = timestampKey(String(snapshot.generatedAt))
  const evaluatedKey = timestampKey(evaluatedAt)
  const notionalKey = requestedNotionalUsd
    .toString()
    .replace(".", "-")
  const observationId =
    `wpond-${snapshotKey}-${evaluatedKey}-usd-${notionalKey}`
  const outputPath = resolve(
    process.env.SHADOW_OBSERVATION_INPUT ??
      "private-data/shadow-observation-input.json"
  )
  const archivePath = resolve(
    dirname(outputPath),
    "observations",
    `${observationId}.json`
  )
  const envelope = {
    decisionId: observationId,
    evaluatedAt,
    tokenId: "wPOND",
    positionId: `wpond-shadow-${observationId}`,
    ruleVersion: "private-wpond-v1",
    windowKey: "24h",
    maxAgeMinutes,
    operatorNote: "Read-only Jupiter round trip; simulation only",
    snapshot,
    trends,
    sizeAwareQuote,
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
    outputPath,
    archivePath,
    sourceGeneratedAt: snapshot.generatedAt,
    evaluatedAt,
    targetDecimals,
    requestedNotionalUsd,
    quoteStatus: sizeAwareQuote.status,
    buyRouteId: sizeAwareQuote.buyRouteId,
    sellRouteId: sizeAwareQuote.sellRouteId,
    blockingReasons: sizeAwareQuote.blockingReasons,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "wPOND quote observation failed"
  )
  process.exitCode = 1
})
