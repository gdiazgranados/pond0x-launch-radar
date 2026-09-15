import test from "node:test"
import assert from "node:assert/strict"
import {
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit"
import {
  coordinatePond0xPortalExecution,
} from "../../src/private-alpha/pond0x-portal-execution-coordinator"
import {
  parsePond0xPortalExecutionLedger,
} from "../../src/private-alpha/pond0x-portal-execution-ledger"
import type {
  Pond0xPortalExecutionLedgerStore,
} from "../../src/private-alpha/pond0x-portal-execution-repository"
import {
  capturePond0xPortalWire,
} from "../../src/private-alpha/pond0x-portal-wire-capture"
import type {
  Pond0xRpcSimulationObservation,
} from "../../src/private-alpha/pond0x-rpc-simulation-client"

const WALLET = address(
  "DmRY6zagBUNs3bsuXB9Gib5negt1RdwLFmzTFZysA2KU"
)
const SYSTEM_PROGRAM = address(
  "11111111111111111111111111111111"
)

class MemoryStore
implements Pond0xPortalExecutionLedgerStore {
  value: string | null = null

  async read() {
    return this.value
  }

  async compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ) {
    const currentRevision =
      this.value === null
        ? 0
        : parsePond0xPortalExecutionLedger(
            this.value
          ).revision

    if (currentRevision !== expectedRevision) {
      return false
    }

    this.value = serializedLedger
    return true
  }
}

function transactionBase64() {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    value =>
      setTransactionMessageFeePayer(
        WALLET,
        value
      ),
    value =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash(
            "11111111111111111111111111111111"
          ),
          lastValidBlockHeight: BigInt(100),
        },
        value
      ),
    value =>
      appendTransactionMessageInstruction(
        {
          programAddress: SYSTEM_PROGRAM,
          data: new Uint8Array([1]),
        },
        value
      )
  )

  return getBase64EncodedWireTransaction(
    compileTransaction(message)
  )
}

function evidence() {
  const capture = capturePond0xPortalWire({
    capturedAt: "2026-09-15T12:00:00.000Z",
    portalUrl:
      "https://www.pond0x.com/swap/solana",
    responseUrl:
      "https://ultra-api.jup.ag/order" +
      `?taker=${WALLET}`,
    expectedWallet: WALLET,
    payload: {
      transaction: transactionBase64(),
      requestId: "portal-order-001",
    },
  })

  const simulation: Pond0xRpcSimulationObservation = {
    schemaVersion: 1,
    status: "SIMULATED",
    simulationSucceeded: true,
    simulationError: null,
    estimatedNetworkFeeLamports: "5000",
    unitsConsumed: 100,
    logs: [],
    postAccounts: [],
    wireInspection: capture.wireInspection!,
    blockingReasons: [],
    approvalGranted: false,
    signingEnabled: false,
    transactionSubmitted: false,
    source: "SOLANA_RPC_SIMULATE_TRANSACTION",
  }

  return { capture, simulation }
}

function input(
  overrides: {
    requestedUsdMicros?: string
    maximumCycleUsdMicros?: string
    simulation?:
      Pond0xRpcSimulationObservation
  } = {}
) {
  const currentEvidence = evidence()

  return {
    now: "2026-09-15T12:00:10.000Z",
    operationId: "pond0x-operation-001",
    requestedUsdMicros:
      overrides.requestedUsdMicros ?? "10000000",
    policy: {
      schemaVersion: 1 as const,
      dedicatedWallet: WALLET,
      maximumOperationUsdMicros: "10000000",
      maximumCycleUsdMicros:
        overrides.maximumCycleUsdMicros ??
        "100000000",
      spentCycleUsdMicros: "0",
      maximumEvidenceAgeMs: 30_000,
      cycleStatus: "ACTIVE" as const,
    },
    configuration: {
      cycleId: "pond0x-cycle-001",
      createdAt: "2026-09-15T12:00:00.000Z",
      maximumCycleUsdMicros: "100000000",
    },
    capture: currentEvidence.capture,
    simulation:
      overrides.simulation ??
      currentEvidence.simulation,
  }
}

test(
  "reserves budget only for matching portal and simulation evidence",
  async () => {
    const store = new MemoryStore()
    const result =
      await coordinatePond0xPortalExecution(
        store,
        input()
      )

    assert.equal(result.status, "RESERVED")
    assert.equal(
      result.policyDecision.status,
      "ELIGIBLE"
    )
    assert.equal(
      result.reservationDecision?.status,
      "RESERVED"
    )
    assert.ok(store.value)
    assert.equal(result.executionAuthorized, false)
    assert.equal(result.signingEnabled, false)
    assert.equal(result.transactionSubmitted, false)
  }
)

test(
  "blocks mismatched capture and simulation hashes without reserving",
  async () => {
    const store = new MemoryStore()
    const current = evidence()
    const mismatchedSimulation = {
      ...current.simulation,
      wireInspection: {
        ...current.simulation.wireInspection,
        wireSha256: "b".repeat(64),
      },
    }

    const result =
      await coordinatePond0xPortalExecution(
        store,
        input({
          simulation: mismatchedSimulation,
        })
      )

    assert.equal(result.status, "BLOCKED")
    assert.equal(result.reservationDecision, null)
    assert.equal(store.value, null)
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_CAPTURE_SIMULATION_MISMATCH"
      )
    )
  }
)

test(
  "blocks failed simulation evidence without reserving",
  async () => {
    const store = new MemoryStore()
    const current = evidence()
    const failedSimulation = {
      ...current.simulation,
      status: "BLOCKED" as const,
      simulationSucceeded: false,
      blockingReasons: [
        "PONDOX_RPC_SIMULATION_FAILED",
      ],
    }

    const result =
      await coordinatePond0xPortalExecution(
        store,
        input({
          simulation: failedSimulation,
        })
      )

    assert.equal(result.status, "BLOCKED")
    assert.equal(store.value, null)
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_SIMULATION_INVALID"
      )
    )
  }
)

test(
  "blocks an operation above ten dollars without reserving",
  async () => {
    const store = new MemoryStore()
    const result =
      await coordinatePond0xPortalExecution(
        store,
        input({
          requestedUsdMicros: "10000001",
        })
      )

    assert.equal(result.status, "BLOCKED")
    assert.equal(store.value, null)
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_OPERATION_LIMIT_EXCEEDED"
      )
    )
  }
)

test(
  "blocks disagreement between policy and ledger configuration",
  async () => {
    const store = new MemoryStore()
    const result =
      await coordinatePond0xPortalExecution(
        store,
        input({
          maximumCycleUsdMicros: "90000000",
        })
      )

    assert.equal(result.status, "BLOCKED")
    assert.equal(store.value, null)
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_LEDGER_POLICY_MISMATCH"
      )
    )
  }
)

test(
  "blocks reuse of the same captured wire",
  async () => {
    const store = new MemoryStore()

    const first =
      await coordinatePond0xPortalExecution(
        store,
        input()
      )

    const secondInput = input()
    secondInput.operationId =
      "pond0x-operation-002"

    const second =
      await coordinatePond0xPortalExecution(
        store,
        secondInput
      )

    assert.equal(first.status, "RESERVED")
    assert.equal(second.status, "BLOCKED")
    assert.ok(
      second.blockingReasons.includes(
        "PONDOX_EXECUTION_WIRE_ALREADY_RESERVED"
      )
    )
  }
)