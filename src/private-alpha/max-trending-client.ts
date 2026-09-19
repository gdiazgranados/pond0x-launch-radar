export const PONDOX_MAX_SEARCH_URL =
  "https://www.pond0x.com/api/max/search?q=&verified=false&network=all"

const MAX_RESPONSE_BYTES = 1_000_000
const MAX_TRENDING_ITEMS = 100

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>

type JsonRecord = Record<string, unknown>

export type MaxTrendingAsset = {
  network: string
  contractAddress: string
  symbol: string | null
  name: string | null
  position: number
  price?: number | null
  change24h?: number | null
  liquidity?: number | null
  marketCap?: number | null
  volume24h?: number | null
  identityKey: string
}

export type MaxTrendingSnapshot = {
  schemaVersion: 1
  observedAt: string
  status: "OBSERVED" | "EMPTY"
  query: {
    q: ""
    verified: false
    network: "all"
  }
  tokenCount: number
  trending: ReadonlyArray<MaxTrendingAsset>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
  source: "PONDOX_MAX_SEARCH"
}

function record(value: unknown): JsonRecord | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function firstString(
  values: ReadonlyArray<unknown>,
  maximumLength: number
) {
  for (const value of values) {
    if (typeof value !== "string") continue
    const normalized = value.trim()
    if (normalized && normalized.length <= maximumLength) {
      return normalized
    }
  }
  return null
}

function finiteNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null
}

function normalizeNetwork(value: string) {
  const normalized = value.trim().toLowerCase()
  const aliases: Record<string, string> = {
    eth: "ethereum",
    sol: "solana",
    bnb: "bsc",
    "binance-smart-chain": "bsc",
    arb: "arbitrum",
  }
  const network = aliases[normalized] ?? normalized

  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(network)) {
    throw new Error("MAX trending item has an invalid network")
  }
  return network
}

function normalizeContract(network: string, value: string) {
  const contract = value.trim()
  const evmNetworks = new Set([
    "ethereum",
    "bsc",
    "base",
    "arbitrum",
    "optimism",
    "polygon",
    "avalanche",
  ])

  if (
    evmNetworks.has(network) &&
    !/^0x[0-9a-fA-F]{40}$/.test(contract)
  ) {
    throw new Error("MAX trending item has an invalid EVM contract")
  }
  if (
    network === "solana" &&
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(contract)
  ) {
    throw new Error("MAX trending item has an invalid Solana mint")
  }
  if (
    !evmNetworks.has(network) &&
    network !== "solana" &&
    !/^[A-Za-z0-9:_-]{3,128}$/.test(contract)
  ) {
    throw new Error("MAX trending item has an invalid contract")
  }

  return evmNetworks.has(network)
    ? contract.toLowerCase()
    : contract
}

function parseAsset(value: unknown, position: number): MaxTrendingAsset {
  const item = record(value)
  const nested = record(item?.token)
  if (!item) {
    throw new Error("MAX trending item must be an object")
  }

  const networkValue = firstString([
    item.network,
    item.chain,
    item.chainId,
    nested?.network,
    nested?.chain,
    nested?.chainId,
  ], 32)
  const contractValue = firstString([
    item.contractAddress,
    item.tokenAddress,
    item.address,
    item.mint,
    nested?.contractAddress,
    nested?.tokenAddress,
    nested?.address,
    nested?.mint,
  ], 128)

  if (!networkValue || !contractValue) {
    throw new Error("MAX trending item lacks network or contract")
  }

  const network = normalizeNetwork(networkValue)
  const contractAddress = normalizeContract(network, contractValue)
  const symbol = firstString([
    item.symbol,
    item.ticker,
    nested?.symbol,
    nested?.ticker,
  ], 32)
  const name = firstString([
    item.name,
    nested?.name,
  ], 128)

  return {
    network,
    contractAddress,
    symbol,
    name,
    position,
    price: finiteNumberOrNull(item.price),
    change24h: finiteNumberOrNull(item.change24h),
    liquidity: finiteNumberOrNull(item.liquidity),
    marketCap: finiteNumberOrNull(item.marketCap),
    volume24h: finiteNumberOrNull(item.volume24h),
    identityKey: `${network}:${contractAddress}`,
  }
}

export function parseMaxTrendingPayload(
  payload: unknown,
  observedAt = new Date().toISOString()
): MaxTrendingSnapshot {
  const root = record(payload)
  if (!root || !Array.isArray(root.tokens) || !Array.isArray(root.trending)) {
    throw new Error("MAX search payload must contain tokens and trending arrays")
  }
  if (
    root.tokens.length > 1_000 ||
    root.trending.length > MAX_TRENDING_ITEMS
  ) {
    throw new Error("MAX search payload exceeds collection limits")
  }
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("MAX search observation timestamp is invalid")
  }

  const trending = root.trending.map((value, index) =>
    parseAsset(value, index + 1)
  )
  const identities = new Set<string>()
  for (const asset of trending) {
    if (identities.has(asset.identityKey)) {
      throw new Error("MAX search payload contains duplicate trending assets")
    }
    identities.add(asset.identityKey)
  }

  return {
    schemaVersion: 1,
    observedAt,
    status: trending.length === 0 ? "EMPTY" : "OBSERVED",
    query: { q: "", verified: false, network: "all" },
    tokenCount: root.tokens.length,
    trending,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "PONDOX_MAX_SEARCH",
  }
}

export async function observeMaxTrending(
  input: {
    fetcher?: FetchLike
    now?: () => Date
  } = {}
) {
  const response = await (input.fetcher ?? fetch)(PONDOX_MAX_SEARCH_URL, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "pond0x-launch-radar/1.0",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
    redirect: "error",
  })

  if (!response.ok) {
    throw new Error(`Pond0x MAX returned HTTP ${response.status}`)
  }
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Pond0x MAX returned non-JSON content")
  }
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Pond0x MAX response exceeds size limit")
  }

  const body = await response.text()
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Pond0x MAX response exceeds size limit")
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    throw new Error("Pond0x MAX returned invalid JSON")
  }

  return parseMaxTrendingPayload(
    payload,
    (input.now ?? (() => new Date()))().toISOString()
  )
}
