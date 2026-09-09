import { openShadowPosition } from "./shadow-portfolio"
import type { PrivateShadowPortfolioStore } from "./shadow-portfolio-repository"
import {
  loadShadowDecisionAudit,
  loadShadowSimulationState,
  persistShadowSimulationTransition,
  type PrivateShadowDecisionStore,
} from "./shadow-simulation-coordinator"

export async function openAuditedShadowProposal(
  portfolioStore: PrivateShadowPortfolioStore,
  decisionStore: PrivateShadowDecisionStore,
  input: {
    positionId: string
    confirmedAt: string
  }
) {
  if (!input.positionId.trim()) {
    throw new Error("positionId is required")
  }
  if (!Number.isFinite(Date.parse(input.confirmedAt))) {
    throw new Error("confirmedAt must be a valid timestamp")
  }

  const [state, audit] = await Promise.all([
    loadShadowSimulationState(portfolioStore),
    loadShadowDecisionAudit(decisionStore),
  ])
  const position = state.portfolio.positions.find(
    (item) => item.positionId === input.positionId
  )
  if (!position) throw new Error("shadow position not found")
  if (position.status !== "PROPOSED") {
    throw new Error("shadow position is not proposed")
  }

  const decision = audit.records.find(
    (item) =>
      item.positionId === input.positionId &&
      item.status === "PROPOSED"
  )
  if (!decision || decision.portfolioRevision === null) {
    throw new Error("audited proposal decision not found")
  }
  if (
    decision.tokenId !== position.tokenId ||
    decision.ruleVersion !== position.ruleVersion
  ) {
    throw new Error("audited proposal identity mismatch")
  }

  const opened = openShadowPosition(
    position,
    decision.evaluatedAt
  )
  const next = await persistShadowSimulationTransition(
    portfolioStore,
    opened,
    {
      updatedAt: input.confirmedAt,
      expectedRevision: state.portfolio.revision,
    }
  )

  return {
    simulationOnly: true as const,
    position: opened,
    decision,
    confirmedAt: input.confirmedAt,
    state: next,
  }
}
