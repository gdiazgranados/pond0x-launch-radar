import type { ShadowPosition } from "./shadow-portfolio"

export type ShadowPortfolioLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  positions: ReadonlyArray<ShadowPosition>
}

export type PrivateShadowPortfolioStore = {
  read(): Promise<string | null>
  compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ): Promise<boolean>
}

export type PersistShadowPositionResult = {
  ledger: ShadowPortfolioLedger
  changed: boolean
}

const POSITION_STATUSES = new Set([
  "PROPOSED",
  "OPEN",
  "CLOSED",
  "INVALIDATED",
])

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function validTimestamp(value: unknown) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  )
}

function finitePositive(value: unknown) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  )
}

function assertPosition(value: unknown): asserts value is ShadowPosition {
  if (!record(value)) throw new Error("invalid shadow position")
  if (
    typeof value.positionId !== "string" ||
    !value.positionId.trim()
  ) {
    throw new Error("invalid shadow positionId")
  }
  if (!POSITION_STATUSES.has(String(value.status))) {
    throw new Error("invalid shadow position status")
  }
  if (
    !finitePositive(value.entryReferenceUsd) ||
    !finitePositive(value.notionalUsd)
  ) {
    throw new Error("invalid shadow position value")
  }
  if (
    !Array.isArray(value.evidenceRefs) ||
    value.evidenceRefs.length === 0
  ) {
    throw new Error("shadow position evidence is required")
  }

  if (value.status === "PROPOSED") {
    if (value.openedAt !== null || value.closedAt !== null) {
      throw new Error("proposed position cannot have timestamps")
    }
  }
  if (value.status === "OPEN") {
    if (!validTimestamp(value.openedAt) || value.closedAt !== null) {
      throw new Error("open position timestamps are invalid")
    }
  }
  if (value.status === "CLOSED") {
    if (
      !validTimestamp(value.openedAt) ||
      !validTimestamp(value.closedAt) ||
      typeof value.realizedPnlUsd !== "number" ||
      !Number.isFinite(value.realizedPnlUsd) ||
      typeof value.realizedPnlPct !== "number" ||
      !Number.isFinite(value.realizedPnlPct)
    ) {
      throw new Error("closed position result is invalid")
    }
  }
  if (
    value.status === "INVALIDATED" &&
    (typeof value.invalidationReason !== "string" ||
      !value.invalidationReason.trim())
  ) {
    throw new Error("invalidation reason is required")
  }
}

function cloneLedger(
  ledger: ShadowPortfolioLedger
): ShadowPortfolioLedger {
  return structuredClone(ledger)
}

export function emptyShadowPortfolioLedger(): ShadowPortfolioLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    positions: [],
  }
}

export function parseShadowPortfolioLedger(
  serialized: string
): ShadowPortfolioLedger {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid private shadow portfolio JSON")
  }

  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null &&
      !validTimestamp(value.updatedAt)) ||
    !Array.isArray(value.positions)
  ) {
    throw new Error("invalid private shadow portfolio ledger")
  }

  const ids = new Set<string>()
  for (const position of value.positions) {
    assertPosition(position)
    if (ids.has(position.positionId)) {
      throw new Error(
        `duplicate shadow positionId: ${position.positionId}`
      )
    }
    ids.add(position.positionId)
  }

  return cloneLedger(value as ShadowPortfolioLedger)
}

export function serializeShadowPortfolioLedger(
  ledger: ShadowPortfolioLedger
) {
  return JSON.stringify(ledger)
}

function assertStableIdentity(
  current: ShadowPosition,
  next: ShadowPosition
) {
  const stableFields = [
    "positionId",
    "tokenId",
    "chain",
    "side",
    "entryReferenceUsd",
    "notionalUsd",
    "estimatedEntrySlippagePct",
    "ruleVersion",
  ] as const

  for (const field of stableFields) {
    if (current[field] !== next[field]) {
      throw new Error(`shadow position ${field} is immutable`)
    }
  }
}

function assertEvidenceAppendOnly(
  current: ShadowPosition,
  next: ShadowPosition
) {
  if (next.evidenceRefs.length < current.evidenceRefs.length) {
    throw new Error("shadow position evidence cannot shrink")
  }
  for (let index = 0; index < current.evidenceRefs.length; index += 1) {
    if (
      JSON.stringify(current.evidenceRefs[index]) !==
      JSON.stringify(next.evidenceRefs[index])
    ) {
      throw new Error("shadow position evidence is immutable")
    }
  }
}

function assertTransition(
  current: ShadowPosition,
  next: ShadowPosition
) {
  if (
    current.status === "CLOSED" ||
    current.status === "INVALIDATED"
  ) {
    throw new Error("terminal shadow position is immutable")
  }

  const allowed =
    current.status === "PROPOSED"
      ? new Set(["OPEN", "INVALIDATED"])
      : new Set(["OPEN", "CLOSED", "INVALIDATED"])

  if (!allowed.has(next.status)) {
    throw new Error(
      `invalid shadow transition: ${current.status}->${next.status}`
    )
  }
}

export function upsertShadowPosition(
  ledger: ShadowPortfolioLedger,
  position: ShadowPosition,
  updatedAt: string
): PersistShadowPositionResult {
  assertPosition(position)
  if (!validTimestamp(updatedAt)) {
    throw new Error("updatedAt must be a valid timestamp")
  }

  const currentIndex = ledger.positions.findIndex(
    (item) => item.positionId === position.positionId
  )
  if (currentIndex === -1) {
    if (position.status !== "PROPOSED") {
      throw new Error("new shadow position must be proposed")
    }
  } else {
    const current = ledger.positions[currentIndex]
    if (JSON.stringify(current) === JSON.stringify(position)) {
      return { ledger: cloneLedger(ledger), changed: false }
    }
    assertStableIdentity(current, position)
    assertEvidenceAppendOnly(current, position)
    assertTransition(current, position)
  }

  const positions = [...ledger.positions]
  if (currentIndex === -1) positions.push(structuredClone(position))
  else positions[currentIndex] = structuredClone(position)

  return {
    ledger: {
      schemaVersion: 1,
      revision: ledger.revision + 1,
      updatedAt,
      positions,
    },
    changed: true,
  }
}

export async function loadShadowPortfolio(
  store: PrivateShadowPortfolioStore
): Promise<ShadowPortfolioLedger> {
  const serialized = await store.read()
  return serialized === null
    ? emptyShadowPortfolioLedger()
    : parseShadowPortfolioLedger(serialized)
}

export async function persistShadowPosition(
  store: PrivateShadowPortfolioStore,
  position: ShadowPosition,
  options: {
    updatedAt: string
    expectedRevision?: number
  }
): Promise<PersistShadowPositionResult> {
  const current = await loadShadowPortfolio(store)
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== current.revision
  ) {
    throw new Error("shadow portfolio revision conflict")
  }

  const result = upsertShadowPosition(
    current,
    position,
    options.updatedAt
  )
  if (!result.changed) return result

  const written = await store.compareAndSet(
    current.revision,
    serializeShadowPortfolioLedger(result.ledger)
  )
  if (!written) {
    throw new Error("shadow portfolio concurrent write rejected")
  }

  return result
}
