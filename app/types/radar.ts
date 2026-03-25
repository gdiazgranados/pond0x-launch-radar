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
  score: number
  level: "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" | string
  insight?: string
  confidence?: number
  tags?: string[]
  alert?: string | null
  summary: string
  note: string
  trend?: number
  trendDirection?: "UP" | "DOWN" | "FLAT" | string
  generatedAt: string
  significance?: "NONE" | "LOW" | "WATCH" | "HIGH" | string
  rarityScore?: number
  focusAreas?: string[]
  sensitiveHits?: string[]
  changeTypes?: string[]
  patternScore?: number
  patterns?: string[]
  activationProbability?: number
  whyItMatters?: string
}

export type AlertItem = {
  id: string
  level: string
  score: number
  movementPct: number
  trend: number
  trendDirection: string
  signals: string[]
  tags: string[]
  insight: string
  summary: string
  sentAt: string
  significance?: string
  focusAreas?: string[]
  sensitiveHits?: string[]
  changeTypes?: string[]
  patternScore?: number
  patterns?: string[]
  activationProbability?: number
  whyItMatters?: string
}

export type HeartbeatData = {
  source: string
  lastRunAt: string | null
  lastSuccessAt: string | null
  status: "unknown" | "running" | "success" | "failed" | string
  scheduleMinutes: number
}

export type SentinelChangedSurface = {
  url: string
  label: string
  kind: string
  previousStatus: number | null
  currentStatus: number
  diff?: {
    firstSeen?: boolean
    statusChanged?: boolean
    finalUrlChanged?: boolean
    etagChanged?: boolean
    lastModifiedChanged?: boolean
    contentLengthChanged?: boolean
    htmlHashChanged?: boolean
  }
}

export type SentinelKeywordTrigger = {
  url: string
  label: string
  keywords: string[]
}

export type SentinelEvent = {
  checkedAt: string
  changed: boolean
  triggerReason: string
  changedSurfaces: SentinelChangedSurface[]
  activatedCandidates: Array<{
    url: string
    label: string
    from: number
    to: number
  }>
  keywordTriggers: SentinelKeywordTrigger[]
  maxPriority?: number
  threshold?: {
    hasCandidateActivation?: boolean
    hasKeywordTrigger?: boolean
    highPrioritySurfaceChanged?: boolean
    multipleSurfaceChange?: boolean
  }
}