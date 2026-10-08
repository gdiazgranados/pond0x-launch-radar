
import type { CompoundingLedger } from "./compounding-ledger"
import type { PositionState } from "./position-state"

export type CapitalSnapshot = {
  operatingCapitalCents: number
  committedCapitalCents: number
  availableCapitalCents: number
  reservedProfitCents: number
  totalEquityCents: number
}

export function calculateCapitalSnapshot(
  ledger: CompoundingLedger,
  positions: PositionState
): CapitalSnapshot {
  const operating = ledger.operatingCapitalCents
  const reserved = ledger.reservedProfitCents
  const committed =
    positions.openPosition?.investedCents ?? 0

  if (
    !Number.isSafeInteger(operating) ||
    !Number.isSafeInteger(reserved) ||
    !Number.isSafeInteger(committed) ||
    operating < 0 ||
    reserved < 0 ||
    committed < 0 ||
    committed > operating
  ) {
    throw new Error("INVALID_CAPITAL_STATE")
  }

  const available = operating - committed
  const equity = operating + reserved

  if (
    !Number.isSafeInteger(available) ||
    !Number.isSafeInteger(equity)
  ) {
    throw new Error("CAPITAL_OVERFLOW")
  }

  return {
    operatingCapitalCents: operating,
    committedCapitalCents: committed,
    availableCapitalCents: available,
    reservedProfitCents: reserved,
    totalEquityCents: equity,
  }
}
