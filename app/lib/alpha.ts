type AlphaInput = {
  score?: number
  movementPct?: number
  trend?: number
  level?: string
  tags?: string[]
  signals?: string[]
  activationProbability?: number
  patternBoost?: number
  burstCount?: number
}

export type AlphaClass = "NOISE" | "WATCH" | "SETUP" | "ACTIONABLE" | "CRITICAL"
export type TriggerState = "IDLE" | "WATCHING" | "ARMED" | "TRIGGERED"

export type AlphaAssessment = {
  alphaScore: number
  alphaClass: AlphaClass
  triggerState: TriggerState
  suggestedAction: string
  reasons: string[]
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function evaluateAlpha(input?: AlphaInput | null): AlphaAssessment {
  const score = Number(input?.score ?? 0)
  const movementPct = Number(input?.movementPct ?? 0)
  const trend = Number(input?.trend ?? 0)
  const activationProbability = Number(input?.activationProbability ?? 0)
  const patternBoost = Number(input?.patternBoost ?? 0)
  const burstCount = Number(input?.burstCount ?? 0)

  const level = input?.level || "LOW"
  const tags = input?.tags || []
  const signals = input?.signals || []

  const reasons: string[] = []

  const hasRewards =
    tags.includes("REWARDS") ||
    signals.includes("reward") ||
    signals.includes("claim") ||
    signals.includes("payout")

  const hasWalletStack =
    signals.includes("connect") &&
    (signals.includes("ethereum") || signals.includes("solana"))

  const hasAuth =
    tags.includes("AUTH") ||
    signals.includes("verify") ||
    signals.includes("account") ||
    signals.includes("auth")

  const hasSystem =
    tags.includes("SYSTEM") || signals.includes("portal")

  let alphaRaw =
    score * 0.35 +
    movementPct * 0.15 +
    trend * 1.5 +
    activationProbability * 0.25 +
    patternBoost * 0.6 +
    burstCount * 4

  if (hasRewards) {
    alphaRaw += 12
    reasons.push("reward-adjacent signals detected")
  }

  if (hasWalletStack) {
    alphaRaw += 10
    reasons.push("wallet/connect stack detected")
  }

  if (hasAuth) {
    alphaRaw += 6
    reasons.push("auth/account changes detected")
  }

  if (hasSystem) {
    alphaRaw += 4
    reasons.push("system/portal surface involved")
  }

  if (level === "VERY HIGH") {
    alphaRaw += 15
    reasons.push("very high radar level")
  } else if (level === "HIGH") {
    alphaRaw += 10
    reasons.push("high radar level")
  } else if (level === "MEDIUM") {
    alphaRaw += 5
    reasons.push("medium radar level")
  }

  const alphaScore = clampScore(alphaRaw)

  let alphaClass: AlphaClass = "NOISE"
  if (alphaScore >= 85) alphaClass = "CRITICAL"
  else if (alphaScore >= 70) alphaClass = "ACTIONABLE"
  else if (alphaScore >= 50) alphaClass = "SETUP"
  else if (alphaScore >= 25) alphaClass = "WATCH"

  let triggerState: TriggerState = "IDLE"
  if (alphaScore >= 85) triggerState = "TRIGGERED"
  else if (alphaScore >= 70) triggerState = "ARMED"
  else if (alphaScore >= 25) triggerState = "WATCHING"

  let suggestedAction = "Ignore noise and continue baseline monitoring."

  if (alphaClass === "WATCH") {
    suggestedAction = "Watch closely and wait for confirmation."
  } else if (alphaClass === "SETUP") {
    suggestedAction = "Track closely, compare against previous sweeps, and prepare alerts."
  } else if (alphaClass === "ACTIONABLE") {
    suggestedAction = "High-conviction setup. Escalate alerts and monitor aggressively."
  } else if (alphaClass === "CRITICAL") {
    suggestedAction = "Critical signal. Treat as imminent event candidate and escalate immediately."
  }

  if (!reasons.length) {
    reasons.push("no high-conviction signal cluster detected")
  }

  return {
    alphaScore,
    alphaClass,
    triggerState,
    suggestedAction,
    reasons,
  }
}