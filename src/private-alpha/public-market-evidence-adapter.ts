import type {
  MarketEvidence,
  ShadowChain,
  ShadowToken,
} from "./shadow-portfolio"
import type { SizeAwareQuoteObservation } from "./size-aware-quote"

type MarketSnapshot = {
  generatedAt?: string
  status?: string
  scoreNeutral?: boolean
  tokens?: Array<{
    symbol?: string
    chain?: string
    status?: string
    primaryMarket?: {
      pairAddress?: string | null
      priceUsd?: number | null
      liquidityUsd?: number | null
      volume?: { h24?: number | null }
    } | null
    executableQuotes?: { status?: string } | null
  }>
}

type TrendWindow = {
  status?: string
  requestedHours?: number
  baselineAt?: string | null
  actualHours?: number | null
  baselineQuality?: string
  marketContinuity?: {
    state?: string
    currentPairAddress?: string | null
    previousPrimaryPairAddress?: string | null
    samePairObserved?: boolean
  }
  anomalies?: string[]
}

type MarketTrends = {
  generatedAt?: string
  status?: string
  scoreNeutral?: boolean
  tokens?: Record<
    string,
    {
      symbol?: string
      chain?: string
      status?: string
      windows?: Record<string, TrendWindow>
    }
  >
}

export type AdaptedMarketEvidence = {
  tokenId: ShadowToken
  chain: ShadowChain
  currentReferenceUsd: number | null
  evidence: MarketEvidence
}

const TOKEN_KEY: Record<ShadowToken, string> = {
  PNDC: "pndc",
  PORK: "pork",
  wPOND: "wpond",
  PAPER: "paper",
}

const TOKEN_CHAIN: Record<ShadowToken, ShadowChain> = {
  PNDC: "ETHEREUM",
  PORK: "ETHEREUM",
  wPOND: "SOLANA",
  PAPER: "SOLANA",
}

function finiteOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function freshAt(
  generatedAt: string | undefined,
  now: Date,
  maxAgeMinutes: number
) {
  const observed = Date.parse(generatedAt ?? "")
  const age = now.getTime() - observed
  return (
    Number.isFinite(observed) &&
    age >= 0 &&
    age <= maxAgeMinutes * 60_000
  )
}

function blocking(code: string) {
  return { code, blocking: true as const }
}

export function adaptPublicMarketEvidence(
  snapshot: MarketSnapshot,
  trends: MarketTrends,
  tokenId: ShadowToken,
  windowKey: "1h" | "6h" | "24h",
  options: {
    now: Date
    maxAgeMinutes: number
    sizeAwareQuote?: SizeAwareQuoteObservation
  }
): AdaptedMarketEvidence {
  if (
    !Number.isFinite(options.maxAgeMinutes) ||
    options.maxAgeMinutes <= 0
  ) {
    throw new Error("maxAgeMinutes must be positive")
  }

  const token = snapshot.tokens?.find(
    (candidate) => candidate.symbol === tokenId
  )
  const trendToken = trends.tokens?.[TOKEN_KEY[tokenId]]
  const window = trendToken?.windows?.[windowKey]
  const market = token?.primaryMarket
  const anomalies: MarketEvidence["anomalies"][number][] = []

  if (snapshot.scoreNeutral !== true) {
    anomalies.push(blocking("SNAPSHOT_NOT_SCORE_NEUTRAL"))
  }
  if (trends.scoreNeutral !== true) {
    anomalies.push(blocking("TRENDS_NOT_SCORE_NEUTRAL"))
  }
  if (snapshot.generatedAt !== trends.generatedAt) {
    anomalies.push(blocking("SOURCE_TIMESTAMP_MISMATCH"))
  }
  if (
    snapshot.status !== "LIVE" ||
    token?.status !== "OBSERVED"
  ) {
    anomalies.push(blocking("MARKET_SNAPSHOT_UNAVAILABLE"))
  }
  const observedChain = token?.chain ?? trendToken?.chain
  if (
    observedChain?.toLowerCase() !==
    TOKEN_CHAIN[tokenId].toLowerCase()
  ) {
    anomalies.push(blocking("TOKEN_CHAIN_MISMATCH"))
  }
  if (
    trends.status !== "LIVE" ||
    trendToken?.status !== "OBSERVED" ||
    window?.status !== "OBSERVED"
  ) {
    anomalies.push(blocking("TREND_WINDOW_UNAVAILABLE"))
  }
  if (window?.baselineQuality === "STALE_BASELINE") {
    anomalies.push(blocking("STALE_BASELINE"))
  }
  for (const anomaly of window?.anomalies ?? []) {
    anomalies.push(blocking(`TREND:${anomaly}`))
  }
  const quote = options.sizeAwareQuote
  const quoteMeasured =
    quote?.status === "MEASURED" &&
    quote.tokenId === tokenId &&
    quote.chain === TOKEN_CHAIN[tokenId] &&
    quote.referencePairAddress === market?.pairAddress &&
    quote.blockingReasons.length === 0 &&
    finiteOrNull(quote.estimatedEntryPriceImpactPct) !== null &&
    freshAt(quote.observedAt, options.now, options.maxAgeMinutes)

  if (!quoteMeasured) {
    anomalies.push(blocking("SIZE_AWARE_QUOTE_NOT_MEASURED"))
  }

  const sourceFresh =
    freshAt(
      snapshot.generatedAt,
      options.now,
      options.maxAgeMinutes
    ) &&
    freshAt(
      trends.generatedAt,
      options.now,
      options.maxAgeMinutes
    )
  const continuity = window?.marketContinuity
  const samePair =
    continuity?.state === "SAME_PRIMARY_PAIR" &&
    continuity.samePairObserved === true

  return {
    tokenId,
    chain: TOKEN_CHAIN[tokenId],
    currentReferenceUsd: finiteOrNull(market?.priceUsd),
    evidence: {
      observedAt: snapshot.generatedAt ?? "",
      baselineObservedAt: window?.baselineAt ?? "",
      currentPairAddress:
        continuity?.currentPairAddress ??
        market?.pairAddress ??
        "",
      baselinePairAddress:
        continuity?.previousPrimaryPairAddress ?? "",
      marketContinuity: samePair
        ? "SAME_PAIR"
        : continuity?.state
          ? "POOL_CHANGED"
          : "UNKNOWN",
      currentLiquidityUsd: finiteOrNull(market?.liquidityUsd),
      rollingVolumeUsd: finiteOrNull(market?.volume?.h24),
      requestedLookbackHours:
        finiteOrNull(window?.requestedHours) ?? 0,
      actualLookbackHours: finiteOrNull(window?.actualHours),
      sourceFresh,
      anomalies,
      estimatedPriceImpactPct: quoteMeasured
        ? finiteOrNull(quote.estimatedEntryPriceImpactPct)
        : null,
    },
  }
}
