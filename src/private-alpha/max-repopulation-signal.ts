import type {
  MaxTrendingSnapshot,
} from "./max-trending-client"

export const MAX_REPOPULATION_SIGNAL_VERSION = "MAX_REPOP_V1" as const

type MaxRepopulationSnapshot = Pick<
  MaxTrendingSnapshot,
  "observedAt" | "trending"
>

export type MaxRepopulationCandidate = {
  identityKey: string
  network: string
  contractAddress: string
  symbol: string | null
  name: string | null
  rank: 2 | 3
  observedAt: string
  price: number | null
  change24h: number
  liquidity: number | null
  marketCap: number | null
  volume24h: number | null
}

export type MaxRepopulationSignal = {
  signalVersion: typeof MAX_REPOPULATION_SIGNAL_VERSION
  observedAt: string
  triggered: boolean
  previousTrendingCount: number
  currentTrendingCount: number
  candidates: ReadonlyArray<MaxRepopulationCandidate>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export function detectMaxRepopulationSignal(input: {
  previous: MaxRepopulationSnapshot
  current: MaxRepopulationSnapshot
}): MaxRepopulationSignal {
  const previousTrendingCount = input.previous.trending.length
  const currentTrendingCount = input.current.trending.length

  const triggered =
    previousTrendingCount === 0 &&
    currentTrendingCount === 5

  const candidates: MaxRepopulationCandidate[] = []

  if (triggered) {
    for (const asset of input.current.trending) {
      if (
        (asset.position !== 2 && asset.position !== 3) ||
        asset.change24h == null ||
        asset.change24h >= 20
      ) {
        continue
      }

      candidates.push({
        identityKey: asset.identityKey,
        network: asset.network,
        contractAddress: asset.contractAddress,
        symbol: asset.symbol,
        name: asset.name,
        rank: asset.position,
        observedAt: input.current.observedAt,
        price: asset.price ?? null,
        change24h: asset.change24h,
        liquidity: asset.liquidity ?? null,
        marketCap: asset.marketCap ?? null,
        volume24h: asset.volume24h ?? null,
      })
    }
  }

  return {
    signalVersion: MAX_REPOPULATION_SIGNAL_VERSION,
    observedAt: input.current.observedAt,
    triggered,
    previousTrendingCount,
    currentTrendingCount,
    candidates,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}
