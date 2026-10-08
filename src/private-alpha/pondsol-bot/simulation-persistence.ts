
import { randomUUID } from "node:crypto"
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises"
import { basename, dirname, join } from "node:path"

import type { PositionEngine } from "./position-engine"
import { isCanonicalUtcTimestamp } from "./utc-timestamp"

const SNAPSHOT_VERSION = 3

type SimulationSnapshot = {
  version: number
  engine: PositionEngine
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}

function isNonNegativeInteger(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
}

function isInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  )
}

function isValidUtcDay(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

function isValidUtcTimestamp(value: unknown): value is string {
  return typeof value === "string" && isCanonicalUtcTimestamp(value)
}

export function validatePositionEngine(
  value: unknown
): asserts value is PositionEngine {
  if (!isRecord(value)) {
    throw new Error("INVALID_ENGINE_STATE")
  }

  const {
    ledger,
    positions,
    dailyPnlCents,
    dailyRiskClock,
    pendingReconciliationTradeId,
  } = value

  if (!isRecord(ledger) || !isRecord(positions)) {
    throw new Error("INVALID_ENGINE_STATE")
  }

  if (
    !isNonNegativeInteger(ledger.operatingCapitalCents) ||
    !isNonNegativeInteger(ledger.reservedProfitCents) ||
    !isInteger(ledger.totalRealizedPnlCents) ||
    !isNonNegativeInteger(ledger.completedTrades) ||
    !isInteger(dailyPnlCents)
  ) {
    throw new Error("INVALID_LEDGER_STATE")
  }

  if (pendingReconciliationTradeId !== null &&
      (typeof pendingReconciliationTradeId !== "string" || !pendingReconciliationTradeId.trim())) {
    throw new Error("INVALID_RECONCILIATION_STATE")
  }

  const initialCents = 5000
  const equity = ledger.operatingCapitalCents + ledger.reservedProfitCents
  const expectedEquity = initialCents + ledger.totalRealizedPnlCents
  if (!Number.isSafeInteger(equity) || !Number.isSafeInteger(expectedEquity) ||
      equity !== expectedEquity) {
    throw new Error("INVALID_LEDGER_BALANCE")
  }

  // Fail closed: a persisted engine must have a valid UTC clock.
  if (
    !isRecord(dailyRiskClock) ||
    !isValidUtcDay(dailyRiskClock.tradingDayUtc) ||
    !isInteger(dailyRiskClock.dailyPnlCents)
  ) {
    throw new Error("INVALID_DAILY_RISK_CLOCK")
  }

  if (
    dailyRiskClock.dailyPnlCents !== dailyPnlCents
  ) {
    throw new Error("DAILY_PNL_CLOCK_MISMATCH")
  }

  const closedTradeIds = positions.closedTradeIds

  if (
    !Array.isArray(closedTradeIds) ||
    !closedTradeIds.every(
      (id) =>
        typeof id === "string" &&
        id.trim().length > 0
    ) ||
    new Set(closedTradeIds).size !==
      closedTradeIds.length
  ) {
    throw new Error("INVALID_CLOSED_TRADE_IDS")
  }

  if (
    ledger.completedTrades !==
    closedTradeIds.length
  ) {
    throw new Error("TRADE_COUNT_MISMATCH")
  }

  const openPosition = positions.openPosition

  if (pendingReconciliationTradeId !== null &&
      (!isRecord(openPosition) || openPosition.tradeId !== pendingReconciliationTradeId)) {
    throw new Error("INVALID_RECONCILIATION_STATE")
  }

  if (openPosition !== null) {
    if (
      !isRecord(openPosition) ||
      typeof openPosition.tradeId !== "string" ||
      !openPosition.tradeId.trim() ||
      closedTradeIds.includes(openPosition.tradeId) ||
      !isNonNegativeInteger(openPosition.investedCents) ||
      openPosition.investedCents === 0 ||
      !isValidUtcTimestamp(openPosition.openedAtUtc)
    ) {
      throw new Error("INVALID_OPEN_POSITION")
    }

    if (
      openPosition.investedCents >
      ledger.operatingCapitalCents
    ) {
      throw new Error("POSITION_EXCEEDS_CAPITAL")
    }

    if (
      openPosition.openedAtUtc.slice(0, 10) >
      dailyRiskClock.tradingDayUtc
    ) {
      throw new Error("POSITION_OPENED_AFTER_CLOCK")
    }
  }
}

export async function saveSimulationState(
  filePath: string,
  engine: PositionEngine
): Promise<void> {
  validatePositionEngine(engine)

  const snapshot: SimulationSnapshot = {
    version: SNAPSHOT_VERSION,
    engine,
  }

  await mkdir(dirname(filePath), {
    recursive: true,
  })

  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${randomUUID()}.tmp`
  )

  try {

await writeFile(
  temporaryPath,
  JSON.stringify(snapshot, null, 2) + "\n",
  {
    encoding: "utf8",
    flag: "wx",
    flush: true,
  }
)

await rename(temporaryPath, filePath)

  } catch (error) {
    await unlink(temporaryPath).catch(
      () => undefined
    )

    throw error
  }
}

export async function loadSimulationState(
  filePath: string
): Promise<PositionEngine> {
  let content: string

  try {
    content = await readFile(
      filePath,
      "utf8"
    )
  } catch (error) {
    if (
      isRecord(error) &&
      error.code === "ENOENT"
    ) {
      throw new Error(
        "SIMULATION_STATE_NOT_FOUND"
      )
    }

    throw error
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(
      "CORRUPTED_SIMULATION_STATE"
    )
  }

  if (
    !isRecord(parsed) ||
    parsed.version !== SNAPSHOT_VERSION
  ) {
    throw new Error(
      "UNSUPPORTED_SIMULATION_STATE_VERSION"
    )
  }

  validatePositionEngine(parsed.engine)

  return parsed.engine
}

export async function inspectSimulationTemporaryFiles(
  filePath: string
): Promise<string[]> {
  const directory = dirname(filePath)
  const prefix = `.${basename(filePath)}.`

  let entries: string[]

  try {
    entries = await readdir(directory)
  } catch (error) {
    if (
      isRecord(error) &&
      error.code === "ENOENT"
    ) {
      return []
    }

    throw error
  }

  return entries
    .filter(
      (name) =>
        name.startsWith(prefix) &&
        name.endsWith(".tmp")
    )
    .sort()
}
