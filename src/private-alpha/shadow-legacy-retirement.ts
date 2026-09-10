import { invalidateShadowPosition } from "./shadow-portfolio"
import {
  loadShadowExecutionBasis,
  type PrivateShadowExecutionBasisStore,
} from "./shadow-execution-basis"
import type { PrivateShadowPortfolioStore } from "./shadow-portfolio-repository"
import {
  loadShadowSimulationState,
  persistShadowSimulationTransition,
} from "./shadow-simulation-coordinator"

export const LEGACY_EXECUTION_BASIS_UNAVAILABLE =
  "LEGACY_EXECUTION_BASIS_UNAVAILABLE"

export async function retireLegacyShadowPosition(
  portfolioStore: PrivateShadowPortfolioStore,
  executionBasisStore: PrivateShadowExecutionBasisStore,
  input: {
    positionId: string
    retiredAt: string
  }
) {
  if (!input.positionId.trim()) {
    throw new Error("positionId is required")
  }
  if (!Number.isFinite(Date.parse(input.retiredAt))) {
    throw new Error("retiredAt must be a valid timestamp")
  }

  const [state, basisLedger] = await Promise.all([
    loadShadowSimulationState(portfolioStore),
    loadShadowExecutionBasis(executionBasisStore),
  ])
  const position = state.portfolio.positions.find(
    (item) => item.positionId === input.positionId
  )
  if (!position) throw new Error("shadow position not found")

  const executionBasis = basisLedger.records.find(
    (item) => item.positionId === input.positionId
  )
  if (executionBasis) {
    throw new Error("modern shadow position cannot be retired as legacy")
  }

  if (
    position.status === "INVALIDATED" &&
    position.invalidationReason === LEGACY_EXECUTION_BASIS_UNAVAILABLE
  ) {
    return {
      simulationOnly: true as const,
      changed: false,
      position,
      retiredAt: state.portfolio.updatedAt,
      state,
    }
  }
  if (position.status !== "OPEN") {
    throw new Error("only an open legacy position can be retired")
  }

  const retired = invalidateShadowPosition(
    position,
    LEGACY_EXECUTION_BASIS_UNAVAILABLE
  )
  const next = await persistShadowSimulationTransition(
    portfolioStore,
    retired,
    {
      updatedAt: input.retiredAt,
      expectedRevision: state.portfolio.revision,
    }
  )

  return {
    simulationOnly: true as const,
    changed: true,
    position: retired,
    retiredAt: input.retiredAt,
    state: next,
  }
}
