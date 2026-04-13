export type RadarLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH"
export type RadarProbability = "STANDBY" | "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH"
export type TrendDirection = "UP" | "DOWN" | "FLAT"

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
  movementPercent?: number

  addedPct: number
  addedPercent?: number

  changedPct: number
  changedPercent?: number

  signals: string[]
  patternScore: number
  patterns: RadarPattern[]

  activationProbability: number

  score: number
  rawScore?: number
  scorePercent?: number
  intensityClass?: string
  overdrive?: boolean

  level: RadarLevel | string
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
  trendDirection?: TrendDirection | string
  breakdown?: RadarBreakdown
  advancedSignals?: AdvancedSignals
  whyItMatters?: string
}

export type AlertItem = {
  id?: string
  sentAt?: string
  generatedAt?: string
  priority?: string
  reason?: string
  signature?: string

  score?: number
  rawScore?: number
  scorePercent?: number

  level?: RadarLevel | string
  trend?: number
  trendDirection?: TrendDirection | string

  movementPct?: number
  movementPercent?: number

  tags?: string[]
  patterns?: RadarPattern[]
  summary?: string
  insight?: string
  focusAreas?: string[]
  signals?: string[]
}

export type SentinelSurface = {
  label: string
  url: string
  currentStatus?: number | string
}

export type SentinelKeywordTrigger = {
  label: string
  url: string
  keywords: string[]
}

export type SentinelThreshold = {
  hasCandidateActivation?: boolean
  hasKeywordTrigger?: boolean
  hasMultiSurfaceChange?: boolean
  highPrioritySurfaceChanged?: boolean
  multipleSurfaceChange?: boolean
}

export type SentinelEvent = {
  id?: string
  checkedAt?: string
  triggeredAt?: string
  generatedAt?: string
  sentAt?: string
  surface?: string
  surfaces?: string[]
  changedSurfaces?: SentinelSurface[]
  keywordTriggers?: SentinelKeywordTrigger[]
  maxPriority?: number
  threshold?: SentinelThreshold
  status?: number
  finalUrl?: string
  changed?: boolean
  triggerReason?: string
  triggerThreshold?: string
  summary?: string
  level?: RadarLevel | string
  signalType?: string
  probability?: RadarProbability | string
  reason?: string
}

export type HeartbeatData = {
  source?: string
  lastRunAt?: string | null
  lastSuccessAt?: string | null
  status?: string
  scheduleMinutes?: number
}

export type RadarApiSyncMeta = {
  latestGeneratedAt?: string | null
  historyLatestAt?: string | null
  heartbeatAt?: string | null
  sentinelLatestAt?: string | null
  isSynchronized: boolean
  driftMs: number
}