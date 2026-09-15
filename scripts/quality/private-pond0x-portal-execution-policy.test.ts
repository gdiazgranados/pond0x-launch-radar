import test from "node:test"
import assert from "node:assert/strict"
import {
  evaluatePond0xPortalExecutionPolicy,
  type Pond0xPortalExecutionCandidate,
  type Pond0xPortalExecutionPolicy,
} from "../../src/private-alpha/pond0x-portal-execution-policy"

const WALLET =
  "DmRY6zagBUNs3bsuXB9Gib5negt1RdwLFmzTFZysA2KU"

const WIRE_SHA256 =
  "a".repeat(64)

function policy(
  overrides: Partial<Pond0xPortalExecutionPolicy> = {}
): Pond0xPortalExecutionPolicy {
  return {
    schemaVersion: 1,
    dedicatedWallet: WALLET,
    maximumOperationUsdMicros: "10000000",
    maximumCycleUsdMicros: "100000000",
    spentCycleUsdMicros: "20000000",
    maximumEvidenceAgeMs: 30_000,
    cycleStatus: "ACTIVE",
    ...overrides,
  }
}

function candidate(
  overrides: Partial<Pond0xPortalExecutionCandidate> = {}
): Pond0xPortalExecutionCandidate {
  return {
    operationId: "pond0x-operation-001",
    capturedAt: "2026-09-15T12:00:00.000Z",
    portalUrl:
      "https://www.pond0x.com/swap/solana",
    wallet: WALLET,
    requestedUsdMicros: "10000000",
    capturedWireSha256: WIRE_SHA256,
    simulatedWireSha256: WIRE_SHA256,
    simulationSucceeded: true,
    ...overrides,
  }
}

function evaluate(input: {
  policy?: Pond0xPortalExecutionPolicy
  candidate?: Pond0xPortalExecutionCandidate
  now?: string
} = {}) {
  return evaluatePond0xPortalExecutionPolicy({
    now: input.now ?? "2026-09-15T12:00:20.000Z",
    policy: input.policy ?? policy(),
    candidate: input.candidate ?? candidate(),
  })
}

test(
  "marks a bounded portal candidate as eligible without authorizing execution",
  () => {
    const result = evaluate()

    assert.equal(result.status, "ELIGIBLE")
    assert.equal(
      result.remainingCycleUsdMicrosBefore,
      "80000000"
    )
    assert.equal(
      result.remainingCycleUsdMicrosAfter,
      "70000000"
    )
    assert.deepEqual(result.blockingReasons, [])
    assert.equal(result.executionAuthorized, false)
    assert.equal(result.signingEnabled, false)
    assert.equal(result.transactionSubmitted, false)
  }
)

test(
  "blocks an operation above the ten dollar limit",
  () => {
    const result = evaluate({
      candidate: candidate({
        requestedUsdMicros: "10000001",
      }),
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_OPERATION_LIMIT_EXCEEDED"
      )
    )
  }
)

test(
  "blocks an operation exceeding the remaining cycle budget",
  () => {
    const result = evaluate({
      policy: policy({
        spentCycleUsdMicros: "95000000",
      }),
    })

    assert.equal(result.status, "BLOCKED")
    assert.equal(
      result.remainingCycleUsdMicrosBefore,
      "5000000"
    )
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_CYCLE_LIMIT_EXCEEDED"
      )
    )
  }
)

test(
  "blocks a paused or exhausted funding cycle",
  () => {
    for (const cycleStatus of [
      "PAUSED",
      "EXHAUSTED",
    ] as const) {
      const result = evaluate({
        policy: policy({ cycleStatus }),
      })

      assert.equal(result.status, "BLOCKED")
      assert.ok(
        result.blockingReasons.includes(
          "PONDOX_EXECUTION_CYCLE_NOT_ACTIVE"
        )
      )
    }
  }
)

test(
  "blocks a wallet other than the dedicated wallet",
  () => {
    const result = evaluate({
      candidate: candidate({
        wallet:
          "11111111111111111111111111111111",
      }),
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_DEDICATED_WALLET_MISMATCH"
      )
    )
  }
)

test(
  "blocks candidates not originating from the Pond0x portal",
  () => {
    const result = evaluate({
      candidate: candidate({
        portalUrl:
          "https://ultra-api.jup.ag/order",
      }),
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_PORTAL_ORIGIN_INVALID"
      )
    )
  }
)

test(
  "blocks stale or future portal evidence",
  () => {
    const stale = evaluate({
      now: "2026-09-15T12:01:00.000Z",
    })
    const future = evaluate({
      candidate: candidate({
        capturedAt:
          "2026-09-15T12:00:21.000Z",
      }),
    })

    assert.ok(
      stale.blockingReasons.includes(
        "PONDOX_EXECUTION_EVIDENCE_STALE"
      )
    )
    assert.ok(
      future.blockingReasons.includes(
        "PONDOX_EXECUTION_EVIDENCE_STALE"
      )
    )
  }
)

test(
  "blocks a wire differing from the simulated wire",
  () => {
    const result = evaluate({
      candidate: candidate({
        simulatedWireSha256: "b".repeat(64),
      }),
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_WIRE_MISMATCH"
      )
    )
  }
)

test(
  "blocks unsuccessful simulation evidence",
  () => {
    const result = evaluate({
      candidate: candidate({
        simulationSucceeded: false,
      }),
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_SIMULATION_FAILED"
      )
    )
  }
)

test(
  "fails closed on malformed policy amounts",
  () => {
    const result = evaluate({
      policy: policy({
        maximumOperationUsdMicros: "10.00",
        spentCycleUsdMicros: "-1",
      }),
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_POLICY_INVALID"
      )
    )
  }
)
test(
  "does not consume projected budget for a blocked candidate",
  () => {
    const result = evaluate({
      candidate: candidate({
        operationId: "   ",
        portalUrl: "https://example.com/swap",
      }),
    })

    assert.equal(result.status, "BLOCKED")
    assert.equal(
      result.remainingCycleUsdMicrosBefore,
      "80000000"
    )
    assert.equal(
      result.remainingCycleUsdMicrosAfter,
      "80000000"
    )
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_OPERATION_ID_INVALID"
      )
    )
  }
)