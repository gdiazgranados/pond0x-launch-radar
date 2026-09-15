import { isAddress } from "@solana/kit"

export type Pond0xPortalExecutionPolicy = {
  schemaVersion: 1
  dedicatedWallet: string
  maximumOperationUsdMicros: string
  maximumCycleUsdMicros: string
  spentCycleUsdMicros: string
  maximumEvidenceAgeMs: number
  cycleStatus: "ACTIVE" | "PAUSED" | "EXHAUSTED"
}

export type Pond0xPortalExecutionCandidate = {
  operationId: string
  capturedAt: string
  portalUrl: string
  wallet: string
  requestedUsdMicros: string
  capturedWireSha256: string
  simulatedWireSha256: string
  simulationSucceeded: boolean
}

export type Pond0xPortalExecutionPolicyDecision = {
  schemaVersion: 1
  status: "ELIGIBLE" | "BLOCKED"
  operationId: string
  requestedUsdMicros: string
  remainingCycleUsdMicrosBefore: string
  remainingCycleUsdMicrosAfter: string
  capturedWireSha256: string
  blockingReasons: ReadonlyArray<string>
  executionAuthorized: false
  signingEnabled: false
  transactionSubmitted: false
  source: "PONDOX_PORTAL_EXECUTION_POLICY"
}

function unsignedInteger(value: string) {
  return /^(0|[1-9]\d*)$/.test(value)
}

function positiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value)
}

function sha256(value: string) {
  return /^[0-9a-f]{64}$/.test(value)
}

function safeBigInt(value: string) {
  return unsignedInteger(value) ? BigInt(value) : null
}

function remaining(
  maximum: bigint | null,
  spent: bigint | null
) {
  if (maximum === null || spent === null || spent >= maximum) {
    return BigInt(0)
  }

  return maximum - spent
}

export function evaluatePond0xPortalExecutionPolicy(input: {
  now: string
  policy: Pond0xPortalExecutionPolicy
  candidate: Pond0xPortalExecutionCandidate
}): Pond0xPortalExecutionPolicyDecision {
  const reasons: string[] = []
  const maximumOperation = safeBigInt(
    input.policy.maximumOperationUsdMicros
  )
  const maximumCycle = safeBigInt(
    input.policy.maximumCycleUsdMicros
  )
  const spentCycle = safeBigInt(
    input.policy.spentCycleUsdMicros
  )
  const requested = positiveInteger(
    input.candidate.requestedUsdMicros
  )
    ? BigInt(input.candidate.requestedUsdMicros)
    : null

  const remainingBefore = remaining(
    maximumCycle,
    spentCycle
  )

  if (
    input.policy.schemaVersion !== 1 ||
    maximumOperation === null ||
    maximumOperation === BigInt(0) ||
    maximumCycle === null ||
    maximumCycle === BigInt(0) ||
    spentCycle === null ||
    spentCycle > maximumCycle ||
    !Number.isSafeInteger(
      input.policy.maximumEvidenceAgeMs
    ) ||
    input.policy.maximumEvidenceAgeMs <= 0
  ) {
    reasons.push("PONDOX_EXECUTION_POLICY_INVALID")
  }

  if (input.policy.cycleStatus !== "ACTIVE") {
    reasons.push("PONDOX_EXECUTION_CYCLE_NOT_ACTIVE")
  }

  if (
    !isAddress(input.policy.dedicatedWallet) ||
    input.candidate.wallet !==
      input.policy.dedicatedWallet
  ) {
    reasons.push(
      "PONDOX_EXECUTION_DEDICATED_WALLET_MISMATCH"
    )
  }

  let portalOrigin: string | null = null

  try {
    portalOrigin = new URL(
      input.candidate.portalUrl
    ).origin
  } catch {
    portalOrigin = null
  }

  if (portalOrigin !== "https://www.pond0x.com") {
    reasons.push("PONDOX_EXECUTION_PORTAL_ORIGIN_INVALID")
  }

  if (
    input.candidate.operationId.trim().length === 0 ||
    input.candidate.operationId.length > 128
  ) {
    reasons.push("PONDOX_EXECUTION_OPERATION_ID_INVALID")
  }

  const now = Date.parse(input.now)
  const capturedAt = Date.parse(
    input.candidate.capturedAt
  )

  if (
    !Number.isFinite(now) ||
    !Number.isFinite(capturedAt) ||
    capturedAt > now ||
    (
      Number.isSafeInteger(
        input.policy.maximumEvidenceAgeMs
      ) &&
      input.policy.maximumEvidenceAgeMs > 0 &&
      now - capturedAt >
        input.policy.maximumEvidenceAgeMs
    )
  ) {
    reasons.push("PONDOX_EXECUTION_EVIDENCE_STALE")
  }

  if (
    !sha256(input.candidate.capturedWireSha256) ||
    !sha256(input.candidate.simulatedWireSha256) ||
    input.candidate.capturedWireSha256 !==
      input.candidate.simulatedWireSha256
  ) {
    reasons.push("PONDOX_EXECUTION_WIRE_MISMATCH")
  }

  if (!input.candidate.simulationSucceeded) {
    reasons.push("PONDOX_EXECUTION_SIMULATION_FAILED")
  }

  if (requested === null) {
    reasons.push("PONDOX_EXECUTION_AMOUNT_INVALID")
  } else {
    if (
      maximumOperation !== null &&
      requested > maximumOperation
    ) {
      reasons.push(
        "PONDOX_EXECUTION_OPERATION_LIMIT_EXCEEDED"
      )
    }

    if (requested > remainingBefore) {
      reasons.push(
        "PONDOX_EXECUTION_CYCLE_LIMIT_EXCEEDED"
      )
    }
  }

  const remainingAfter =
    reasons.length === 0 &&
    requested !== null &&
    requested <= remainingBefore
      ? remainingBefore - requested
      : remainingBefore

  return {
    schemaVersion: 1,
    status:
      reasons.length === 0 ? "ELIGIBLE" : "BLOCKED",
    operationId: input.candidate.operationId,
    requestedUsdMicros:
      input.candidate.requestedUsdMicros,
    remainingCycleUsdMicrosBefore:
      String(remainingBefore),
    remainingCycleUsdMicrosAfter:
      String(remainingAfter),
    capturedWireSha256:
      input.candidate.capturedWireSha256,
    blockingReasons: [...new Set(reasons)],
    executionAuthorized: false,
    signingEnabled: false,
    transactionSubmitted: false,
    source: "PONDOX_PORTAL_EXECUTION_POLICY",
  }
}