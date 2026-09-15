import {
  evaluatePond0xPortalExecutionPolicy,
  type Pond0xPortalExecutionPolicy,
  type Pond0xPortalExecutionPolicyDecision,
} from "./pond0x-portal-execution-policy"
import {
  loadPond0xPortalExecutionLedger,
  persistPond0xPortalBudgetReservation,
  type Pond0xPortalExecutionLedgerConfiguration,
  type Pond0xPortalExecutionLedgerStore,
} from "./pond0x-portal-execution-repository"
import type {
  Pond0xPortalBudgetReservationDecision,
} from "./pond0x-portal-execution-ledger"
import type {
  Pond0xPortalWireCapture,
} from "./pond0x-portal-wire-capture"
import type {
  Pond0xRpcSimulationObservation,
} from "./pond0x-rpc-simulation-client"

export type Pond0xPortalExecutionCoordination = {
  schemaVersion: 1
  status: "RESERVED" | "BLOCKED"
  operationId: string
  wireSha256: string | null
  policyDecision: Pond0xPortalExecutionPolicyDecision
  reservationDecision:
    Pond0xPortalBudgetReservationDecision | null
  blockingReasons: ReadonlyArray<string>
  executionAuthorized: false
  signingEnabled: false
  transactionSubmitted: false
  source: "PONDOX_PORTAL_EXECUTION_COORDINATOR"
}

export async function coordinatePond0xPortalExecution(
  store: Pond0xPortalExecutionLedgerStore,
  input: {
    now: string
    operationId: string
    requestedUsdMicros: string
    policy: Pond0xPortalExecutionPolicy
    configuration:
      Pond0xPortalExecutionLedgerConfiguration
    capture: Pond0xPortalWireCapture
    simulation: Pond0xRpcSimulationObservation
  }
): Promise<Pond0xPortalExecutionCoordination> {
  const ledger =
    await loadPond0xPortalExecutionLedger(
      store,
      input.configuration
    )

  const coordinationReasons: string[] = [
    ...input.capture.blockingReasons,
    ...input.simulation.blockingReasons,
  ]

  if (
    ledger.cycleId !== input.configuration.cycleId ||
    ledger.maximumCycleUsdMicros !==
      input.configuration.maximumCycleUsdMicros ||
    input.policy.maximumCycleUsdMicros !==
      ledger.maximumCycleUsdMicros
  ) {
    coordinationReasons.push(
      "PONDOX_EXECUTION_LEDGER_POLICY_MISMATCH"
    )
  }

  if (
    input.capture.status !== "CAPTURED" ||
    input.capture.transactionBase64 === null ||
    input.capture.wireSha256 === null
  ) {
    coordinationReasons.push(
      "PONDOX_EXECUTION_PORTAL_CAPTURE_INVALID"
    )
  }

  if (
    input.simulation.status !== "SIMULATED" ||
    !input.simulation.simulationSucceeded
  ) {
    coordinationReasons.push(
      "PONDOX_EXECUTION_SIMULATION_INVALID"
    )
  }

  if (
    input.capture.wireSha256 === null ||
    input.simulation.wireInspection.wireSha256 === null ||
    input.capture.wireSha256 !==
      input.simulation.wireInspection.wireSha256
  ) {
    coordinationReasons.push(
      "PONDOX_EXECUTION_CAPTURE_SIMULATION_MISMATCH"
    )
  }

  const effectivePolicy: Pond0xPortalExecutionPolicy = {
    ...input.policy,
    spentCycleUsdMicros:
      ledger.reservedCycleUsdMicros,
    cycleStatus: ledger.cycleStatus,
  }

  const policyDecision =
    evaluatePond0xPortalExecutionPolicy({
      now: input.now,
      policy: effectivePolicy,
      candidate: {
        operationId: input.operationId,
        capturedAt: input.capture.capturedAt,
        portalUrl: input.capture.portalUrl,
        wallet: input.capture.expectedWallet,
        requestedUsdMicros:
          input.requestedUsdMicros,
        capturedWireSha256:
          input.capture.wireSha256 ?? "",
        simulatedWireSha256:
          input.simulation.wireInspection
            .wireSha256 ?? "",
        simulationSucceeded:
          input.simulation.status === "SIMULATED" &&
          input.simulation.simulationSucceeded,
      },
    })

  coordinationReasons.push(
    ...policyDecision.blockingReasons
  )

  const blockingReasons = [
    ...new Set(coordinationReasons),
  ]

  if (blockingReasons.length > 0) {
    return {
      schemaVersion: 1,
      status: "BLOCKED",
      operationId: input.operationId,
      wireSha256: input.capture.wireSha256,
      policyDecision,
      reservationDecision: null,
      blockingReasons,
      executionAuthorized: false,
      signingEnabled: false,
      transactionSubmitted: false,
      source: "PONDOX_PORTAL_EXECUTION_COORDINATOR",
    }
  }

  const reservationDecision =
    await persistPond0xPortalBudgetReservation(
      store,
      {
        configuration: input.configuration,
        operationId: input.operationId,
        wireSha256: input.capture.wireSha256!,
        requestedUsdMicros:
          input.requestedUsdMicros,
        reservedAt: input.now,
        expectedRevision: ledger.revision,
      }
    )

  return {
    schemaVersion: 1,
    status:
      reservationDecision.status === "RESERVED"
        ? "RESERVED"
        : "BLOCKED",
    operationId: input.operationId,
    wireSha256: input.capture.wireSha256,
    policyDecision,
    reservationDecision,
    blockingReasons:
      reservationDecision.blockingReasons,
    executionAuthorized: false,
    signingEnabled: false,
    transactionSubmitted: false,
    source: "PONDOX_PORTAL_EXECUTION_COORDINATOR",
  }
}