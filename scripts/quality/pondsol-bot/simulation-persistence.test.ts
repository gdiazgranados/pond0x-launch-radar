
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  createPositionEngine,
  enterSimulatedPosition,
  exitSimulatedPosition,
  synchronizeTradingDay,
} from "../../../src/private-alpha/pondsol-bot/position-engine"

import {
  inspectSimulationTemporaryFiles,
  loadSimulationState,
  saveSimulationState,
} from "../../../src/private-alpha/pondsol-bot/simulation-persistence"

const DAY_ONE = new Date("2026-10-07T20:00:00.000Z")
const DAY_TWO = new Date("2026-10-08T12:00:00.000Z")

function createValidEngine() {
  return synchronizeTradingDay(
    createPositionEngine(),
    DAY_ONE
  )
}

async function withTemporaryState(
  callback: (filePath: string) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-simulation-test-")
  )

  try {
    await callback(join(directory, "simulation-state.json"))
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
}

async function writeSnapshot(
  filePath: string,
  engine: unknown,
  version = 2
): Promise<void> {
  await writeFile(
    filePath,
    JSON.stringify({ version, engine }),
    "utf8"
  )
}

test("saves and restores initial simulation state", async () => {
  await withTemporaryState(async (filePath) => {
    const original = createValidEngine()

    await saveSimulationState(filePath, original)

    const restored = await loadSimulationState(filePath)

    assert.deepEqual(restored, original)
    assert.equal(restored.ledger.operatingCapitalCents, 5000)
    assert.equal(restored.dailyRiskClock?.tradingDayUtc, "2026-10-07")
  })
})

test("restores an open position after restart", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = enterSimulatedPosition(
      createPositionEngine(),
      "trade-open-001",
      10,
      {
        estimatedNetProfitPct: 2,
        quoteAgeSeconds: 5,
        worstCaseLossUsd: 1,
      },
      "2026-10-07T20:00:00.000Z"
    )

    await saveSimulationState(filePath, engine)

    const restored = await loadSimulationState(filePath)

    assert.deepEqual(restored, engine)
    assert.equal(
      restored.positions.openPosition?.tradeId,
      "trade-open-001"
    )
  })
})

test("restores realized profit and closed trade history", async () => {
  await withTemporaryState(async (filePath) => {
    const entered = enterSimulatedPosition(
      createPositionEngine(),
      "trade-closed-001",
      10,
      {
        estimatedNetProfitPct: 2,
        quoteAgeSeconds: 5,
        worstCaseLossUsd: 1,
      },
      "2026-10-07T20:00:00.000Z"
    )

    const closed = exitSimulatedPosition(
      entered,
      "trade-closed-001",
      {
        exitValueUsd: 10.5,
        entryFeeUsd: 0,
        exitFeeUsd: 0,
        networkCostUsd: 0,
      },
      "2026-10-07T20:10:00.000Z"
    )

    await saveSimulationState(filePath, closed)

    const restored = await loadSimulationState(filePath)

    assert.deepEqual(restored, closed)
    assert.equal(restored.ledger.completedTrades, 1)
    assert.deepEqual(
      restored.positions.closedTradeIds,
      ["trade-closed-001"]
    )
  })
})

test("rejects corrupted JSON without resetting capital", async () => {
  await withTemporaryState(async (filePath) => {
    await writeFile(filePath, "{broken-json", "utf8")

    await assert.rejects(
      loadSimulationState(filePath),
      /CORRUPTED_SIMULATION_STATE/
    )

    assert.equal(
      await readFile(filePath, "utf8"),
      "{broken-json"
    )
  })
})

test("rejects duplicate closed trade IDs", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = createValidEngine()

    const invalid = {
      ...engine,
      ledger: {
        ...engine.ledger,
        completedTrades: 2,
      },
      positions: {
        openPosition: null,
        closedTradeIds: ["trade-001", "trade-001"],
      },
    }

    await writeSnapshot(filePath, invalid)

    await assert.rejects(
      loadSimulationState(filePath),
      /INVALID_CLOSED_TRADE_IDS/
    )
  })
})

test("rejects unsupported snapshot versions", async () => {
  await withTemporaryState(async (filePath) => {
    await writeSnapshot(
      filePath,
      createValidEngine(),
      999
    )

    await assert.rejects(
      loadSimulationState(filePath),
      /UNSUPPORTED_SIMULATION_STATE_VERSION/
    )
  })
})

test("does not silently initialize missing state", async () => {
  await withTemporaryState(async (filePath) => {
    await assert.rejects(
      loadSimulationState(filePath),
      /SIMULATION_STATE_NOT_FOUND/
    )
  })
})

test("rejects legacy version 1 snapshots", async () => {
  await withTemporaryState(async (filePath) => {
    await writeSnapshot(
      filePath,
      createValidEngine(),
      1
    )

    await assert.rejects(
      loadSimulationState(filePath),
      /UNSUPPORTED_SIMULATION_STATE_VERSION/
    )
  })
})

test("rejects snapshots without a daily risk clock", async () => {
  await withTemporaryState(async (filePath) => {
    const { dailyRiskClock: _clock, ...invalid } =
      createValidEngine()

    await writeSnapshot(filePath, invalid)

    await assert.rejects(
      loadSimulationState(filePath),
      /INVALID_DAILY_RISK_CLOCK/
    )
  })
})

test("rejects mismatched daily PnL and risk clock", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = createValidEngine()

    const invalid = {
      ...engine,
      dailyPnlCents: -200,
      dailyRiskClock: {
        tradingDayUtc: "2026-10-07",
        dailyPnlCents: -100,
      },
    }

    await writeSnapshot(filePath, invalid)

    await assert.rejects(
      loadSimulationState(filePath),
      /DAILY_PNL_CLOCK_MISMATCH/
    )
  })
})

test("rejects invalid UTC trading days", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = createValidEngine()

    const invalid = {
      ...engine,
      dailyRiskClock: {
        tradingDayUtc: "2026-02-30",
        dailyPnlCents: 0,
      },
    }

    await writeSnapshot(filePath, invalid)

    await assert.rejects(
      loadSimulationState(filePath),
      /INVALID_DAILY_RISK_CLOCK/
    )
  })
})

test("rejects open positions dated after the risk clock", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = createValidEngine()

    const invalid = {
      ...engine,
      positions: {
        openPosition: {
          tradeId: "future-position-001",
          investedCents: 1000,
          openedAtUtc: "2026-10-08T01:00:00.000Z",
        },
        closedTradeIds: [],
      },
    }

    await writeSnapshot(filePath, invalid)

    await assert.rejects(
      loadSimulationState(filePath),
      /POSITION_OPENED_AFTER_CLOCK/
    )
  })
})

test("preserves daily losses after restart on the same UTC day", async () => {
  await withTemporaryState(async (filePath) => {
    const entered = enterSimulatedPosition(
      createPositionEngine(),
      "loss-restart-001",
      10,
      {
        estimatedNetProfitPct: 2,
        quoteAgeSeconds: 5,
        worstCaseLossUsd: 1,
      },
      "2026-10-07T20:00:00.000Z"
    )

    const closed = exitSimulatedPosition(
      entered,
      "loss-restart-001",
      {
        exitValueUsd: 8,
        entryFeeUsd: 0,
        exitFeeUsd: 0,
        networkCostUsd: 0,
      },
      "2026-10-07T20:10:00.000Z"
    )

    await saveSimulationState(filePath, closed)

    const restored = await loadSimulationState(filePath)

    const synchronized = synchronizeTradingDay(
      restored,
      new Date("2026-10-07T23:00:00.000Z")
    )

    assert.equal(synchronized.dailyPnlCents, -200)
    assert.equal(
      synchronized.dailyRiskClock?.dailyPnlCents,
      -200
    )
    assert.equal(
      synchronized.ledger.totalRealizedPnlCents,
      -200
    )
  })
})

test("resets daily loss but preserves total loss on next UTC day", async () => {
  await withTemporaryState(async (filePath) => {
    const entered = enterSimulatedPosition(
      createPositionEngine(),
      "loss-next-day-001",
      10,
      {
        estimatedNetProfitPct: 2,
        quoteAgeSeconds: 5,
        worstCaseLossUsd: 1,
      },
      "2026-10-07T20:00:00.000Z"
    )

    const closed = exitSimulatedPosition(
      entered,
      "loss-next-day-001",
      {
        exitValueUsd: 8,
        entryFeeUsd: 0,
        exitFeeUsd: 0,
        networkCostUsd: 0,
      },
      "2026-10-07T20:10:00.000Z"
    )

    await saveSimulationState(filePath, closed)

    const restored = await loadSimulationState(filePath)
    const nextDay = synchronizeTradingDay(
      restored,
      DAY_TWO
    )

    assert.equal(nextDay.dailyPnlCents, 0)
    assert.equal(
      nextDay.dailyRiskClock?.tradingDayUtc,
      "2026-10-08"
    )
    assert.equal(
      nextDay.ledger.totalRealizedPnlCents,
      -200
    )
  })
})

test("ignores an abandoned temporary file during restore", async () => {
  const { mkdtemp, writeFile, rm } =
    await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")

  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-abandoned-temp-")
  )

  const filePath = join(directory, "state.json")
  const temporaryPath = join(
    directory,
    ".state.json.interrupted.tmp"
  )

  try {
    const original = synchronizeTradingDay(
      createPositionEngine(),
      new Date("2026-10-07T20:00:00.000Z")
    )

    await saveSimulationState(filePath, original)

    // Simulate a crash before rename().
    await writeFile(
      temporaryPath,
      '{"version":2,"engine":'
    )

    const restored = await loadSimulationState(filePath)

    assert.deepEqual(restored, original)
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})

test("detects abandoned temporary files without changing the snapshot", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-temp-diagnostic-")
  )

  const filePath = join(directory, "state.json")

  try {
    const original = synchronizeTradingDay(
      createPositionEngine(),
      new Date("2026-10-07T20:00:00.000Z")
    )

    await saveSimulationState(filePath, original)

    await writeFile(
      join(directory, ".state.json.abandoned-1.tmp"),
      '{"incomplete":'
    )

    await writeFile(
      join(directory, ".state.json.abandoned-2.tmp"),
      "partial snapshot"
    )

    // Unrelated files must not appear in the diagnosis.
    await writeFile(
      join(directory, "unrelated.tmp"),
      "unrelated"
    )

    const temporaryFiles =
      await inspectSimulationTemporaryFiles(filePath)

    assert.deepEqual(temporaryFiles, [
      ".state.json.abandoned-1.tmp",
      ".state.json.abandoned-2.tmp",
    ])

    const restored = await loadSimulationState(filePath)

    assert.deepEqual(restored, original)
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})

test("preserves existing snapshot when a new save is rejected", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-failed-save-")
  )

  const filePath = join(directory, "state.json")

  try {
    const original = synchronizeTradingDay(
      createPositionEngine(),
      new Date("2026-10-07T20:00:00.000Z")
    )

    await saveSimulationState(filePath, original)

    const before = await readFile(filePath, "utf8")

    const invalid = structuredClone(original)
    invalid.ledger.completedTrades = 999

    await assert.rejects(
      saveSimulationState(filePath, invalid),
      /TRADE_COUNT_MISMATCH/
    )

    const after = await readFile(filePath, "utf8")

    assert.equal(after, before)
    assert.deepEqual(
      await loadSimulationState(filePath),
      original
    )
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})
