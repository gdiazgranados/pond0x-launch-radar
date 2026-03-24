import {
  RADAR_ALERT_RULES,
  RADAR_CHANGE_TYPE_KEYWORDS,
  RADAR_FOCUS_AREAS,
  RADAR_KEYWORDS,
  RADAR_LEVELS,
  RADAR_NOISE_PENALTIES,
  RADAR_PERSISTENCE_RULES,
  RADAR_RARITY_RULES,
  RADAR_SCORE_WEIGHTS,
  RADAR_SENSITIVITY_BONUS,
  RADAR_SIGNIFICANCE,
  RADAR_SIGNIFICANCE_THRESHOLDS,
  type RadarChangeType,
  type RadarFocusArea,
  type RadarLevel,
  type RadarSignificance,
} from "../config/radar"

export type RadarSnapshotLike = {
  id?: string
  totalFiles?: number
  added?: number
  changed?: number
  movementCount?: number
  movementPct?: number
  addedPct?: number
  changedPct?: number
  signals?: string[]
  tags?: string[]
  summary?: string
  note?: string
  insight?: string
  level?: string
  score?: number
  trend?: number
  trendDirection?: string
  generatedAt?: string
  filePaths?: string[]
  changedFiles?: string[]
}

function normalizeTokens(input: Array<string | undefined | null>): string[] {
  return input
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .toLowerCase()
        .replace(/[_/.-]+/g, " ")
        .split(/\s+/)
    )
    .map((token) => token.trim())
    .filter(Boolean)
}

function buildSearchCorpus(snapshot: RadarSnapshotLike): string[] {
  const textSources = [
    ...(snapshot.signals || []),
    ...(snapshot.tags || []),
    ...(snapshot.filePaths || []),
    ...(snapshot.changedFiles || []),
    snapshot.summary,
    snapshot.note,
    snapshot.insight,
  ]

  return normalizeTokens(textSources)
}

export function detectFocusAreas(snapshot: RadarSnapshotLike): RadarFocusArea[] {
  const corpus = buildSearchCorpus(snapshot)
  const joined = corpus.join(" ")

  const matches = Object.entries(RADAR_KEYWORDS)
    .filter(([, keywords]) =>
      keywords.some((keyword) => joined.includes(keyword.toLowerCase()))
    )
    .map(([focusArea]) => focusArea as RadarFocusArea)

  return Array.from(new Set(matches))
}

export function detectSensitiveHits(snapshot: RadarSnapshotLike): string[] {
  const corpus = buildSearchCorpus(snapshot)
  const joined = corpus.join(" ")

  const hits = Object.values(RADAR_KEYWORDS)
    .flat()
    .filter((keyword) => joined.includes(keyword.toLowerCase()))

  return Array.from(new Set(hits))
}

export function detectChangeTypes(snapshot: RadarSnapshotLike): RadarChangeType[] {
  const corpus = buildSearchCorpus(snapshot)
  const joined = corpus.join(" ")

  const matches = Object.entries(RADAR_CHANGE_TYPE_KEYWORDS)
    .filter(([, keywords]) =>
      keywords.some((keyword) => joined.includes(keyword.toLowerCase()))
    )
    .map(([changeType]) => changeType as RadarChangeType)

  return Array.from(new Set(matches))
}

export function computeBaseScore(snapshot: RadarSnapshotLike): number {
  const movementPct = Number(snapshot.movementPct ?? 0)
  const changedPct = Number(snapshot.changedPct ?? 0)
  const addedPct = Number(snapshot.addedPct ?? 0)
  const movementCount = Number(snapshot.movementCount ?? 0)

  const weighted =
    movementPct * RADAR_SCORE_WEIGHTS.movementPct +
    changedPct * RADAR_SCORE_WEIGHTS.changedPct +
    addedPct * RADAR_SCORE_WEIGHTS.addedPct +
    Math.min(movementCount, RADAR_SCORE_WEIGHTS.movementCountCap) *
      RADAR_SCORE_WEIGHTS.movementCountUnit

  return clampScore(weighted)
}

export function computeSensitivityBonus(focusAreas: RadarFocusArea[]): number {
  return clampScore(
    focusAreas.reduce((sum, area) => sum + (RADAR_SENSITIVITY_BONUS[area] || 0), 0)
  )
}

function isQuietSnapshot(snapshot?: RadarSnapshotLike | null): boolean {
  if (!snapshot) return true

  const movementCount = Number(snapshot.movementCount ?? 0)
  const score = Number(snapshot.score ?? 0)
  const focusAreas = detectFocusAreas(snapshot)

  return movementCount === 0 && score === 0 && focusAreas.length === 0
}

export function computeRarityScore(
  current: RadarSnapshotLike,
  history: RadarSnapshotLike[]
): number {
  if (isQuietSnapshot(current)) return 0

  const recent = history.slice(0, RADAR_RARITY_RULES.quietSnapshotsLong)
  const shortRecent = recent.slice(0, RADAR_RARITY_RULES.quietSnapshotsShort)

  const shortQuietBreak =
    shortRecent.length === RADAR_RARITY_RULES.quietSnapshotsShort &&
    shortRecent.every((item) => isQuietSnapshot(item))

  const longQuietBreak =
    recent.length === RADAR_RARITY_RULES.quietSnapshotsLong &&
    recent.every((item) => isQuietSnapshot(item))

  let rarity = 0

  if (shortQuietBreak) rarity += RADAR_RARITY_RULES.bonusShortQuietBreak
  if (longQuietBreak) rarity += RADAR_RARITY_RULES.bonusLongQuietBreak

  const currentFocus = detectFocusAreas(current)
  const historyFocusFlat = recent.flatMap((item) => detectFocusAreas(item))
  const uniqueHistoryFocus = new Set(historyFocusFlat)

  currentFocus.forEach((area) => {
    if (!uniqueHistoryFocus.has(area)) {
      rarity += 10
    }
  })

  return clampScore(rarity)
}

export function computePersistenceBonus(
  current: RadarSnapshotLike,
  history: RadarSnapshotLike[]
): number {
  const currentFocus = detectFocusAreas(current)
  if (!currentFocus.length) return 0

  const recent = history.slice(0, RADAR_PERSISTENCE_RULES.minimumRepeatedSnapshots)

  const repeated = recent.filter((item) => {
    const itemFocus = detectFocusAreas(item)
    return currentFocus.some((focus) => itemFocus.includes(focus))
  })

  let bonus = 0

  if (repeated.length >= RADAR_PERSISTENCE_RULES.minimumRepeatedSnapshots) {
    bonus += RADAR_PERSISTENCE_RULES.repeatedFocusBonus

    const currentTrend = Number(current.trend ?? 0)
    if (currentTrend > 0) {
      bonus += RADAR_PERSISTENCE_RULES.repeatedFocusTrendBonus
    }
  }

  return clampScore(bonus)
}

export function computeNoisePenalty(changeTypes: RadarChangeType[]): number {
  if (!changeTypes.length) return 0

  const onlyStyle = changeTypes.every((type) => type === "style")
  const onlyAsset = changeTypes.every((type) => type === "asset")
  const cosmeticHeavy =
    changeTypes.includes("style") &&
    changeTypes.includes("asset") &&
    !changeTypes.some((type) =>
      ["route", "component", "text", "button", "form", "api", "config"].includes(type)
    )

  if (onlyStyle) return RADAR_NOISE_PENALTIES.styleOnly
  if (onlyAsset) return RADAR_NOISE_PENALTIES.assetOnly
  if (cosmeticHeavy) return RADAR_NOISE_PENALTIES.cosmeticHeavy

  return 0
}

export function computeFinalScore(
  current: RadarSnapshotLike,
  history: RadarSnapshotLike[]
): number {
  const focusAreas = detectFocusAreas(current)
  const changeTypes = detectChangeTypes(current)

  const baseScore = computeBaseScore(current)
  const sensitivityBonus = computeSensitivityBonus(focusAreas)
  const rarityScore = computeRarityScore(current, history)
  const persistenceBonus = computePersistenceBonus(current, history)
  const noisePenalty = computeNoisePenalty(changeTypes)

  return clampScore(
    baseScore + sensitivityBonus + rarityScore + persistenceBonus - noisePenalty
  )
}

export function computeSignificance(score: number, focusAreas: RadarFocusArea[]): RadarSignificance {
  if (score <= RADAR_SIGNIFICANCE_THRESHOLDS.none) {
    return RADAR_SIGNIFICANCE.NONE
  }

  if (
    RADAR_ALERT_RULES.rewardsFocusAlwaysWatch &&
    focusAreas.includes(RADAR_FOCUS_AREAS.REWARDS)
  ) {
    return score >= RADAR_SIGNIFICANCE_THRESHOLDS.highMin
      ? RADAR_SIGNIFICANCE.HIGH
      : RADAR_SIGNIFICANCE.WATCH
  }

  if (
    RADAR_ALERT_RULES.claimFocusAlwaysWatch &&
    focusAreas.includes(RADAR_FOCUS_AREAS.CLAIM)
  ) {
    return score >= RADAR_SIGNIFICANCE_THRESHOLDS.highMin
      ? RADAR_SIGNIFICANCE.HIGH
      : RADAR_SIGNIFICANCE.WATCH
  }

  if (score <= RADAR_SIGNIFICANCE_THRESHOLDS.lowMax) {
    return RADAR_SIGNIFICANCE.LOW
  }

  if (score <= RADAR_SIGNIFICANCE_THRESHOLDS.watchMax) {
    return RADAR_SIGNIFICANCE.WATCH
  }

  return RADAR_SIGNIFICANCE.HIGH
}

export function scoreToLevel(score: number): RadarLevel {
  if (score <= 0) return RADAR_LEVELS.LOW
  if (score < 25) return RADAR_LEVELS.LOW
  if (score < 55) return RADAR_LEVELS.MEDIUM
  if (score < 80) return RADAR_LEVELS.HIGH
  return RADAR_LEVELS.VERY_HIGH
}

export function shouldTriggerAlert(
  current: RadarSnapshotLike,
  history: RadarSnapshotLike[]
): boolean {
  const focusAreas = detectFocusAreas(current)
  const rarityScore = computeRarityScore(current, history)
  const finalScore = computeFinalScore(current, history)
  const significance = computeSignificance(finalScore, focusAreas)

  if (RADAR_ALERT_RULES.highSignificanceAlways && significance === RADAR_SIGNIFICANCE.HIGH) {
    return true
  }

  if (rarityScore >= RADAR_ALERT_RULES.rarityHighThreshold) {
    return true
  }

  if (
    RADAR_ALERT_RULES.rewardsFocusAlwaysWatch &&
    focusAreas.includes(RADAR_FOCUS_AREAS.REWARDS)
  ) {
    return true
  }

  if (
    RADAR_ALERT_RULES.claimFocusAlwaysWatch &&
    focusAreas.includes(RADAR_FOCUS_AREAS.CLAIM)
  ) {
    return true
  }

  return false
}

export function buildAlertFingerprint(current: RadarSnapshotLike): string {
  const focusAreas = detectFocusAreas(current).sort().join(",")
  const hits = detectSensitiveHits(current).sort().join(",")
  const level = current.level || ""
  const timestamp = current.generatedAt
    ? new Date(current.generatedAt).toISOString().slice(0, 13)
    : ""

  return [focusAreas, hits, level, timestamp].join("|")
}

export function summarizeRadarIntelligence(
  current: RadarSnapshotLike,
  history: RadarSnapshotLike[]
) {
  const focusAreas = detectFocusAreas(current)
  const sensitiveHits = detectSensitiveHits(current)
  const changeTypes = detectChangeTypes(current)
  const rarityScore = computeRarityScore(current, history)
  const score = computeFinalScore(current, history)
  const significance = computeSignificance(score, focusAreas)
  const level = scoreToLevel(score)

  return {
    focusAreas,
    sensitiveHits,
    changeTypes,
    rarityScore,
    score,
    significance,
    level,
    shouldAlert: shouldTriggerAlert(current, history),
    fingerprint: buildAlertFingerprint({
      ...current,
      score,
      level,
    }),
  }
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}