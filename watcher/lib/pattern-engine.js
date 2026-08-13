function detectPatterns(signals) {
  const patterns = []

  if (
    signals.hasWalletStrings &&
    signals.hasConnectUI &&
    signals.hasDisabledState
  ) {
    patterns.push({
      tag: "PRE-ACTIVATION",
      boost: 15,
      confidence: "HIGH",
      reasons: [
        "Wallet-related strings detected",
        "Connect UI detected",
        "UI still appears disabled",
      ],
    })
  }

  if (
    signals.hasRewardLogic &&
    signals.rewardsScore >= 55 &&
    signals.onchainFresh === true &&
    signals.hasOnchainMovement === false
  ) {
    patterns.push({
      tag: "REWARD_PREP",
      boost: 20,
      confidence: "HIGH",
      reasons: [
        "Reward logic detected in code or strings",
        "No confirming on-chain movement yet",
      ],
    })
  }

  if (
    signals.infraScore >= 60 &&
    signals.frontendScore < 40 &&
    signals.hasNewChunks
  ) {
    patterns.push({
      tag: "INFRA_STAGING",
      boost: 10,
      confidence: "MEDIUM",
      reasons: [
        "High infra churn detected",
        "Frontend remains relatively quiet",
        "New build chunks/assets detected",
      ],
    })
  }

  if (
    signals.frontendScore >= 60 &&
    signals.hasVisibleCTAChange &&
    signals.hasConnectUI
  ) {
    patterns.push({
      tag: "UI_ARMING",
      boost: 12,
      confidence: "HIGH",
      reasons: [
        "Connect UI visible",
        "CTA or interactive surface changed",
      ],
    })
  }

  if (
    signals.behaviorScore >= 65 ||
    signals.recentChangesCount >= 5 ||
    signals.movementPct >= 25
  ) {
    const reasons = []

    if (signals.behaviorScore >= 65) {
      reasons.push(
        `Behavioral signal convergence elevated (${signals.behaviorScore}/100)`
      )
    }

    if (signals.recentChangesCount >= 5) {
      reasons.push(
        `${signals.recentChangesCount} fresh surface changes detected`
      )
    }

    if (signals.movementPct >= 25) {
      reasons.push(
        `Observed movement threshold exceeded (${signals.movementPct}%)`
      )
    }

    patterns.push({
      tag: "BEHAVIOR_SPIKE",
      boost: 10,
      confidence: "MEDIUM",
      reasons,
    })
  }

  if (
    signals.frontendScore >= 65 &&
    signals.hasRewardLogic &&
    signals.hasOnchainMovement === true
  ) {
    patterns.push({
      tag: "CONFIRMED_ACTIVATION",
      boost: 25,
      confidence: "VERY HIGH",
      reasons: [
        "Frontend activation signals present",
        "Reward logic present",
        "On-chain activity confirms movement",
      ],
    })
  }

  const hasFreshActivationEvidence =
  signals.recentChangesCount >= 3 ||
  (
    signals.onchainFresh === true &&
    signals.hasOnchainMovement === true
  )

  if (
  signals.frontendScore >= 70 &&
  signals.rewardsScore >= 60 &&
  signals.behaviorScore >= 55 &&
  hasFreshActivationEvidence
) {
  const reasons = [
    "Frontend strongly active",
    "Reward preparation strong",
    "Behavioral cadence accelerated",
  ]

  if (signals.recentChangesCount >= 3) {
    reasons.push("Multiple fresh surface changes detected")
  }

  if (
    signals.onchainFresh === true &&
    signals.hasOnchainMovement === true
  ) {
    reasons.push("Fresh on-chain movement confirms activation activity")
  }

  patterns.push({
    tag: "LAUNCH_IMMINENT",
    boost: 30,
    confidence: "CRITICAL",
    reasons,
  })
}

  return patterns
}

module.exports = {
  detectPatterns,
}
