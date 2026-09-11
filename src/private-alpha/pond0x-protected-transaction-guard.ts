import {
  PONDOX_REFERRAL_ACCOUNT,
} from "./pond0x-referral-vault-observer"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "./wpond-quote-observer"

export type Pond0xProtectedDirection =
  | "SOL_TO_WPOND"
  | "WPOND_TO_SOL"

export type Pond0xProtectedTransaction = {
  transactionId: string
  capturedAt: string
  feePayer: string
  requiredSigners: ReadonlyArray<string>
  direction: Pond0xProtectedDirection
  inputMint: string
  outputMint: string
  inputAmountBaseUnits: string
  minimumOutputAmountBaseUnits: string
  referralAccount: string | null
  estimatedNetworkFeeLamports: string
  simulatedInputDebitBaseUnits: string
  simulatedOutputCreditBaseUnits: string
  simulationSucceeded: boolean
  simulationError: string | null
  unexpectedValueTransferCount: number
  authorityChangeCount: number
  delegateApprovalCount: number
  tokenAccountCloseCount: number
  addressLookupTableMutationCount: number
}

export type Pond0xProtectedCampaign = {
  campaignId: string
  dedicatedWallet: string
  fundedUsdCents: number
  capitalAtRiskUsdCents: number
  transactionAmountUsdCents: number
  processedTransactionIds: ReadonlyArray<string>
}

export type Pond0xProtectedGuardDecision = {
  schemaVersion: 1
  status: "APPROVED" | "BLOCKED"
  signingEnabled: false
  transactionSubmitted: false
  campaignId: string
  transactionId: string
  transactionAmountUsdCents: number
  blockingReasons: ReadonlyArray<string>
  source: "PONDOX_PROTECTED_TRANSACTION_GUARD"
}

const MAX_CAPTURE_AGE_MS = 30_000
const MIN_TRANSACTION_USD_CENTS = 1_000
const MAX_TRANSACTION_USD_CENTS = 1_500
const MAX_CAMPAIGN_USD_CENTS = 10_000
const MAX_NETWORK_FEE_LAMPORTS = BigInt(1_000_000)

function positiveInteger(
  value: string | null | undefined
): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
}

function nonNegativeInteger(
  value: string | null | undefined
): value is string {
  return typeof value === "string" && /^\d+$/.test(value)
}

function validCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

export function evaluatePond0xProtectedTransaction(input: {
  now: string
  campaign: Pond0xProtectedCampaign
  transaction: Pond0xProtectedTransaction
}): Pond0xProtectedGuardDecision {
  const reasons: string[] = []
  const { campaign, transaction } = input

  const now = Date.parse(input.now)
  const capturedAt = Date.parse(transaction.capturedAt)
  if (!Number.isFinite(now) || !Number.isFinite(capturedAt)) {
    reasons.push("PONDOX_GUARD_TIMESTAMP_INVALID")
  } else if (
    capturedAt > now ||
    now - capturedAt > MAX_CAPTURE_AGE_MS
  ) {
    reasons.push("PONDOX_GUARD_TRANSACTION_STALE")
  }

  if (!campaign.campaignId.trim()) {
    reasons.push("PONDOX_GUARD_CAMPAIGN_ID_INVALID")
  }
  if (!transaction.transactionId.trim()) {
    reasons.push("PONDOX_GUARD_TRANSACTION_ID_INVALID")
  }
  if (
    transaction.transactionId &&
    campaign.processedTransactionIds.includes(
      transaction.transactionId
    )
  ) {
    reasons.push("PONDOX_GUARD_TRANSACTION_REPLAY")
  }

  if (
    !Number.isSafeInteger(campaign.fundedUsdCents) ||
    campaign.fundedUsdCents <= 0 ||
    campaign.fundedUsdCents > MAX_CAMPAIGN_USD_CENTS
  ) {
    reasons.push("PONDOX_GUARD_CAMPAIGN_FUNDING_OUT_OF_RANGE")
  }
  if (
    !Number.isSafeInteger(campaign.capitalAtRiskUsdCents) ||
    campaign.capitalAtRiskUsdCents < 0 ||
    campaign.capitalAtRiskUsdCents >
      MAX_CAMPAIGN_USD_CENTS
  ) {
    reasons.push("PONDOX_GUARD_CAMPAIGN_RISK_OUT_OF_RANGE")
  }
  if (
    !Number.isSafeInteger(campaign.transactionAmountUsdCents) ||
    campaign.transactionAmountUsdCents <
      MIN_TRANSACTION_USD_CENTS ||
    campaign.transactionAmountUsdCents >
      MAX_TRANSACTION_USD_CENTS
  ) {
    reasons.push("PONDOX_GUARD_TRANSACTION_USD_OUT_OF_RANGE")
  }

  if (
    !campaign.dedicatedWallet.trim() ||
    transaction.feePayer !== campaign.dedicatedWallet ||
    transaction.requiredSigners.length !== 1 ||
    transaction.requiredSigners[0] !== campaign.dedicatedWallet
  ) {
    reasons.push("PONDOX_GUARD_SIGNER_MISMATCH")
  }

  const expectedInputMint =
    transaction.direction === "SOL_TO_WPOND"
      ? WRAPPED_SOL_MINT
      : WPOND_MINT
  const expectedOutputMint =
    transaction.direction === "SOL_TO_WPOND"
      ? WPOND_MINT
      : WRAPPED_SOL_MINT

  if (
    transaction.inputMint !== expectedInputMint ||
    transaction.outputMint !== expectedOutputMint
  ) {
    reasons.push("PONDOX_GUARD_MINT_MISMATCH")
  }
  if (
    !positiveInteger(transaction.inputAmountBaseUnits) ||
    !positiveInteger(
      transaction.minimumOutputAmountBaseUnits
    ) ||
    !positiveInteger(
      transaction.simulatedInputDebitBaseUnits
    ) ||
    !positiveInteger(
      transaction.simulatedOutputCreditBaseUnits
    )
  ) {
    reasons.push("PONDOX_GUARD_AMOUNT_INVALID")
  } else {
    if (
      transaction.simulatedInputDebitBaseUnits !==
      transaction.inputAmountBaseUnits
    ) {
      reasons.push("PONDOX_GUARD_INPUT_DEBIT_MISMATCH")
    }
    if (
      BigInt(transaction.simulatedOutputCreditBaseUnits) <
      BigInt(transaction.minimumOutputAmountBaseUnits)
    ) {
      reasons.push("PONDOX_GUARD_MINIMUM_OUTPUT_NOT_MET")
    }
  }

  if (transaction.referralAccount !== PONDOX_REFERRAL_ACCOUNT) {
    reasons.push("PONDOX_GUARD_REFERRAL_MISMATCH")
  }

  if (
    !nonNegativeInteger(
      transaction.estimatedNetworkFeeLamports
    ) ||
    BigInt(transaction.estimatedNetworkFeeLamports) >
      MAX_NETWORK_FEE_LAMPORTS
  ) {
    reasons.push("PONDOX_GUARD_NETWORK_FEE_INVALID")
  }

  if (
    !transaction.simulationSucceeded ||
    transaction.simulationError !== null
  ) {
    reasons.push("PONDOX_GUARD_SIMULATION_FAILED")
  }

  const prohibitedCounts = [
    transaction.unexpectedValueTransferCount,
    transaction.authorityChangeCount,
    transaction.delegateApprovalCount,
    transaction.tokenAccountCloseCount,
    transaction.addressLookupTableMutationCount,
  ]
  if (prohibitedCounts.some(value => !validCount(value))) {
    reasons.push("PONDOX_GUARD_EFFECT_COUNT_INVALID")
  } else {
    if (transaction.unexpectedValueTransferCount > 0) {
      reasons.push("PONDOX_GUARD_UNEXPECTED_VALUE_TRANSFER")
    }
    if (transaction.authorityChangeCount > 0) {
      reasons.push("PONDOX_GUARD_AUTHORITY_CHANGE")
    }
    if (transaction.delegateApprovalCount > 0) {
      reasons.push("PONDOX_GUARD_DELEGATE_APPROVAL")
    }
    if (transaction.tokenAccountCloseCount > 0) {
      reasons.push("PONDOX_GUARD_TOKEN_ACCOUNT_CLOSE")
    }
    if (transaction.addressLookupTableMutationCount > 0) {
      reasons.push(
        "PONDOX_GUARD_LOOKUP_TABLE_MUTATION"
      )
    }
  }

  const blockingReasons = [...new Set(reasons)]

  return {
    schemaVersion: 1,
    status:
      blockingReasons.length === 0 ? "APPROVED" : "BLOCKED",
    signingEnabled: false,
    transactionSubmitted: false,
    campaignId: campaign.campaignId,
    transactionId: transaction.transactionId,
    transactionAmountUsdCents:
      campaign.transactionAmountUsdCents,
    blockingReasons,
    source: "PONDOX_PROTECTED_TRANSACTION_GUARD",
  }
}
