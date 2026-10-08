
export type OpenPosition = {
  tradeId: string
  investedCents: number
  openedAtUtc: string
}

export type PositionState = {
  openPosition: OpenPosition | null
  closedTradeIds: string[]
}

export function createPositionState(): PositionState {
  return {
    openPosition: null,
    closedTradeIds: [],
  }
}

export function openPosition(
  state: PositionState,
  position: OpenPosition
): PositionState {
  if (state.openPosition !== null) {
    throw new Error("POSITION_ALREADY_OPEN")
  }

  if (
    !position.tradeId.trim() ||
    state.closedTradeIds.includes(position.tradeId)
  ) {
    throw new Error("INVALID_OR_DUPLICATE_TRADE_ID")
  }

  if (
    !Number.isSafeInteger(position.investedCents) ||
    position.investedCents <= 0
  ) {
    throw new Error("INVALID_POSITION_SIZE")
  }

  if (
    !position.openedAtUtc.trim() ||
    !Number.isFinite(Date.parse(position.openedAtUtc))
  ) {
    throw new Error("INVALID_OPEN_TIME")
  }

  return {
    ...state,
    openPosition: { ...position },
  }
}

export function closePosition(
  state: PositionState,
  tradeId: string
): PositionState {
  if (
    state.openPosition === null ||
    state.openPosition.tradeId !== tradeId
  ) {
    throw new Error("POSITION_NOT_FOUND")
  }

  return {
    openPosition: null,
    closedTradeIds: [...state.closedTradeIds, tradeId],
  }
}
