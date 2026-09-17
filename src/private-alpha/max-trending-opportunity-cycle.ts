import type {
  MaxTrendingSnapshot,
} from "./max-trending-client"
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

type ObserveMaxTrending = () => Promise<MaxTrendingSnapshot>

export type MaxTrendingOpportunityCycleResult =
  MaxTrendingAttentionObservationResult & {
    onchainValidation: MaxAttentionOnchainRun
    jupiterValidation: MaxAttentionJupiterRun
  }

export async function coordinateMaxTrendingOpportunityCycle(input: {
  observationStore: MaxTrendingStore
  attentionInboxStore: MaxAttentionInboxStore
  onchainStore: MaxAttentionOnchainStore
  jupiterStore: MaxAttentionJupiterStore
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

  return {
    ...observation,
    onchainValidation,
    jupiterValidation,
  }
}
