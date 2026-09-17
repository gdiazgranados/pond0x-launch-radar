import type {
  MaxAttentionInboxCandidate,
  MaxAttentionReviewState,
} from "./max-attention-inbox-repository"
import type {
  MaxAttentionOnchainEntry,
} from "./max-attention-onchain-repository"
import type {
  MaxAttentionJupiterEntry,
} from "./max-attention-jupiter-repository"

export type MaxAttentionDecisionStatus =
  | "EARLY_REVIEW"
  | "VALIDATION_PENDING"
  | "ROUTE_CONFIRMED"
  | "BLOCKED"
  | "DATA_UNAVAILABLE"

export type MaxAttentionDecisionTicket = {
  schemaVersion: 1
  ticketId: string
  candidateId: string
  generatedAt: string
  triggeredAt: string
  trigger: "NEW" | "REAPPEARED"
  status: MaxAttentionDecisionStatus
  identity: {
    identityKey: string
    network: string
    contractAddress: string
    symbol: string | null
    name: string | null
  }
  attention: {
    latestPosition: number
    bestPosition: number
    appearanceCount: number
    firstSeenAt: string
    lastSeenAt: string
  }
  humanReview: {
    state: MaxAttentionReviewState
    stateUpdatedAt: string
    dismissalReason: string | null
    required: true
  }
  onchain: {
    status: "PENDING" | MaxAttentionOnchainEntry["validation"]["status"]
    tokenProgram: string | null
    decimals: number | null
    supplyRaw: string | null
    mintAuthority: string | null
    freezeAuthority: string | null
  }
  route: {
    status: "PENDING" | MaxAttentionJupiterEntry["validation"]["status"]
    diagnosticInputLamports: string | null
    outputAmountBaseUnits: string | null
    routeId: string | null
    venueIds: ReadonlyArray<string>
  }
  riskFlags: ReadonlyArray<string>
  caveats: ReadonlyArray<string>
  successProbability: null
  investmentRecommendation: null
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
}

function timestamp(now: (() => Date) | undefined) {
  const value = (now?.() ?? new Date()).toISOString()
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error("MAX attention ticket timestamp is invalid")
  }
  return value
}

function currentEvidence(candidate: MaxAttentionInboxCandidate) {
  const evidence = candidate.evidence.at(-1)
  if (!evidence) {
    throw new Error("MAX attention ticket candidate lacks evidence")
  }
  return evidence
}

function assertMatchingEvidence(input: {
  candidate: MaxAttentionInboxCandidate
  candidateId: string
  identityKey: string
  label: string
}) {
  const current = currentEvidence(input.candidate)
  if (
    input.identityKey !== input.candidate.identityKey ||
    input.candidateId !== current.candidateId
  ) {
    throw new Error(
      `MAX attention ticket ${input.label} evidence is stale or mismatched`
    )
  }
}

function status(input: {
  candidate: MaxAttentionInboxCandidate
  onchain?: MaxAttentionOnchainEntry | null
  jupiter?: MaxAttentionJupiterEntry | null
}): MaxAttentionDecisionStatus {
  if (input.candidate.state === "DISMISSED") return "BLOCKED"
  if (input.onchain?.validation.status === "BLOCKED") return "BLOCKED"
  if (input.jupiter?.validation.status === "BLOCKED") return "BLOCKED"
  if (!input.onchain) return "EARLY_REVIEW"
  if (input.onchain.validation.status === "UNAVAILABLE") {
    return "DATA_UNAVAILABLE"
  }
  if (input.onchain.validation.status === "INCOMPLETE") {
    return "VALIDATION_PENDING"
  }
  if (!input.jupiter) return "VALIDATION_PENDING"
  if (input.jupiter.validation.status === "UNAVAILABLE") {
    return "DATA_UNAVAILABLE"
  }
  return "ROUTE_CONFIRMED"
}

export function buildMaxAttentionDecisionTicket(input: {
  candidate: MaxAttentionInboxCandidate
  onchain?: MaxAttentionOnchainEntry | null
  jupiter?: MaxAttentionJupiterEntry | null
  now?: () => Date
}): MaxAttentionDecisionTicket {
  const evidence = currentEvidence(input.candidate)
  if (input.onchain) {
    assertMatchingEvidence({
      candidate: input.candidate,
      candidateId: input.onchain.candidateId,
      identityKey: input.onchain.identityKey,
      label: "on-chain",
    })
  }
  if (input.jupiter) {
    assertMatchingEvidence({
      candidate: input.candidate,
      candidateId: input.jupiter.candidateId,
      identityKey: input.jupiter.identityKey,
      label: "Jupiter",
    })
  }
  if (
    input.jupiter &&
    input.onchain?.validation.status !== "VERIFIED_ONCHAIN"
  ) {
    throw new Error(
      "MAX attention ticket Jupiter evidence lacks verified on-chain basis"
    )
  }

  const onchain = input.onchain?.validation
  const jupiter = input.jupiter?.validation
  const quote = jupiter?.quote ?? null
  const riskFlags = new Set<string>()
  if (input.candidate.state === "DISMISSED") {
    riskFlags.add("HUMAN_DISMISSED")
  }
  if (!onchain) riskFlags.add("ONCHAIN_VALIDATION_PENDING")
  if (onchain?.status === "INCOMPLETE") {
    riskFlags.add("ONCHAIN_EVIDENCE_INCOMPLETE")
  }
  if (onchain?.status === "UNAVAILABLE") {
    riskFlags.add("ONCHAIN_DATA_UNAVAILABLE")
  }
  if (onchain?.status === "BLOCKED") {
    riskFlags.add("ONCHAIN_VALIDATION_BLOCKED")
  }
  if (onchain?.mintAuthority) riskFlags.add("MINT_AUTHORITY_PRESENT")
  if (onchain?.freezeAuthority) riskFlags.add("FREEZE_AUTHORITY_PRESENT")
  if (onchain?.tokenProgram === "TOKEN_2022") {
    riskFlags.add("TOKEN_2022_PROGRAM")
  }
  if (
    onchain?.status === "VERIFIED_ONCHAIN" &&
    !jupiter
  ) {
    riskFlags.add("JUPITER_VALIDATION_PENDING")
  }
  if (jupiter?.status === "UNAVAILABLE") {
    riskFlags.add("JUPITER_DATA_UNAVAILABLE")
  }
  if (jupiter?.status === "BLOCKED") {
    riskFlags.add("JUPITER_VALIDATION_BLOCKED")
  }

  return {
    schemaVersion: 1,
    ticketId: `max-ticket:${evidence.candidateId}`,
    candidateId: evidence.candidateId,
    generatedAt: timestamp(input.now),
    triggeredAt: evidence.observedAt,
    trigger: evidence.trigger,
    status: status(input),
    identity: {
      identityKey: input.candidate.identityKey,
      network: input.candidate.network,
      contractAddress: input.candidate.contractAddress,
      symbol: input.candidate.symbol,
      name: input.candidate.name,
    },
    attention: {
      latestPosition: input.candidate.latestPosition,
      bestPosition: input.candidate.bestPosition,
      appearanceCount: input.candidate.appearanceCount,
      firstSeenAt: input.candidate.firstSeenAt,
      lastSeenAt: input.candidate.lastSeenAt,
    },
    humanReview: {
      state: input.candidate.state,
      stateUpdatedAt: input.candidate.stateUpdatedAt,
      dismissalReason: input.candidate.dismissalReason,
      required: true,
    },
    onchain: {
      status: onchain?.status ?? "PENDING",
      tokenProgram: onchain?.tokenProgram ?? null,
      decimals: onchain?.decimals ?? null,
      supplyRaw: onchain?.supplyRaw ?? null,
      mintAuthority: onchain?.mintAuthority ?? null,
      freezeAuthority: onchain?.freezeAuthority ?? null,
    },
    route: {
      status: jupiter?.status ?? "PENDING",
      diagnosticInputLamports:
        jupiter?.diagnosticInputLamports ?? null,
      outputAmountBaseUnits:
        quote?.outputAmountBaseUnits ?? null,
      routeId: quote?.routeId ?? null,
      venueIds: quote ? [...quote.venueIds] : [],
    },
    riskFlags: [...riskFlags],
    caveats: [...new Set([
      "PONDOX_MAX_IS_AN_ATTENTION_TRIGGER_NOT_A_BUY_SIGNAL",
      "ROUTE_AVAILABILITY_DOES_NOT_PREDICT_TOKEN_SUCCESS",
      ...(onchain?.caveats ?? []),
      ...(jupiter?.caveats ?? []),
    ])],
    successProbability: null,
    investmentRecommendation: null,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}
