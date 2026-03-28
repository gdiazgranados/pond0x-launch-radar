import { minutesSince } from "./date"
import type { RadarProbability } from "../types/radar"

export function clampPercent(value?: number) {
  const n = Number(value ?? 0)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, n))
}

export function getHeartbeatStatus(dateString?: string, scheduleMinutes = 60) {
  const mins = minutesSince(dateString)

  if (mins === null) {
    return {
      label: "UNKNOWN",
      tone: "text-slate-300",
      badge: "border-slate-500/30 bg-slate-500/10 text-slate-200",
      dot: "bg-slate-400",
    }
  }

  const schedule = Number(scheduleMinutes || 60)

  if (mins <= schedule) {
    return {
      label: "FRESH",
      tone: "text-emerald-300",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      dot: "bg-emerald-400",
    }
  }

  if (mins <= schedule * 2) {
    return {
      label: "LAGGING",
      tone: "text-yellow-300",
      badge: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
      dot: "bg-yellow-400",
    }
  }

  return {
    label: "STALE",
    tone: "text-red-300",
    badge: "border-red-500/30 bg-red-500/10 text-red-200",
    dot: "bg-red-400",
  }
}

export function buildLinePoints(
  values: number[],
  width: number,
  height: number,
  maxValue: number
) {
  if (!values.length) return ""

  return values
    .map((value, index) => {
      const safeValue = Number(value ?? 0)
      const x =
        values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - (safeValue / Math.max(maxValue, 1)) * height
      return `${x},${y}`
    })
    .join(" ")
}

export function getLevelPalette(level?: string) {
  switch (level) {
    case "VERY HIGH":
      return {
        badge: "border-red-500/40 bg-red-500/10 text-red-200",
        text: "text-red-300",
        bar: "bg-red-500",
        dot: "bg-red-400",
        label: "ACTIVATION",
      }
    case "HIGH":
      return {
        badge: "border-orange-500/40 bg-orange-500/10 text-orange-200",
        text: "text-orange-300",
        bar: "bg-orange-400",
        dot: "bg-orange-400",
        label: "HEATING",
      }
    case "MEDIUM":
      return {
        badge: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
        text: "text-yellow-300",
        bar: "bg-yellow-400",
        dot: "bg-yellow-400",
        label: "BUILDING",
      }
    default:
      return {
        badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        text: "text-emerald-300",
        bar: "bg-emerald-400",
        dot: "bg-emerald-400",
        label: "WATCHING",
      }
  }
}

export function getSignalType(data?: { tags?: string[]; signals?: string[] } | null) {
  if (!data) return "SCANNING"

  const tags = data.tags || []
  const signals = data.signals || []

  if (tags.includes("REWARDS") || signals.includes("claim") || signals.includes("reward")) {
    return "REWARDS"
  }

  if (
    signals.includes("connect") &&
    (signals.includes("ethereum") || signals.includes("solana"))
  ) {
    return "CHAIN"
  }

  if (tags.includes("AUTH") || signals.includes("verify") || signals.includes("account")) {
    return "AUTH"
  }

  if (tags.includes("SYSTEM") || signals.includes("portal")) {
    return "SYSTEM"
  }

  return "SCANNING"
}

export function getLaunchProbability(data?: {
  level?: string
  trend?: number
  score?: number
  movementPct?: number
  tags?: string[]
  signals?: string[]
} | null): RadarProbability {
  if (!data) return "STANDBY"

  const score = Number(data.score ?? 0)
  const movementPct = Number(data.movementPct ?? 0)
  const tags = data.tags || []
  const signals = data.signals || []
  const signalType = getSignalType(data)
  const trend = Number(data.trend ?? 0)

  if (score === 0 && movementPct === 0 && tags.length === 0 && signals.length === 0) {
    return "STANDBY"
  }

  if (data.level === "VERY HIGH") return "VERY HIGH"

  if (data.level === "HIGH" || score >= 60 || (movementPct >= 30 && trend >= 5)) {
    return "HIGH"
  }

  if (
    data.level === "MEDIUM" ||
    trend >= 3 ||
    movementPct >= 10 ||
    signalType === "AUTH" ||
    signalType === "CHAIN" ||
    signalType === "REWARDS"
  ) {
    return "MEDIUM"
  }

  if (data.level === "LOW") return "LOW"

  return "LOW"
}

export function probabilityClass(probability: string) {
  switch (probability) {
    case "VERY HIGH":
      return "border-red-500/40 bg-red-500/10 text-red-200"
    case "HIGH":
      return "border-orange-500/40 bg-orange-500/10 text-orange-200"
    case "MEDIUM":
      return "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
    case "STANDBY":
      return "border-slate-500/30 bg-slate-500/10 text-slate-300"
    case "LOW":
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
  }
}

export function probabilityFromLevel(level?: string): RadarProbability {
  if (level === "VERY HIGH") return "VERY HIGH"
  if (level === "HIGH") return "HIGH"
  if (level === "MEDIUM") return "MEDIUM"
  if (level === "LOW") return "STANDBY"
  return "STANDBY"
}

export function getTickerTone(level?: string) {
  switch (level) {
    case "VERY HIGH":
      return "text-red-300"
    case "HIGH":
      return "text-orange-300"
    case "MEDIUM":
      return "text-yellow-300"
    case "DORMANT":
      return "text-slate-300"
    default:
      return "text-emerald-300"
  }
}

export function prioritizeLaunchSignals<
  T extends {
    level?: string
    tags?: string[]
    signals?: string[]
    score?: number
    movementPct?: number
    trend?: number
    trendDirection?: string
    id?: string
    generatedAt?: string
    breakdown?: unknown
  }
>(
  data?: T | null
): (T & {
  score: number
  movementPct: number
  trend: number
  level: string
  matchedSignals: string[]
}) | null {
  if (!data) return null

  const tags = data.tags || []
  const signals = data.signals || []

  let boostedScore = Number(data.score ?? 0)
  let boostedMovement = Number(data.movementPct ?? 0)
  let boostedTrend = Number(data.trend ?? 0)

  const criticalSignals = [
    "connect",
    "ethereum",
    "solana",
    "reward",
    "claim",
    "portal",
    "auth",
    "account",
    "verify",
  ]

  const matchedSignals = signals.filter((signal) => criticalSignals.includes(signal))

  const hasRewardsTag = tags.includes("REWARDS")
  const hasLaunchTag = tags.includes("LAUNCH_IMMINENT")

  boostedScore += matchedSignals.length * 8
  if (hasRewardsTag) boostedScore += 12
  if (hasLaunchTag) boostedScore += 20

  if (signals.includes("connect")) boostedMovement += 10
  if (signals.includes("ethereum") || signals.includes("solana")) boostedMovement += 8
  if (signals.includes("reward") || signals.includes("claim")) boostedTrend += 4

  let inferredLevel = data.level || "LOW"
  if (boostedScore >= 80) inferredLevel = "VERY HIGH"
  else if (boostedScore >= 60) inferredLevel = "HIGH"
  else if (boostedScore >= 30) inferredLevel = "MEDIUM"

  return {
    ...data,
    score: boostedScore,
    movementPct: boostedMovement,
    trend: boostedTrend,
    level: inferredLevel,
    matchedSignals,
  }
}

export function buildNarrative(data?: {
  level?: string
  tags?: string[]
  signals?: string[]
  score?: number
  movementPct?: number
  trend?: number
} | null) {
  if (!data) return null

  const level = data.level || "LOW"
  const tags = data.tags || []
  const signals = data.signals || []

  let headline = ""
  const context: string[] = []

  if (level === "VERY HIGH") {
    headline = "VERY HIGH SIGNAL — ACTIVATION CONDITIONS BUILDING"
  } else if (level === "HIGH") {
    headline = "HIGH SIGNAL — SYSTEM HEATING UP"
  } else if (level === "MEDIUM") {
    headline = "SIGNAL BUILDING — CONDITIONS STACKING"
  } else {
    headline = "WATCHING — SURFACE ACTIVITY DETECTED"
  }

  if (tags.includes("REWARDS")) context.push("REWARD_FLOW")
  if (signals.includes("connect")) context.push("UI_ARMING")
  if (signals.includes("ethereum") || signals.includes("solana")) {
    context.push("CHAIN_ACTIVITY")
  }
  if (Number(data.movementPct ?? 0) > 20) context.push("BEHAVIOR_SPIKE")
  if (Number(data.trend ?? 0) > 5) context.push("TREND_ACCELERATION")

  return { headline, context }
}