import {
  createPond0xPortalExecutionLedger,
  parsePond0xPortalExecutionLedger,
  reservePond0xPortalExecutionBudget,
  serializePond0xPortalExecutionLedger,
  type Pond0xPortalBudgetReservationDecision,
  type Pond0xPortalExecutionLedger,
} from "./pond0x-portal-execution-ledger"

export type Pond0xPortalExecutionLedgerStore = {
  read(): Promise<string | null>
  compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ): Promise<boolean>
}

export type Pond0xPortalExecutionLedgerConfiguration = {
  cycleId: string
  createdAt: string
  maximumCycleUsdMicros: string
}

export async function loadPond0xPortalExecutionLedger(
  store: Pond0xPortalExecutionLedgerStore,
  configuration: Pond0xPortalExecutionLedgerConfiguration
): Promise<Pond0xPortalExecutionLedger> {
  const serialized = await store.read()

  return serialized === null
    ? createPond0xPortalExecutionLedger(configuration)
    : parsePond0xPortalExecutionLedger(serialized)
}

export async function persistPond0xPortalBudgetReservation(
  store: Pond0xPortalExecutionLedgerStore,
  input: {
    configuration:
      Pond0xPortalExecutionLedgerConfiguration
    operationId: string
    wireSha256: string
    requestedUsdMicros: string
    reservedAt: string
    expectedRevision?: number
  }
): Promise<Pond0xPortalBudgetReservationDecision> {
  const current =
    await loadPond0xPortalExecutionLedger(
      store,
      input.configuration
    )

  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== current.revision
  ) {
    throw new Error(
      "Pond0x portal execution ledger revision conflict"
    )
  }

  const decision =
    reservePond0xPortalExecutionBudget({
      ledger: current,
      operationId: input.operationId,
      wireSha256: input.wireSha256,
      requestedUsdMicros:
        input.requestedUsdMicros,
      reservedAt: input.reservedAt,
    })

  if (decision.status === "BLOCKED") {
    return decision
  }

  const written = await store.compareAndSet(
    current.revision,
    serializePond0xPortalExecutionLedger(
      decision.ledger
    )
  )

  if (!written) {
    throw new Error(
      "Pond0x portal execution concurrent write rejected"
    )
  }

  return decision
}