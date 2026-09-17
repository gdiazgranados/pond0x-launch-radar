import {
  buildMaxAttentionDecisionTicket,
  type MaxAttentionDecisionTicket,
} from "./max-attention-decision-ticket"
import {
  loadMaxAttentionInboxLedger,
  type MaxAttentionInboxStore,
} from "./max-attention-inbox-repository"
import {
  loadMaxAttentionOnchainLedger,
  type MaxAttentionOnchainStore,
} from "./max-attention-onchain-repository"
import {
  loadMaxAttentionJupiterLedger,
  type MaxAttentionJupiterStore,
} from "./max-attention-jupiter-repository"

const MAX_TICKETS_PER_CYCLE = 15

export async function deriveMaxAttentionDecisionTickets(input: {
  inboxStore: MaxAttentionInboxStore
  onchainStore: MaxAttentionOnchainStore
  jupiterStore: MaxAttentionJupiterStore
  candidateIds: ReadonlyArray<string>
  now?: () => Date
}): Promise<ReadonlyArray<MaxAttentionDecisionTicket>> {
  const candidateIds = [...new Set(input.candidateIds)]
  if (candidateIds.length > MAX_TICKETS_PER_CYCLE) {
    throw new Error("MAX decision ticket cycle limit exceeded")
  }
  if (candidateIds.length === 0) return []

  const [inbox, onchain, jupiter] = await Promise.all([
    loadMaxAttentionInboxLedger(input.inboxStore),
    loadMaxAttentionOnchainLedger(input.onchainStore),
    loadMaxAttentionJupiterLedger(input.jupiterStore),
  ])
  const requested = new Set(candidateIds)
  const onchainByCandidate = new Map(
    onchain.entries.map(entry => [entry.candidateId, entry])
  )
  const jupiterByCandidate = new Map(
    jupiter.entries.map(entry => [entry.candidateId, entry])
  )
  const candidatesById = new Map(
    inbox.candidates.flatMap(candidate => {
      if (candidate.state === "DISMISSED") return []
      const current = candidate.evidence.at(-1)
      return current ? [[current.candidateId, candidate] as const] : []
    })
  )

  return candidateIds.flatMap(candidateId => {
    if (!requested.has(candidateId)) return []
    const candidate = candidatesById.get(candidateId)
    if (!candidate) return []
    return [buildMaxAttentionDecisionTicket({
      candidate,
      onchain: onchainByCandidate.get(candidateId),
      jupiter: jupiterByCandidate.get(candidateId),
      now: input.now,
    })]
  })
}
