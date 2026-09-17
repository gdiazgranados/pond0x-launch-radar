import type {
  MaxTrendingSnapshot,
} from "./max-trending-client"
import {
  deriveMaxAttentionDecisionTickets,
} from "./max-attention-decision-ticket-coordinator"
import type {
  MaxAttentionDecisionTicket,
} from "./max-attention-decision-ticket"
import {
  coordinateMaxTrendingAttentionObservation,
  type MaxTrendingAttentionObservationResult,
} from "./max-trending-attention-coordinator"
import {
  coordinatePendingMaxAttentionOnchain,
  type MaxAttentionMintValidator,
  type MaxAttentionOnchainRun,
} from "./max-attention-onchain-coordinator"
import {
  coordinatePendingMaxAttentionJupiter,
  type MaxAttentionJupiterRun,
  type MaxAttentionJupiterValidator,
} from "./max-attention-jupiter-coordinator"
import type {
  MaxAttentionInboxStore,
} from "./max-attention-inbox-repository"
import type {
  MaxAttentionOnchainStore,
} from "./max-attention-onchain-repository"
import type {
  MaxAttentionJupiterStore,
} from "./max-attention-jupiter-repository"
import type {
  MaxTrendingStore,
} from "./max-trending-snapshot-repository"
import {
  coordinateMaxCommunityResponse,
  type MaxCommunityResponseStore,
} from "./max-community-response-repository"

type ObserveMaxTrending = () => Promise<MaxTrendingSnapshot>

export type MaxTrendingOpportunityCycleResult =
  MaxTrendingAttentionObservationResult & {
    onchainValidation: MaxAttentionOnchainRun
    jupiterValidation: MaxAttentionJupiterRun
    decisionTickets: ReadonlyArray<MaxAttentionDecisionTicket>
    communityResponse: {
      persisted: boolean
      ledgerRevision: number
      totalEpisodes: number
      openEpisodes: number
      completedEpisodes: number
    }
  }

export async function coordinateMaxTrendingOpportunityCycle(input: {
  observationStore: MaxTrendingStore
  attentionInboxStore: MaxAttentionInboxStore
  onchainStore: MaxAttentionOnchainStore
  jupiterStore: MaxAttentionJupiterStore
  communityResponseStore: MaxCommunityResponseStore
  rpcUrl: string
  observe?: ObserveMaxTrending
  validateMint?: MaxAttentionMintValidator
  validateRoute?: MaxAttentionJupiterValidator
  diagnosticInputLamports?: string
  jupiterApiKey?: string
  now?: () => Date
}): Promise<MaxTrendingOpportunityCycleResult> {
  const observation = await coordinateMaxTrendingAttentionObservation({
    observationStore: input.observationStore,
    attentionInboxStore: input.attentionInboxStore,
    observe: input.observe,
  })
  const communityResponseResult = await coordinateMaxCommunityResponse({
    store: input.communityResponseStore,
    opportunity: observation.opportunity,
  })
  const communityEpisodes = communityResponseResult.ledger.episodes
  const communityResponse = {
    persisted: communityResponseResult.changed,
    ledgerRevision: communityResponseResult.ledger.revision,
    totalEpisodes: communityEpisodes.length,
    openEpisodes: communityEpisodes.filter(
      episode => episode.completedAt === null
    ).length,
    completedEpisodes: communityEpisodes.filter(
      episode => episode.completedAt !== null
    ).length,
  }
  const onchainValidation =
    await coordinatePendingMaxAttentionOnchain({
      inboxStore: input.attentionInboxStore,
      onchainStore: input.onchainStore,
      rpcUrl: input.rpcUrl,
      validateMint: input.validateMint,
      now: input.now,
    })
  const jupiterValidation =
    await coordinatePendingMaxAttentionJupiter({
      inboxStore: input.attentionInboxStore,
      onchainStore: input.onchainStore,
      jupiterStore: input.jupiterStore,
      validateRoute: input.validateRoute,
      diagnosticInputLamports: input.diagnosticInputLamports,
      apiKey: input.jupiterApiKey,
      now: input.now,
    })
  const decisionTickets = await deriveMaxAttentionDecisionTickets({
    inboxStore: input.attentionInboxStore,
    onchainStore: input.onchainStore,
    jupiterStore: input.jupiterStore,
    candidateIds: [
      ...observation.opportunity.candidates.map(
        candidate => candidate.candidateId
      ),
      ...onchainValidation.results.map(result => result.candidateId),
      ...jupiterValidation.results.map(result => result.candidateId),
    ],
    now: input.now,
  })

  return {
    ...observation,
    onchainValidation,
    jupiterValidation,
    decisionTickets,
    communityResponse,
  }
}
