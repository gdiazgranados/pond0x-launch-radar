import {
  loadMaxAttentionInboxLedger,
  updateMaxAttentionCandidateState,
  type MaxAttentionInboxCandidate,
  type MaxAttentionInboxStore,
  type MaxAttentionReviewState,
} from "./max-attention-inbox-repository"

export type MaxAttentionReviewCommand =
  | { action: "LIST" }
  | {
      action: "SET_STATE"
      identityKey: string
      state: MaxAttentionReviewState
      dismissalReason: string | null
    }

function optionMap(args: ReadonlyArray<string>) {
  const options = new Map<string, string>()
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (!name?.startsWith("--")) {
      throw new Error(`unexpected MAX attention argument: ${name ?? ""}`)
    }
    if (!["--identity", "--state", "--reason"].includes(name)) {
      throw new Error(`unknown MAX attention option: ${name}`)
    }
    if (options.has(name)) {
      throw new Error(`duplicate MAX attention option: ${name}`)
    }
    const value = args[index + 1]
    if (!value || value.startsWith("--")) {
      throw new Error(`MAX attention option lacks value: ${name}`)
    }
    options.set(name, value.trim())
    index += 1
  }
  return options
}

export function parseMaxAttentionReviewCommand(
  args: ReadonlyArray<string>
): MaxAttentionReviewCommand {
  if (args.length === 0 || (args.length === 1 && args[0] === "list")) {
    return { action: "LIST" }
  }
  if (args[0] !== "set") {
    throw new Error("MAX attention command must be list or set")
  }

  const options = optionMap(args.slice(1))
  const identityKey = options.get("--identity") ?? ""
  const state = options.get("--state") ?? ""
  const reason = options.get("--reason")?.trim() || null
  if (
    !/^[a-z0-9][a-z0-9-]{1,31}:[^\s:][^\s]{1,199}$/.test(identityKey)
  ) {
    throw new Error(
      "MAX attention review requires an exact network:contract identity"
    )
  }
  if (
    state !== "PENDING_REVIEW" &&
    state !== "MONITORING" &&
    state !== "DISMISSED"
  ) {
    throw new Error("invalid MAX attention review state")
  }
  if (reason !== null && reason.length > 256) {
    throw new Error("MAX attention dismissal reason is too long")
  }
  if (state === "DISMISSED" ? reason === null : reason !== null) {
    throw new Error("MAX attention dismissal reason is inconsistent")
  }

  return {
    action: "SET_STATE",
    identityKey,
    state,
    dismissalReason: reason,
  }
}

function summarizeCandidate(candidate: MaxAttentionInboxCandidate) {
  return {
    identityKey: candidate.identityKey,
    network: candidate.network,
    contractAddress: candidate.contractAddress,
    symbol: candidate.symbol,
    name: candidate.name,
    state: candidate.state,
    firstAttentionAt: candidate.firstAttentionAt,
    lastAttentionAt: candidate.lastAttentionAt,
    appearanceCount: candidate.appearanceCount,
    newCount: candidate.newCount,
    reappearedCount: candidate.reappearedCount,
    firstPosition: candidate.firstPosition,
    latestPosition: candidate.latestPosition,
    bestPosition: candidate.bestPosition,
    dismissalReason: candidate.dismissalReason,
    financialAssessment: "NOT_PERFORMED" as const,
    successProbability: null,
    investmentRecommendation: null,
    requiresHumanDecision: true,
  }
}

function summary(
  ledger: Awaited<ReturnType<typeof loadMaxAttentionInboxLedger>>,
  changed: boolean
) {
  return {
    schemaVersion: 1,
    changed,
    ledgerRevision: ledger.revision,
    updatedAt: ledger.updatedAt,
    totalCandidates: ledger.candidates.length,
    pendingReviewCount: ledger.candidates.filter(
      candidate => candidate.state === "PENDING_REVIEW"
    ).length,
    monitoringCount: ledger.candidates.filter(
      candidate => candidate.state === "MONITORING"
    ).length,
    dismissedCount: ledger.candidates.filter(
      candidate => candidate.state === "DISMISSED"
    ).length,
    candidates: ledger.candidates.map(summarizeCandidate),
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

export async function runMaxAttentionReviewCommand(input: {
  store: MaxAttentionInboxStore
  command: MaxAttentionReviewCommand
  now?: () => Date
}) {
  if (input.command.action === "LIST") {
    return summary(
      await loadMaxAttentionInboxLedger(input.store),
      false
    )
  }

  const updatedAt = (input.now?.() ?? new Date()).toISOString()
  const updated = await updateMaxAttentionCandidateState({
    store: input.store,
    identityKey: input.command.identityKey,
    state: input.command.state,
    dismissalReason: input.command.dismissalReason,
    updatedAt,
  })
  return summary(updated.ledger, updated.changed)
}
