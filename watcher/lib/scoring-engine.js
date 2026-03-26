const { detectPatterns } = require("./pattern-engine")

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function round(n) {
  return Math.round(n * 100) / 100
}

function computeTrend(currentScore, history = [], signals = null) {
  if (!Array.isArray(history) || history.length === 0) {
    return { trend: 0, trendDirection: "FLAT" }
  }

  if (
    signals &&
    Number(signals.movementPct || 0) === 0 &&
    Number(signals.recentChangesCount || 0) === 0 &&
    Number(currentScore || 0) === 0
  ) {
    return { trend: 0, trendDirection: "FLAT" }
  }

  const recent = history.slice(-5)
  const avg =
    recent.reduce((sum, item) => sum + Number(item.score || 0), 0) / recent.length

  const delta = round(currentScore - avg)

  if (delta >= 8) return { trend: delta, trendDirection: "UP" }
  if (delta <= -8) return { trend: delta, trendDirection: "DOWN" }
  return { trend: delta, trendDirection: "FLAT" }
}

function resolveLevel(score, patterns) {
  const tags = patterns.map((p) => p.tag)

  if (tags.includes("LAUNCH_IMMINENT")) return "CRITICAL"
  if (tags.includes("CONFIRMED_ACTIVATION")) return "VERY HIGH"
  if (score >= 80) return "VERY HIGH"
  if (score >= 65) return "HIGH"
  if (score >= 45) return "MEDIUM"
  return "LOW"
}

function computeRadarScore(signals, history = []) {
  const frontendWeighted = signals.frontendScore * 0.35
  const infraWeighted = signals.infraScore * 0.25
  const rewardsWeighted = signals.rewardsScore * 0.25
  const behaviorWeighted = signals.behaviorScore * 0.15

  const baseScore = round(
    frontendWeighted +
      infraWeighted +
      rewardsWeighted +
      behaviorWeighted
  )

  const patterns = detectPatterns(signals)
  const patternBoost = patterns.reduce((sum, pattern) => sum + pattern.boost, 0)

  let finalScore = baseScore + patternBoost

  if (signals.hasOnchainMovement) {
    finalScore += 10
  }

  finalScore = clamp(round(finalScore))

  const { trend, trendDirection } = computeTrend(finalScore, history, signals)
  const level = resolveLevel(finalScore, patterns)
  const tags = [...new Set(patterns.map((p) => p.tag))]

  return {
    score: finalScore,
    level,
    trend,
    trendDirection,
    tags,
    patterns,
    breakdown: {
      frontend: {
        raw: signals.frontendScore,
        weighted: round(frontendWeighted),
        hits: signals.frontend,
      },
      infra: {
        raw: signals.infraScore,
        weighted: round(infraWeighted),
        hits: signals.infra,
      },
      rewards: {
        raw: signals.rewardsScore,
        weighted: round(rewardsWeighted),
        hits: signals.rewards,
      },
      behavior: {
        raw: signals.behaviorScore,
        weighted: round(behaviorWeighted),
        hits: signals.behavior,
      },
      onchain: {
        raw: signals.onchainScore,
        hits: signals.onchain,
      },
      patternBoost,
    },
  }
}

module.exports = {
  computeRadarScore,
}