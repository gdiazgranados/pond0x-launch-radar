import type {
  MaxTrendingChange,
  MaxTrendingDetection,
} from "./max-trending-change-detector"
import type {
  MaxTrendingAssetState,
} from "./max-trending-snapshot-repository"

export type MaxTrendingAttentionCandidate = {
  candidateId: string
  trigger: "NEW" | "REAPPEARED"
  stage: "FIRST_SEEN" | "RETURNED"
  identityKey: string
  network: string
  contractAddress: string
  symbol: string | null
  name: string | null
  position: number
  firstSeenAt: string
  lastSeenAt: string
  observationCount: number
  priority: "IMMEDIATE_REVIEW"
  successProbability: null
  investmentRecommendation: null
  requiresHumanDecision: true
}

export type MaxTrendingOpportunityClassification = {
  schemaVersion: 1
  observedAt: string
  status: "EARLY_ATTENTION" | "CONTEXT_ONLY" | "NO_CHANGE"
  candidates: ReadonlyArray<MaxTrendingAttentionCandidate>
  context: {
    moved: ReadonlyArray<MaxTrendingChange>
    removed: ReadonlyArray<MaxTrendingChange>
  }
  fastFollowUp: {
    recommended: boolean
    afterSeconds: 10 | null
  }
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

export function classifyMaxTrendingOpportunity(input: {
  detection: MaxTrendingDetection
  assetStates: ReadonlyArray<MaxTrendingAssetState>
  baseline?: boolean
}): MaxTrendingOpportunityClassification {
  const states = new Map(
    input.assetStates.map(state => [state.identityKey, state])
  )
  const candidateChanges = input.baseline
    ? []
    : input.detection.changes.filter(
        change => change.type === "NEW" || change.type === "REAPPEARED"
      )
  const candidates = candidateChanges.map(
    (change): MaxTrendingAttentionCandidate => {
      const state = states.get(change.identityKey)
      if (
        !state ||
        !state.active ||
        change.currentPosition === null
      ) {
        throw new Error(
          "MAX attention candidate lacks active persisted state"
        )
      }

      return {
        candidateId:
          `max-attention:${input.detection.observedAt}:${change.identityKey}`,
        trigger: change.type as "NEW" | "REAPPEARED",
        stage: change.type === "NEW" ? "FIRST_SEEN" : "RETURNED",
        identityKey: change.identityKey,
        network: change.asset.network,
        contractAddress: change.asset.contractAddress,
        symbol: change.asset.symbol,
        name: change.asset.name,
        position: change.currentPosition,
        firstSeenAt: state.firstSeenAt,
        lastSeenAt: state.lastSeenAt,
        observationCount: state.observationCount,
        priority: "IMMEDIATE_REVIEW",
        successProbability: null,
        investmentRecommendation: null,
        requiresHumanDecision: true,
      }
    }
  )
  const moved = input.detection.changes
    .filter(change => change.type === "MOVED")
    .map(change => structuredClone(change))
  const removed = input.detection.changes
    .filter(change => change.type === "REMOVED")
    .map(change => structuredClone(change))

  return {
    schemaVersion: 1,
    observedAt: input.detection.observedAt,
    status: candidates.length > 0
      ? "EARLY_ATTENTION"
      : moved.length > 0 || removed.length > 0
        ? "CONTEXT_ONLY"
        : "NO_CHANGE",
    candidates,
    context: { moved, removed },
    fastFollowUp: {
      recommended: candidates.length > 0,
      afterSeconds: candidates.length > 0 ? 10 : null,
    },
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}
