import type { ShadowPosition } from "./shadow-portfolio"
import type { SizeAwareQuoteObservation } from "./size-aware-quote"

export type ShadowExecutionBasis = {
  positionId: string
  tokenId: ShadowPosition["tokenId"]
  chain: ShadowPosition["chain"]
  observedAt: string
  referencePairAddress: string
  requestedNotionalUsd: number
  simulatedTokenUnits: number
  simulatedTokenAmountBaseUnits: string
  tokenDecimals: number
  effectiveEntryPriceUsd: number
  estimatedEntryFeeUsd: number
  buyRouteId: string
  source: "EXECUTABLE_BUY_QUOTE"
}

export type ShadowExecutionBasisLedger = {
  schemaVersion: 1
  revision: number
  updatedAt: string | null
  records: ReadonlyArray<ShadowExecutionBasis>
}

export type PrivateShadowExecutionBasisStore = {
  read(): Promise<string | null>
  compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ): Promise<boolean>
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function validTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function assertBasis(value: unknown): asserts value is ShadowExecutionBasis {
  if (
    !record(value) ||
    !nonEmpty(value.positionId) ||
    !["PNDC", "PORK", "wPOND", "PAPER"].includes(String(value.tokenId)) ||
    !["ETHEREUM", "SOLANA"].includes(String(value.chain)) ||
    !validTimestamp(value.observedAt) ||
    !nonEmpty(value.referencePairAddress) ||
    !finitePositive(value.requestedNotionalUsd) ||
    !finitePositive(value.simulatedTokenUnits) ||
    !nonEmpty(value.simulatedTokenAmountBaseUnits) ||
    !/^[1-9]\d*$/.test(value.simulatedTokenAmountBaseUnits) ||
    !Number.isInteger(value.tokenDecimals) ||
    Number(value.tokenDecimals) < 0 ||
    Number(value.tokenDecimals) > 30 ||
    !finitePositive(value.effectiveEntryPriceUsd) ||
    !finiteNonNegative(value.estimatedEntryFeeUsd) ||
    !nonEmpty(value.buyRouteId) ||
    value.source !== "EXECUTABLE_BUY_QUOTE"
  ) {
    throw new Error("invalid shadow execution basis")
  }
}

export function buildShadowExecutionBasis(
  position: ShadowPosition,
  quote: SizeAwareQuoteObservation
): ShadowExecutionBasis {
  if (position.status !== "PROPOSED") {
    throw new Error("execution basis requires a proposed position")
  }
  if (
    quote.status !== "MEASURED" ||
    !finitePositive(quote.effectiveEntryPriceUsd) ||
    !finiteNonNegative(quote.estimatedEntryFeeUsd) ||
    !nonEmpty(quote.buyRouteId) ||
    !nonEmpty(quote.entryTokenAmountBaseUnits) ||
    !/^[1-9]\d*$/.test(quote.entryTokenAmountBaseUnits) ||
    !Number.isInteger(quote.entryTokenDecimals) ||
    Number(quote.entryTokenDecimals) < 0 ||
    Number(quote.entryTokenDecimals) > 30
  ) {
    throw new Error("complete measured buy quote is required")
  }
  if (quote.tokenId !== position.tokenId || quote.chain !== position.chain) {
    throw new Error("execution basis token and chain must match position")
  }
  if (quote.requestedNotionalUsd !== position.notionalUsd) {
    throw new Error("execution basis notional must match position")
  }
  if (
    quote.referencePairAddress !==
    position.evidenceRefs[0]?.currentPairAddress
  ) {
    throw new Error("execution basis pair must match position")
  }

  return {
    positionId: position.positionId,
    tokenId: position.tokenId,
    chain: position.chain,
    observedAt: quote.observedAt,
    referencePairAddress: quote.referencePairAddress,
    requestedNotionalUsd: quote.requestedNotionalUsd,
    simulatedTokenUnits:
      Number(quote.entryTokenAmountBaseUnits) /
      10 ** Number(quote.entryTokenDecimals),
    simulatedTokenAmountBaseUnits:
      quote.entryTokenAmountBaseUnits,
    tokenDecimals: Number(quote.entryTokenDecimals),
    effectiveEntryPriceUsd: quote.effectiveEntryPriceUsd,
    estimatedEntryFeeUsd: quote.estimatedEntryFeeUsd,
    buyRouteId: quote.buyRouteId,
    source: "EXECUTABLE_BUY_QUOTE",
  }
}

export function emptyShadowExecutionBasisLedger(): ShadowExecutionBasisLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    records: [],
  }
}

export function parseShadowExecutionBasisLedger(
  serialized: string
): ShadowExecutionBasisLedger {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid private shadow execution basis JSON")
  }

  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.updatedAt !== null && !validTimestamp(value.updatedAt)) ||
    !Array.isArray(value.records)
  ) {
    throw new Error("invalid private shadow execution basis ledger")
  }

  const ids = new Set<string>()
  for (const basis of value.records) {
    assertBasis(basis)
    if (ids.has(basis.positionId)) {
      throw new Error(`duplicate execution basis: ${basis.positionId}`)
    }
    ids.add(basis.positionId)
  }

  return structuredClone(value as ShadowExecutionBasisLedger)
}

export async function loadShadowExecutionBasis(
  store: PrivateShadowExecutionBasisStore
): Promise<ShadowExecutionBasisLedger> {
  const serialized = await store.read()
  return serialized === null
    ? emptyShadowExecutionBasisLedger()
    : parseShadowExecutionBasisLedger(serialized)
}

export async function persistShadowExecutionBasis(
  store: PrivateShadowExecutionBasisStore,
  basis: ShadowExecutionBasis,
  updatedAt: string
) {
  assertBasis(basis)
  if (!validTimestamp(updatedAt)) {
    throw new Error("updatedAt must be a valid timestamp")
  }

  const current = await loadShadowExecutionBasis(store)
  const existing = current.records.find(
    (item) => item.positionId === basis.positionId
  )
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(basis)) {
      throw new Error("shadow execution basis is immutable")
    }
    return { ledger: current, changed: false }
  }

  const ledger: ShadowExecutionBasisLedger = {
    schemaVersion: 1,
    revision: current.revision + 1,
    updatedAt,
    records: [...current.records, structuredClone(basis)],
  }
  const written = await store.compareAndSet(
    current.revision,
    JSON.stringify(ledger)
  )
  if (!written) {
    throw new Error("shadow execution basis concurrent write rejected")
  }
  return { ledger, changed: true }
}
