
import { stat } from "node:fs/promises"

import {
  withSimulationFileLock,
} from "./simulation-file-lock"

import {
  createPositionEngine,
  enterSimulatedPosition,
  exitSimulatedPosition,
  markReconciliationRequired,
  synchronizeTradingDay,
  type PositionEngine,
} from "./position-engine"

import {
  loadSimulationState,
  saveSimulationState,
} from "./simulation-persistence"

import type { GuardedTradeRequest } from "./trade-guard"
import type { SimulatedTrade } from "./trade-simulator"

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  )
}

export class PersistentPositionEngine {
  private engine: PositionEngine
  private pending: Promise<void> = Promise.resolve()
  private persistenceUncertain = false

  private constructor(
    private readonly filePath: string,
    engine: PositionEngine
  ) {
    this.engine = engine
  }

    private static async withFileLock<T>(
    filePath: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return withSimulationFileLock(filePath, operation)
  }

  static async initialize(
    filePath: string,
    now: Date
  ): Promise<PersistentPositionEngine> {
    return this.withFileLock(filePath, async () => {
      try {
        await stat(filePath)
        throw new Error("SIMULATION_ALREADY_EXISTS")
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "SIMULATION_ALREADY_EXISTS"
        ) {
          throw error
        }

        if (!isMissingFile(error)) {
          throw error
        }
      }

      const engine = synchronizeTradingDay(
        createPositionEngine(),
        now
      )

      await saveSimulationState(filePath, engine)

      return new PersistentPositionEngine(
        filePath,
        engine
      )
    })
  }

  static async restore(
    filePath: string
  ): Promise<PersistentPositionEngine> {
    const engine = await this.withFileLock(
      filePath,
      () => loadSimulationState(filePath)
    )

    return new PersistentPositionEngine(
      filePath,
      engine
    )
  }

  getState(): PositionEngine {
    return structuredClone(this.engine)
  }


    private async commit(
    nextEngine: PositionEngine
  ): Promise<void> {
    if (this.persistenceUncertain) {
      throw new Error("SIMULATION_PERSISTENCE_UNCERTAIN")
    }

    try {
      await PersistentPositionEngine.withFileLock(
        this.filePath,
        async () => {
          const diskState = await loadSimulationState(
            this.filePath
          )

          if (
            JSON.stringify(diskState) !==
            JSON.stringify(this.engine)
          ) {
            throw new Error("SIMULATION_STATE_CONFLICT")
          }

          await saveSimulationState(
            this.filePath,
            nextEngine
          )
        }
      )

      this.engine = nextEngine
    } catch (error) {
      // A failed commit may have persisted data before
      // reporting an error. Require a fresh restore.
      this.persistenceUncertain = true
      throw error
    }
  }


  private enqueue<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const result = this.pending.then(operation)

    this.pending = result.then(
      () => undefined,
      () => undefined
    )

    return result
  }

  async enter(
    tradeId: string,
    tradeUsd: number,
    guard: Omit<
      GuardedTradeRequest,
      "state" | "tradeUsd"
    >,
    openedAtUtc: string
  ): Promise<PositionEngine> {
    return this.enqueue(async () => {
      const nextEngine = enterSimulatedPosition(
        this.engine,
        tradeId,
        tradeUsd,
        guard,
        openedAtUtc
      )

      await this.commit(nextEngine)

      return this.getState()
    })
  }

  async exit(
    tradeId: string,
    exit: Omit<SimulatedTrade, "tradeUsd">,
    closedAtUtc?: string
  ): Promise<PositionEngine> {
    return this.enqueue(async () => {
      let nextEngine: PositionEngine
      try {
        nextEngine = exitSimulatedPosition(
          this.engine, tradeId, exit, closedAtUtc
        )
      } catch (error) {
        if (error instanceof Error &&
            error.message === "INSUFFICIENT_OPERATING_CAPITAL") {
          await this.commit(markReconciliationRequired(this.engine, tradeId))
          throw new Error("SIMULATION_RECONCILIATION_REQUIRED")
        }
        throw error
      }

      await this.commit(nextEngine)

      return this.getState()
    })
  }

  async synchronize(
    now: Date
  ): Promise<PositionEngine> {
    return this.enqueue(async () => {
      const nextEngine = synchronizeTradingDay(
        this.engine,
        now
      )

      await this.commit(nextEngine)

      return this.getState()
    })
  }
}
