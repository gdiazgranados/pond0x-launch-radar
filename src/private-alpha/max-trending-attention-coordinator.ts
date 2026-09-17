import type {
  MaxTrendingSnapshot,
} from "./max-trending-client"
import {
  persistMaxAttentionCandidates,
  type MaxAttentionInboxStore,
} from "./max-attention-inbox-repository"
import {
  coordinateMaxTrendingObservation,
  type MaxTrendingObservationResult,
} from "./max-trending-observation-coordinator"
import type {
  MaxTrendingStore,
} from "./max-trending-snapshot-repository"

type ObserveMaxTrending = () => Promise<MaxTrendingSnapshot>

export type MaxTrendingAttentionObservationResult =
  MaxTrendingObservationResult & {
    attentionInbox: {
      persisted: boolean
      revision: number
      totalCandidates: number
      pendingReviewCount: number
      monitoringCount: number
      dismissedCount: number
    }
  }

export async function coordinateMaxTrendingAttentionObservation(input: {
  observationStore: MaxTrendingStore
  attentionInboxStore: MaxAttentionInboxStore
  observe?: ObserveMaxTrending
}): Promise<MaxTrendingAttentionObservationResult> {
  const observation = await coordinateMaxTrendingObservation({
    store: input.observationStore,
    observe: input.observe,
  })
  const persisted = await persistMaxAttentionCandidates({
    store: input.attentionInboxStore,
    opportunity: observation.opportunity,
  })
  const candidates = persisted.ledger.candidates

  return {
    ...observation,
    attentionInbox: {
      persisted: persisted.changed,
      revision: persisted.ledger.revision,
      totalCandidates: candidates.length,
      pendingReviewCount: candidates.filter(
        candidate => candidate.state === "PENDING_REVIEW"
      ).length,
      monitoringCount: candidates.filter(
        candidate => candidate.state === "MONITORING"
      ).length,
      dismissedCount: candidates.filter(
        candidate => candidate.state === "DISMISSED"
      ).length,
    },
  }
}
