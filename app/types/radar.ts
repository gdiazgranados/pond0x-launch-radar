export type RadarPattern = {
  tag?: string
  boost?: number
  confidence?: string
  reasons?: string[]
}

export type RadarBreakdownBucket = {
  raw?: number
  weighted?: number
  hits?: string[]
}

export type RadarBreakdown = {
  frontend?: RadarBreakdownBucket
  infra?: RadarBreakdownBucket
  rewards?: RadarBreakdownBucket
  behavior?: RadarBreakdownBucket
  onchain?: {
    raw?: number
    hits?: string[]
  }
  patternBoost?: number
}

export type AdvancedSignals = {
  frontend?: string[]
  infra?: string[]
  rewards?: string[]
  behavior?: string[]
  onchain?: string[]
  frontendScore?: number
  infraScore?: number
  rewardsScore?: number
  behaviorScore?: number
  onchainScore?: number
  movementPct?: number
  recentChangesCount?: number
  hasWalletStrings?: boolean
  hasConnectUI?: boolean
  hasDisabledState?: boolean
  hasRewardLogic?: boolean
  hasOnchainMovement?: boolean
  hasNewChunks?: boolean
  hasVisibleCTAChange?: boolean
}

export type RadarData = {
  id: string
  totalFiles: number
  added: number
  changed: number
  movementCount: number
  movementPct: number
  addedPct: number
  changedPct: number
  signals: string[]
  patternScore: number
  patterns: RadarPattern[]
  activationProbability: number
  score: number
  level: string
  significance: string
  rarityScore: number
  focusAreas: string[]
  sensitiveHits: string[]
  changeTypes: string[]
  insight: string
  confidence: number
  tags: string[]
  summary: string
  note: string
  changedFiles: string[]
  generatedAt: string
  trend?: number
  trendDirection?: string
  breakdown?: RadarBreakdown
  advancedSignals?: AdvancedSignals
  whyItMatters?: string
}