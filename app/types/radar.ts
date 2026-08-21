export type RadarLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" | "CRITICAL"

export type RadarProbability =
  | "STANDBY"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY HIGH"
  | "CRITICAL"

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
  weightedBoost?: number
  discoveryApiCount?: number
  discoveryKeywordCount?: number
  backendSignalCount?: number
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

  hasAccountApi?: boolean
  hasActiveSignal?: boolean
  hasActiveTrue?: boolean
  hasApiSurface?: boolean
  hasAuthApi?: boolean
  hasAuthSignals?: boolean
  hasCanClaimTrue?: boolean
  hasClaimApi?: boolean
  hasClaimSignal?: boolean
  hasEligibilitySignal?: boolean
  hasEligibleTrue?: boolean
  hasEnabledState?: boolean
  hasEnabledTrue?: boolean
  hasRewardActivation?: boolean
  hasRewardApi?: boolean
  hasRewardsArray?: boolean
}

export type DiscoveryMeta = {
  checkedAt?: string
  sourceSnapshotId?: string
  snapshotDir?: string
  newUnknownChange?: boolean
  keyFunctionCandidate?: string | null
  newLabels?: string[]
  newRoutes?: string[]
  newApiRoutes?: string[]
  newKeywords?: string[]
  criticalKeywords?: string[]

  apiResponseDrift?: {
    detected?: boolean
    changedRouteCount?: number
    changedRoutes?: Array<{
      route?: string
      previousFingerprint?: string | null
      currentFingerprint?: string | null
      previousSize?: number
      currentSize?: number
      sizeDelta?: number
      addedPaths?: string[]
      removedPaths?: string[]
    }>
  }

  [key: string]: unknown
}

export type RadarData = {
  id: string
  snapshotId?: string

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
  backendSignals?: string[]

  patternScore: number
  patterns: RadarPattern[]

  activationProbability: number
  rawActivationProbability?: number

  score: number
  rawScore?: number
  scorePercent?: number

  intensityClass?: string
  overdrive?: boolean

  portalArmed?: boolean
  launchImminent?: boolean

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
  whyItMatters?: string

  changedFiles: string[]
  generatedAt: string

  trend?: number
  trendDirection?: TrendDirection | string

  breakdown?: RadarBreakdown
  advancedSignals?: AdvancedSignals

  evidenceCorrelation?: {
    apiResponseDrift?: boolean
    newApiRoute?: boolean
    newLiveApiRoute?: boolean
    backendSignal?: boolean
    criticalKeyword?: boolean
    surfaceMovement?: boolean
    onchainMovement?: boolean
    evidenceCount?: number
    domainCount?: number
    classification?: "NONE" | "ISOLATED" | "MULTI_SURFACE" | "STRONG" | string
    domains?: {
      api?: boolean
      backend?: boolean
      semantic?: boolean
      webSurface?: boolean
      onchain?: boolean
    }
  }

  temporalCorrelation?: {
    windowMinutes?: number
    domainCount?: number
    sequence?: string[]
    events?: Array<{
      domain?: string
      seenAt?: string
      source?: string
    }>
    firstSeenAt?: string | null
    lastSeenAt?: string | null
    spanMinutes?: number | null
    classification?: "NONE" | "LOOSE" | "CLUSTERED" | "TIGHT_CLUSTER" | string
  }

  featureActivationEvidence?: {
    classification?: string
    comparable?: boolean

    buildChanged?: boolean
    previousBuildId?: string | null
    currentBuildId?: string | null

    unlockedFlags?: string[]
    lockedFlags?: string[]

    activatedRoutes?: Array<{
      route?: string | null
      previousStatus?: number | null
      currentStatus?: number | null
    }>

    deactivatedRoutes?: Array<{
      route?: string | null
      previousStatus?: number | null
      currentStatus?: number | null
    }>

    observedDormantRoutes?: Array<{
      route?: string
      status?: number | null
      finalUrl?: string | null
    }>

    convergence?: boolean
    activationCluster?: boolean
  }

  discovery?: DiscoveryMeta

  observability?: {
    status?: "HEALTHY" | "DEGRADED" | "BLIND_SPOT" | "UNKNOWN"
    blindSpot?: boolean
    degraded?: boolean
    reasons?: string[]
    navigationOk?: boolean
    documentCaptured?: boolean
    capturedResponseCount?: number
    firstPartyResponseCount?: number
    apiResponseCount?: number
    firstPartyApiCount?: number
  }

  alphaClass?: string
  alphaScore?: number
  triggerState?: string
  suggestedAction?: string

  activationState?: string
  activationAction?: string

  alertSignature?: string
  eta?: string
  eventType?: string
  matchedSignals?: string[]
  priority?: string
  signalFusion?: string
  signalRegime?: string
  signature?: string
}

export type AlertItem = {
  id?: string
  snapshotId?: string
  sentAt?: string
  generatedAt?: string
  priority?: string
  reason?: string
  signature?: string
  alertSignature?: string

  score?: number
  rawScore?: number
  scorePercent?: number

  activationProbability?: number
  rawActivationProbability?: number

  level?: RadarLevel | string
  trend?: number
  trendDirection?: TrendDirection | string

  movementPct?: number
  movementPercent?: number

  portalArmed?: boolean
  launchImminent?: boolean

  tags?: string[]
  patterns?: RadarPattern[]
  summary?: string
  insight?: string
  focusAreas?: string[]
  signals?: string[]
  signalType?: string
  probability?: RadarProbability | string

  eventType?: string
  signalFusion?: string
  signalRegime?: string
  alphaClass?: string
  triggerState?: string
  suggestedAction?: string
  eta?: string
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
  reason?: string

  level?: RadarLevel | string
  signalType?: string
  probability?: RadarProbability | string
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
