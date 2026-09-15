export type Pond0xPortalExecutionLedgerRecord = {
  operationId: string
  wireSha256: string
  requestedUsdMicros: string
  reservedAt: string
  status: "RESERVED"
}

export type Pond0xPortalExecutionLedger = {
  schemaVersion: 1
  revision: number
  cycleId: string
  createdAt: string
  maximumCycleUsdMicros: string
  reservedCycleUsdMicros: string
  cycleStatus: "ACTIVE" | "PAUSED" | "EXHAUSTED"
  records: ReadonlyArray<Pond0xPortalExecutionLedgerRecord>
}

export type Pond0xPortalBudgetReservationDecision = {
  schemaVersion: 1
  status: "RESERVED" | "BLOCKED"
  operationId: string
  wireSha256: string
  requestedUsdMicros: string
  reservedCycleUsdMicrosBefore: string
  reservedCycleUsdMicrosAfter: string
  remainingCycleUsdMicrosAfter: string
  ledger: Pond0xPortalExecutionLedger
  blockingReasons: ReadonlyArray<string>
  executionAuthorized: false
  signingEnabled: false
  transactionSubmitted: false
  source: "PONDOX_PORTAL_EXECUTION_LEDGER"
}

const MAXIMUM_LEDGER_RECORDS = 1_000

function unsignedInteger(value: string) {
  return /^(0|[1-9]\d*)$/.test(value)
}

function positiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value)
}

function sha256(value: string) {
  return /^[0-9a-f]{64}$/.test(value)
}

function validTimestamp(value: string) {
  return Number.isFinite(Date.parse(value))
}

function validateLedger(
  ledger: Pond0xPortalExecutionLedger
) {
  if (
    ledger.schemaVersion !== 1 ||
    !Number.isSafeInteger(ledger.revision) ||
    ledger.revision < 0 ||
    ledger.cycleId.trim().length === 0 ||
    ledger.cycleId.length > 128 ||
    !validTimestamp(ledger.createdAt) ||
    !positiveInteger(ledger.maximumCycleUsdMicros) ||
    !unsignedInteger(ledger.reservedCycleUsdMicros) ||
    !Array.isArray(ledger.records) ||
    ledger.records.length > MAXIMUM_LEDGER_RECORDS
  ) {
    return false
  }

  const maximum = BigInt(
    ledger.maximumCycleUsdMicros
  )
  const reserved = BigInt(
    ledger.reservedCycleUsdMicros
  )

  if (reserved > maximum) return false

  if (
    ledger.cycleStatus !== "ACTIVE" &&
    ledger.cycleStatus !== "PAUSED" &&
    ledger.cycleStatus !== "EXHAUSTED"
  ) {
    return false
  }

  if (
    ledger.cycleStatus === "EXHAUSTED" &&
    reserved !== maximum
  ) {
    return false
  }

  if (
    ledger.cycleStatus === "ACTIVE" &&
    reserved >= maximum
  ) {
    return false
  }

  const operationIds = new Set<string>()
  const wireHashes = new Set<string>()
  let calculatedReserved = BigInt(0)

  for (const record of ledger.records) {
    if (
      record.status !== "RESERVED" ||
      record.operationId.trim().length === 0 ||
      record.operationId.length > 128 ||
      !sha256(record.wireSha256) ||
      !positiveInteger(record.requestedUsdMicros) ||
      !validTimestamp(record.reservedAt) ||
      operationIds.has(record.operationId) ||
      wireHashes.has(record.wireSha256)
    ) {
      return false
    }

    operationIds.add(record.operationId)
    wireHashes.add(record.wireSha256)
    calculatedReserved += BigInt(
      record.requestedUsdMicros
    )
  }

  return calculatedReserved === reserved
}

export function createPond0xPortalExecutionLedger(input: {
  cycleId: string
  createdAt: string
  maximumCycleUsdMicros: string
}): Pond0xPortalExecutionLedger {
  const ledger: Pond0xPortalExecutionLedger = {
    schemaVersion: 1,
    revision: 0,
    cycleId: input.cycleId,
    createdAt: input.createdAt,
    maximumCycleUsdMicros:
      input.maximumCycleUsdMicros,
    reservedCycleUsdMicros: "0",
    cycleStatus: "ACTIVE",
    records: [],
  }

  if (!validateLedger(ledger)) {
    throw new Error(
      "invalid Pond0x portal execution ledger configuration"
    )
  }

  return ledger
}

export function parsePond0xPortalExecutionLedger(
  serialized: string
): Pond0xPortalExecutionLedger {
  let value: unknown

  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error(
      "invalid Pond0x portal execution ledger JSON"
    )
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !validateLedger(
      value as Pond0xPortalExecutionLedger
    )
  ) {
    throw new Error(
      "invalid Pond0x portal execution ledger"
    )
  }

  return structuredClone(
    value as Pond0xPortalExecutionLedger
  )
}

export function serializePond0xPortalExecutionLedger(
  ledger: Pond0xPortalExecutionLedger
) {
  if (!validateLedger(ledger)) {
    throw new Error(
      "invalid Pond0x portal execution ledger"
    )
  }

  return JSON.stringify(ledger)
}

export function reservePond0xPortalExecutionBudget(input: {
  ledger: Pond0xPortalExecutionLedger
  operationId: string
  wireSha256: string
  requestedUsdMicros: string
  reservedAt: string
}): Pond0xPortalBudgetReservationDecision {
  const reasons: string[] = []
  const ledgerValid = validateLedger(input.ledger)
  const reservedBefore = ledgerValid
    ? BigInt(input.ledger.reservedCycleUsdMicros)
    : BigInt(0)
  const maximum = ledgerValid
    ? BigInt(input.ledger.maximumCycleUsdMicros)
    : BigInt(0)
  const requested = positiveInteger(
    input.requestedUsdMicros
  )
    ? BigInt(input.requestedUsdMicros)
    : null

  if (!ledgerValid) {
    reasons.push("PONDOX_EXECUTION_LEDGER_INVALID")
  }

  if (
    input.operationId.trim().length === 0 ||
    input.operationId.length > 128
  ) {
    reasons.push(
      "PONDOX_EXECUTION_OPERATION_ID_INVALID"
    )
  }

  if (!sha256(input.wireSha256)) {
    reasons.push("PONDOX_EXECUTION_WIRE_HASH_INVALID")
  }

  if (!validTimestamp(input.reservedAt)) {
    reasons.push(
      "PONDOX_EXECUTION_RESERVATION_TIMESTAMP_INVALID"
    )
  }

  if (requested === null) {
    reasons.push("PONDOX_EXECUTION_AMOUNT_INVALID")
  }

  if (
    ledgerValid &&
    input.ledger.cycleStatus !== "ACTIVE"
  ) {
    reasons.push("PONDOX_EXECUTION_CYCLE_NOT_ACTIVE")
  }

  if (
    ledgerValid &&
    input.ledger.records.some(
      record =>
        record.operationId === input.operationId
    )
  ) {
    reasons.push(
      "PONDOX_EXECUTION_OPERATION_ALREADY_RESERVED"
    )
  }

  if (
    ledgerValid &&
    input.ledger.records.some(
      record =>
        record.wireSha256 === input.wireSha256
    )
  ) {
    reasons.push(
      "PONDOX_EXECUTION_WIRE_ALREADY_RESERVED"
    )
  }

  if (
    requested !== null &&
    reservedBefore + requested > maximum
  ) {
    reasons.push(
      "PONDOX_EXECUTION_CYCLE_LIMIT_EXCEEDED"
    )
  }

  if (
    ledgerValid &&
    input.ledger.records.length >=
      MAXIMUM_LEDGER_RECORDS
  ) {
    reasons.push(
      "PONDOX_EXECUTION_LEDGER_CAPACITY_EXCEEDED"
    )
  }

  if (reasons.length > 0 || requested === null) {
    return {
      schemaVersion: 1,
      status: "BLOCKED",
      operationId: input.operationId,
      wireSha256: input.wireSha256,
      requestedUsdMicros:
        input.requestedUsdMicros,
      reservedCycleUsdMicrosBefore:
        String(reservedBefore),
      reservedCycleUsdMicrosAfter:
        String(reservedBefore),
      remainingCycleUsdMicrosAfter:
        String(
          maximum > reservedBefore
            ? maximum - reservedBefore
            : BigInt(0)
        ),
      ledger: input.ledger,
      blockingReasons: [...new Set(reasons)],
      executionAuthorized: false,
      signingEnabled: false,
      transactionSubmitted: false,
      source: "PONDOX_PORTAL_EXECUTION_LEDGER",
    }
  }

  const reservedAfter = reservedBefore + requested
  const ledger: Pond0xPortalExecutionLedger = {
    ...input.ledger,
    revision: input.ledger.revision + 1,
    reservedCycleUsdMicros:
      String(reservedAfter),
    cycleStatus:
      reservedAfter === maximum
        ? "EXHAUSTED"
        : "ACTIVE",
    records: [
      ...input.ledger.records,
      {
        operationId: input.operationId,
        wireSha256: input.wireSha256,
        requestedUsdMicros:
          input.requestedUsdMicros,
        reservedAt: input.reservedAt,
        status: "RESERVED",
      },
    ],
  }

  return {
    schemaVersion: 1,
    status: "RESERVED",
    operationId: input.operationId,
    wireSha256: input.wireSha256,
    requestedUsdMicros: input.requestedUsdMicros,
    reservedCycleUsdMicrosBefore:
      String(reservedBefore),
    reservedCycleUsdMicrosAfter:
      String(reservedAfter),
    remainingCycleUsdMicrosAfter:
      String(maximum - reservedAfter),
    ledger,
    blockingReasons: [],
    executionAuthorized: false,
    signingEnabled: false,
    transactionSubmitted: false,
    source: "PONDOX_PORTAL_EXECUTION_LEDGER",
  }
}