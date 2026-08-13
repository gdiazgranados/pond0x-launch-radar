type AlphaInput = {
  score?: number
  movementPct?: number
  trend?: number
  tags?: string[]
  signals?: string[]
  activationProbability?: number
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

  const hasActivation =
    signals.includes("enabled") ||
    signals.includes("isenabled") ||
    signals.includes("active")

  const positiveTrend = Math.max(0, trend)

  let alphaRaw =
    score * 0.25 +
    movementPct * 0.25 +
    positiveTrend * 1.25 +
    activationProbability * 0.15

  const structuralSignals = [
    hasRewards,
    hasWalletStack,
    hasAuth,
    hasActivation,
  ].filter(Boolean).length

  if (structuralSignals >= 3) {
    alphaRaw += 12
    reasons.push(`${structuralSignals}/4 structural signal groups aligned`)
  } else if (structuralSignals === 2) {
    alphaRaw += 7
    reasons.push("2/4 structural signal groups aligned")
  } else if (structuralSignals === 1) {
    alphaRaw += 3
    reasons.push("1/4 structural signal groups detected")
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