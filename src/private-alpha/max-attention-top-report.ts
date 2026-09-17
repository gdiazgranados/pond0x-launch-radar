import type {
  MaxAttentionInboxCandidate,
  MaxAttentionInboxLedger,
  MaxAttentionReviewState,
} from "./max-attention-inbox-repository"
import type {
  MaxAttentionOnchainLedger,
} from "./max-attention-onchain-repository"
import type {
  MaxAttentionJupiterLedger,
} from "./max-attention-jupiter-repository"

export type MaxAttentionTopEntry = {
  rank: number
  identityKey: string
  symbol: string | null
  name: string | null
  attention: {
    appearanceCount: number
    newCount: number
    reappearedCount: number
    bestPosition: number
    latestPosition: number
    firstAttentionAt: string
    lastAttentionAt: string
  }
  humanReview: {
    state: MaxAttentionReviewState
    required: true
  }
  validation: {
    onchainStatus: string
    routeStatus: string
    tokenProgram: string | null
    mintAuthorityPresent: boolean | null
    freezeAuthorityPresent: boolean | null
  }
  riskFlags: ReadonlyArray<string>
  successProbability: null
  investmentRecommendation: null
}

function compareCandidates(
  left: MaxAttentionInboxCandidate,
  right: MaxAttentionInboxCandidate
) {
  return (
    right.appearanceCount - left.appearanceCount ||
    left.bestPosition - right.bestPosition ||
    right.reappearedCount - left.reappearedCount ||
    Date.parse(right.lastAttentionAt) -
      Date.parse(left.lastAttentionAt) ||
    left.identityKey.localeCompare(right.identityKey)
  )
}

function generatedAt(now: (() => Date) | undefined) {
  const value = (now?.() ?? new Date()).toISOString()
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error("MAX attention Top 10 timestamp is invalid")
  }
  return value
}

export function buildMaxAttentionTopReport(input: {
  inbox: MaxAttentionInboxLedger
  onchain: MaxAttentionOnchainLedger
  jupiter: MaxAttentionJupiterLedger
  limit?: number
  now?: () => Date
}) {
  const limit = input.limit ?? 10
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error("MAX attention Top 10 limit must be from 1 to 10")
  }

  const onchainByIdentity = new Map(
    input.onchain.entries.map(entry => [entry.identityKey, entry])
  )
  const jupiterByIdentity = new Map(
    input.jupiter.entries.map(entry => [entry.identityKey, entry])
  )
  const ranked = [...input.inbox.candidates]
    .sort(compareCandidates)
    .slice(0, limit)
    .map((candidate, index): MaxAttentionTopEntry => {
      const onchain = onchainByIdentity.get(candidate.identityKey)
      const jupiter = jupiterByIdentity.get(candidate.identityKey)
      const validation = onchain?.validation
      const riskFlags = new Set<string>()

      if (candidate.state === "DISMISSED") {
        riskFlags.add("HUMAN_DISMISSED")
      }
      if (!onchain) riskFlags.add("ONCHAIN_VALIDATION_PENDING")
      if (validation && validation.status !== "VERIFIED_ONCHAIN") {
        riskFlags.add(`ONCHAIN_${validation.status}`)
      }
      if (validation?.mintAuthority) {
        riskFlags.add("MINT_AUTHORITY_PRESENT")
      }
      if (validation?.freezeAuthority) {
        riskFlags.add("FREEZE_AUTHORITY_PRESENT")
      }
      if (validation?.tokenProgram === "TOKEN_2022") {
        riskFlags.add("TOKEN_2022_PROGRAM")
      }
      if (!jupiter) riskFlags.add("ROUTE_VALIDATION_PENDING")
      if (
        jupiter &&
        jupiter.validation.status !== "ROUTE_AVAILABLE"
      ) {
        riskFlags.add(`ROUTE_${jupiter.validation.status}`)
      }

      return {
        rank: index + 1,
        identityKey: candidate.identityKey,
        symbol: candidate.symbol,
        name: candidate.name,
        attention: {
          appearanceCount: candidate.appearanceCount,
          newCount: candidate.newCount,
          reappearedCount: candidate.reappearedCount,
          bestPosition: candidate.bestPosition,
          latestPosition: candidate.latestPosition,
          firstAttentionAt: candidate.firstAttentionAt,
          lastAttentionAt: candidate.lastAttentionAt,
        },
        humanReview: {
          state: candidate.state,
          required: true,
        },
        validation: {
          onchainStatus:
            validation?.status ?? "PENDING",
          routeStatus:
            jupiter?.validation.status ?? "PENDING",
          tokenProgram:
            validation?.tokenProgram ?? null,
          mintAuthorityPresent:
            validation
              ? validation.mintAuthority !== null
              : null,
          freezeAuthorityPresent:
            validation
              ? validation.freezeAuthority !== null
              : null,
        },
        riskFlags: [...riskFlags],
        successProbability: null,
        investmentRecommendation: null,
      }
    })

  return {
    schemaVersion: 1 as const,
    type: "PONDOX_COMMUNITY_ATTENTION_TOP" as const,
    generatedAt: generatedAt(input.now),
    source: "PONDOX_MAX_SEARCH" as const,
    title: "Pond0x propone; la comunidad dispone",
    rankingBasis: [
      "APPEARANCE_COUNT_DESC",
      "BEST_POSITION_ASC",
      "REAPPEARANCE_COUNT_DESC",
      "LAST_ATTENTION_AT_DESC",
      "IDENTITY_KEY_ASC",
    ] as const,
    candidateCount: input.inbox.candidates.length,
    returnedCount: ranked.length,
    vacancies: Math.max(0, limit - ranked.length),
    entries: ranked,
    caveats: [
      "PONDOX_MAX_ATTENTION_IS_NOT_AN_OFFICIAL_ENDORSEMENT",
      "RANKING_MEASURES_OBSERVED_ATTENTION_NOT_TOKEN_SUCCESS",
      "TECHNICAL_VALIDATION_IS_NOT_FINANCIAL_VALIDATION",
      "COMMUNITY_AND_HUMAN_DECISION_REMAIN_REQUIRED",
    ] as const,
    watchOnly: true as const,
    approvalGranted: false as const,
    transactionRequested: false as const,
  }
}
