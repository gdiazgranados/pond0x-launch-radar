import test from "node:test"
import assert from "node:assert/strict"
import {
  createPond0xPortalExecutionLedger,
  reservePond0xPortalExecutionBudget,
  type Pond0xPortalExecutionLedger,
} from "../../src/private-alpha/pond0x-portal-execution-ledger"

const WIRE_A = "a".repeat(64)
const WIRE_B = "b".repeat(64)

function ledger() {
  return createPond0xPortalExecutionLedger({
    cycleId: "pond0x-cycle-001",
    createdAt: "2026-09-15T12:00:00.000Z",
    maximumCycleUsdMicros: "100000000",
  })
}

function reserve(input: {
  ledger?: Pond0xPortalExecutionLedger
  operationId?: string
  wireSha256?: string
  requestedUsdMicros?: string
  reservedAt?: string
} = {}) {
  return reservePond0xPortalExecutionBudget({
    ledger: input.ledger ?? ledger(),
    operationId:
      input.operationId ?? "pond0x-operation-001",
    wireSha256: input.wireSha256 ?? WIRE_A,
    requestedUsdMicros:
      input.requestedUsdMicros ?? "10000000",
    reservedAt:
      input.reservedAt ??
      "2026-09-15T12:00:10.000Z",
  })
}

test(
  "creates an empty one hundred dollar funding cycle",
  () => {
    const result = ledger()

    assert.equal(result.revision, 0)
    assert.equal(result.cycleStatus, "ACTIVE")
    assert.equal(
      result.maximumCycleUsdMicros,
      "100000000"
    )
    assert.equal(result.reservedCycleUsdMicros, "0")
    assert.deepEqual(result.records, [])
  }
)

test(
  "reserves ten dollars and advances the ledger revision",
  () => {
    const result = reserve()

    assert.equal(result.status, "RESERVED")
    assert.equal(result.ledger.revision, 1)
    assert.equal(
      result.reservedCycleUsdMicrosAfter,
      "10000000"
    )
    assert.equal(
      result.remainingCycleUsdMicrosAfter,
      "90000000"
    )
    assert.equal(result.ledger.records.length, 1)
    assert.equal(result.executionAuthorized, false)
    assert.equal(result.signingEnabled, false)
    assert.equal(result.transactionSubmitted, false)
  }
)

test(
  "blocks a duplicate operation identifier",
  () => {
    const first = reserve()
    const duplicate = reserve({
      ledger: first.ledger,
      wireSha256: WIRE_B,
    })

    assert.equal(duplicate.status, "BLOCKED")
    assert.equal(
      duplicate.ledger.revision,
      first.ledger.revision
    )
    assert.ok(
      duplicate.blockingReasons.includes(
        "PONDOX_EXECUTION_OPERATION_ALREADY_RESERVED"
      )
    )
  }
)

test(
  "blocks reuse of a previously reserved wire",
  () => {
    const first = reserve()
    const duplicate = reserve({
      ledger: first.ledger,
      operationId: "pond0x-operation-002",
    })

    assert.equal(duplicate.status, "BLOCKED")
    assert.ok(
      duplicate.blockingReasons.includes(
        "PONDOX_EXECUTION_WIRE_ALREADY_RESERVED"
      )
    )
  }
)

test(
  "blocks a reservation above the remaining cycle budget",
  () => {
    const first = reserve({
      requestedUsdMicros: "95000000",
    })
    const second = reserve({
      ledger: first.ledger,
      operationId: "pond0x-operation-002",
      wireSha256: WIRE_B,
      requestedUsdMicros: "10000000",
    })

    assert.equal(second.status, "BLOCKED")
    assert.equal(
      second.reservedCycleUsdMicrosAfter,
      "95000000"
    )
    assert.ok(
      second.blockingReasons.includes(
        "PONDOX_EXECUTION_CYCLE_LIMIT_EXCEEDED"
      )
    )
  }
)

test(
  "marks the cycle exhausted at exactly one hundred dollars",
  () => {
    const result = reserve({
      requestedUsdMicros: "100000000",
    })

    assert.equal(result.status, "RESERVED")
    assert.equal(
      result.ledger.cycleStatus,
      "EXHAUSTED"
    )
    assert.equal(
      result.remainingCycleUsdMicrosAfter,
      "0"
    )

    const blocked = reserve({
      ledger: result.ledger,
      operationId: "pond0x-operation-002",
      wireSha256: WIRE_B,
    })

    assert.equal(blocked.status, "BLOCKED")
    assert.ok(
      blocked.blockingReasons.includes(
        "PONDOX_EXECUTION_CYCLE_NOT_ACTIVE"
      )
    )
  }
)

test(
  "fails closed on a malformed ledger",
  () => {
    const malformed = {
      ...ledger(),
      reservedCycleUsdMicros: "50000000",
      records: [],
    }

    const result = reserve({
      ledger: malformed,
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_LEDGER_INVALID"
      )
    )
    assert.equal(
      result.reservedCycleUsdMicrosAfter,
      "0"
    )
  }
)

test(
  "blocks malformed reservation identity and timestamp",
  () => {
    const result = reserve({
      operationId: "   ",
      wireSha256: "not-a-sha256",
      requestedUsdMicros: "10.00",
      reservedAt: "not-a-date",
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_OPERATION_ID_INVALID"
      )
    )
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_WIRE_HASH_INVALID"
      )
    )
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_AMOUNT_INVALID"
      )
    )
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_EXECUTION_RESERVATION_TIMESTAMP_INVALID"
      )
    )
  }
)