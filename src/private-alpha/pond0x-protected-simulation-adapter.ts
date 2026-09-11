import type {
  Pond0xProtectedCampaign,
  Pond0xProtectedDirection,
  Pond0xProtectedGuardDecision,
  Pond0xProtectedTransaction,
} from "./pond0x-protected-transaction-guard"
import {
  evaluatePond0xProtectedTransaction,
} from "./pond0x-protected-transaction-guard"
import {
  inspectSolanaWireTransaction,
} from "./solana-wire-transaction-inspector"
import type {
  SolanaWireTransactionInspection,
} from "./solana-wire-transaction-inspector"

export type Pond0xProtectedTransactionIntent = {
  transactionId: string
  capturedAt: string
  direction: Pond0xProtectedDirection
  inputMint: string
  outputMint: string
  inputAmountBaseUnits: string
  minimumOutputAmountBaseUnits: string
  referralAccount: string | null
}

export type Pond0xProtectedSimulationEvidence = {
  transactionId: string
  observedAt: string
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

export type Pond0xProtectedSimulationDecision = {
  schemaVersion: 1
  status: "APPROVED" | "BLOCKED"
  signingEnabled: false
  transactionSubmitted: false
  transactionId: string
  wireInspection: SolanaWireTransactionInspection
  guardDecision: Pond0xProtectedGuardDecision
  simulationObservedAt: string
  blockingReasons: ReadonlyArray<string>
  source: "PONDOX_PROTECTED_SIMULATION_ADAPTER"
}

export function evaluatePond0xProtectedSimulation(input: {
  now: string
  campaign: Pond0xProtectedCampaign
  transactionBase64: string
  intent: Pond0xProtectedTransactionIntent
  simulation: Pond0xProtectedSimulationEvidence
}): Pond0xProtectedSimulationDecision {
  const wireInspection = inspectSolanaWireTransaction(
    input.transactionBase64
  )
  const adapterReasons: string[] = [
    ...wireInspection.blockingReasons,
  ]

  if (
    input.intent.transactionId !==
    input.simulation.transactionId
  ) {
    adapterReasons.push(
      "PONDOX_SIMULATION_TRANSACTION_ID_MISMATCH"
    )
  }

  const simulationObservedAt = Date.parse(
    input.simulation.observedAt
  )
  const capturedAt = Date.parse(input.intent.capturedAt)
  if (
    !Number.isFinite(simulationObservedAt) ||
    !Number.isFinite(capturedAt) ||
    simulationObservedAt < capturedAt
  ) {
    adapterReasons.push(
      "PONDOX_SIMULATION_TIMESTAMP_INVALID"
    )
  }

  if (
    wireInspection.unresolvedProgramAddressIndices.length > 0
  ) {
    adapterReasons.push(
      "PONDOX_SIMULATION_PROGRAM_ADDRESS_UNRESOLVED"
    )
  }

  const transaction: Pond0xProtectedTransaction = {
    transactionId: input.intent.transactionId,
    capturedAt: input.intent.capturedAt,
    feePayer: wireInspection.feePayer ?? "",
    requiredSigners: wireInspection.requiredSigners,
    direction: input.intent.direction,
    inputMint: input.intent.inputMint,
    outputMint: input.intent.outputMint,
    inputAmountBaseUnits: input.intent.inputAmountBaseUnits,
    minimumOutputAmountBaseUnits:
      input.intent.minimumOutputAmountBaseUnits,
    referralAccount: input.intent.referralAccount,
    estimatedNetworkFeeLamports:
      input.simulation.estimatedNetworkFeeLamports,
    simulatedInputDebitBaseUnits:
      input.simulation.simulatedInputDebitBaseUnits,
    simulatedOutputCreditBaseUnits:
      input.simulation.simulatedOutputCreditBaseUnits,
    simulationSucceeded:
      input.simulation.simulationSucceeded,
    simulationError: input.simulation.simulationError,
    unexpectedValueTransferCount:
      input.simulation.unexpectedValueTransferCount,
    authorityChangeCount:
      input.simulation.authorityChangeCount,
    delegateApprovalCount:
      input.simulation.delegateApprovalCount,
    tokenAccountCloseCount:
      input.simulation.tokenAccountCloseCount,
    addressLookupTableMutationCount:
      input.simulation.addressLookupTableMutationCount,
  }
  const guardDecision = evaluatePond0xProtectedTransaction({
    now: input.now,
    campaign: input.campaign,
    transaction,
  })
  const blockingReasons = [
    ...new Set([
      ...adapterReasons,
      ...guardDecision.blockingReasons,
    ]),
  ]

  return {
    schemaVersion: 1,
    status:
      blockingReasons.length === 0 ? "APPROVED" : "BLOCKED",
    signingEnabled: false,
    transactionSubmitted: false,
    transactionId: input.intent.transactionId,
    wireInspection,
    guardDecision,
    simulationObservedAt: input.simulation.observedAt,
    blockingReasons,
    source: "PONDOX_PROTECTED_SIMULATION_ADAPTER",
  }
}
