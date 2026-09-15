import test from "node:test"
import assert from "node:assert/strict"
import {
  parsePond0xPortalExecutionLedger,
} from "../../src/private-alpha/pond0x-portal-execution-ledger"
import {
  loadPond0xPortalExecutionLedger,
  persistPond0xPortalBudgetReservation,
  type Pond0xPortalExecutionLedgerStore,
} from "../../src/private-alpha/pond0x-portal-execution-repository"

const WIRE_A = "a".repeat(64)
const WIRE_B = "b".repeat(64)

const configuration = {
  cycleId: "pond0x-cycle-001",
  createdAt: "2026-09-15T12:00:00.000Z",
  maximumCycleUsdMicros: "100000000",
}

class MemoryStore
implements Pond0xPortalExecutionLedgerStore {
  value: string | null = null
  rejectNextWrite = false

  async read() {
    return this.value
  }

  async compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ) {
    if (this.rejectNextWrite) {
      this.rejectNextWrite = false
      return false
    }

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

function persist(
  store: MemoryStore,
  overrides: {
    operationId?: string
    wireSha256?: string
    requestedUsdMicros?: string
    reservedAt?: string
    expectedRevision?: number
  } = {}
) {
  return persistPond0xPortalBudgetReservation(
    store,
    {
      configuration,
      operationId:
        overrides.operationId ??
        "pond0x-operation-001",
      wireSha256:
        overrides.wireSha256 ?? WIRE_A,
      requestedUsdMicros:
        overrides.requestedUsdMicros ??
        "10000000",
      reservedAt:
        overrides.reservedAt ??
        "2026-09-15T12:00:10.000Z",
      expectedRevision:
        overrides.expectedRevision,
    }
  )
}

test(
  "loads a new empty execution ledger",
  async () => {
    const store = new MemoryStore()
    const ledger =
      await loadPond0xPortalExecutionLedger(
        store,
        configuration
      )

    assert.equal(ledger.revision, 0)
    assert.equal(
      ledger.reservedCycleUsdMicros,
      "0"
    )
    assert.equal(store.value, null)
  }
)

test(
  "persists a reservation with compare-and-set",
  async () => {
    const store = new MemoryStore()
    const result = await persist(store)

    assert.equal(result.status, "RESERVED")
    assert.equal(result.ledger.revision, 1)
    assert.ok(store.value)

    const stored =
      await loadPond0xPortalExecutionLedger(
        store,
        configuration
      )

    assert.deepEqual(stored, result.ledger)
  }
)

test(
  "does not write a blocked duplicate reservation",
  async () => {
    const store = new MemoryStore()
    await persist(store)
    const serializedBefore = store.value

    const duplicate = await persist(store, {
      operationId: "pond0x-operation-002",
    })

    assert.equal(duplicate.status, "BLOCKED")
    assert.ok(
      duplicate.blockingReasons.includes(
        "PONDOX_EXECUTION_WIRE_ALREADY_RESERVED"
      )
    )
    assert.equal(store.value, serializedBefore)
  }
)

test(
  "rejects stale revisions",
  async () => {
    const store = new MemoryStore()
    await persist(store)

    await assert.rejects(
      persist(store, {
        operationId: "pond0x-operation-002",
        wireSha256: WIRE_B,
        expectedRevision: 0,
      }),
      /revision conflict/
    )
  }
)

test(
  "rejects a concurrent write without consuming budget",
  async () => {
    const store = new MemoryStore()
    store.rejectNextWrite = true

    await assert.rejects(
      persist(store),
      /concurrent write rejected/
    )

    assert.equal(store.value, null)
  }
)

test(
  "fails closed when the stored ledger is corrupt",
  async () => {
    const store = new MemoryStore()
    store.value = "{bad-json"

    await assert.rejects(
      loadPond0xPortalExecutionLedger(
        store,
        configuration
      ),
      /invalid Pond0x portal execution ledger JSON/
    )
  }
)