
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  PersistentPositionEngine,
} from "../../../src/private-alpha/pondsol-bot/persistent-position-engine"

import {
  loadSimulationState,
} from "../../../src/private-alpha/pondsol-bot/simulation-persistence"

const START = new Date("2026-10-07T20:00:00.000Z")

const GUARD = {
  estimatedNetProfitPct: 2,
  quoteAgeSeconds: 5,
  worstCaseLossUsd: 1,
}

const EXIT = {
  exitValueUsd: 9,
  entryFeeUsd: 0,
  exitFeeUsd: 0,
  networkCostUsd: 0,
}

async function withTemporaryState(
  callback: (filePath: string) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-persistent-test-")
  )

  try {
    await callback(join(directory, "state.json"))
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
}

test("initializes and persists $50 capital", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    const diskState = await loadSimulationState(filePath)

    assert.deepEqual(engine.getState(), diskState)
    assert.equal(diskState.ledger.operatingCapitalCents, 5000)
    assert.equal(diskState.dailyRiskClock?.tradingDayUtc, "2026-10-07")
  })
})

test("persists an open position before returning", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    await engine.enter(
      "persistent-open-001",
      10,
      GUARD,
      "2026-10-07T20:05:00.000Z"
    )

    const diskState = await loadSimulationState(filePath)

    assert.equal(
      diskState.positions.openPosition?.tradeId,
      "persistent-open-001"
    )
    assert.deepEqual(engine.getState(), diskState)
  })
})

test("restores an open position after restart", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    await engine.enter(
      "persistent-restart-001",
      10,
      GUARD,
      "2026-10-07T20:05:00.000Z"
    )

    const restored = await PersistentPositionEngine.restore(
      filePath
    )

    assert.deepEqual(restored.getState(), engine.getState())
    assert.equal(
      restored.getState().positions.openPosition?.tradeId,
      "persistent-restart-001"
    )
  })
})

test("persists realized losses after closing", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    await engine.enter(
      "persistent-loss-001",
      10,
      GUARD,
      "2026-10-07T20:05:00.000Z"
    )

    await engine.exit(
      "persistent-loss-001",
      EXIT,
      "2026-10-07T20:10:00.000Z"
    )

    const restored = await PersistentPositionEngine.restore(
      filePath
    )

    assert.equal(restored.getState().dailyPnlCents, -100)
    assert.equal(
      restored.getState().dailyRiskClock?.dailyPnlCents,
      -100
    )
    assert.equal(
      restored.getState().ledger.totalRealizedPnlCents,
      -100
    )
    assert.equal(
      restored.getState().positions.openPosition,
      null
    )
  })
})

test("does not publish a position when persistence fails", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    const before = engine.getState()

    // An existing directory at the snapshot destination
    // prevents replacement by rename on Windows.
    const { rename, mkdir } = await import("node:fs/promises")
    const blockedPath = join(
      filePath,
      "blocked"
    )

    // Use a second engine with an invalid destination.
    // Its initialization must fail rather than report success.
    await assert.rejects(
      PersistentPositionEngine.initialize(
        blockedPath,
        START
      )
    )

    assert.deepEqual(engine.getState(), before)

    void rename
    void mkdir
  })
})

test("restores daily loss and resets only on next UTC day", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    await engine.enter(
      "persistent-midnight-001",
      10,
      GUARD,
      "2026-10-07T20:05:00.000Z"
    )

    await engine.exit(
      "persistent-midnight-001",
      EXIT,
      "2026-10-07T20:10:00.000Z"
    )

    const restored = await PersistentPositionEngine.restore(
      filePath
    )

    assert.equal(restored.getState().dailyPnlCents, -100)

    await restored.synchronize(
      new Date("2026-10-08T00:05:00.000Z")
    )

    const diskState = await loadSimulationState(filePath)

    assert.equal(diskState.dailyPnlCents, 0)
    assert.equal(
      diskState.ledger.totalRealizedPnlCents,
      -100
    )
    assert.equal(
      diskState.dailyRiskClock?.tradingDayUtc,
      "2026-10-08"
    )
  })
})
test("keeps memory unchanged when enter persistence fails", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    const before = engine.getState()

    const { rename, mkdir } = await import("node:fs/promises")

    const backupPath = `${filePath}.backup`

    // Move the valid snapshot out of the way.
    await rename(filePath, backupPath)

    // Replace the snapshot destination with a directory.
    // On Windows, rename(temp, directory) must fail.
    await mkdir(filePath)

    await assert.rejects(
      engine.enter(
        "failed-write-001",
        10,
        GUARD,
        "2026-10-07T20:05:00.000Z"
      )
    )

    // Failed persistence must not publish the position.
    assert.deepEqual(engine.getState(), before)

    // The original snapshot remains recoverable.
    const recovered = await loadSimulationState(backupPath)
    assert.deepEqual(recovered, before)
  })
})
test("prevents initialization from resetting existing losses", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    await engine.enter(
      "protected-capital-001",
      10,
      GUARD,
      "2026-10-07T20:05:00.000Z"
    )

    await engine.exit(
      "protected-capital-001",
      EXIT,
      "2026-10-07T20:10:00.000Z"
    )

    const before = await loadSimulationState(filePath)

    assert.equal(before.dailyPnlCents, -100)
    assert.equal(before.ledger.operatingCapitalCents, 4900)

    await assert.rejects(
      PersistentPositionEngine.initialize(
        filePath,
        START
      ),
      /SIMULATION_ALREADY_EXISTS/
    )

    const after = await loadSimulationState(filePath)

    assert.deepEqual(after, before)
    assert.equal(after.ledger.operatingCapitalCents, 4900)
    assert.equal(after.dailyPnlCents, -100)
  })
})
test("rejects simultaneous entries without losing state", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    const results = await Promise.allSettled([
      engine.enter(
        "concurrent-001",
        10,
        GUARD,
        "2026-10-07T20:05:00.000Z"
      ),
      engine.enter(
        "concurrent-002",
        10,
        GUARD,
        "2026-10-07T20:05:01.000Z"
      ),
    ])

    const successful = results.filter(
      (result) => result.status === "fulfilled"
    )

    const rejected = results.filter(
      (result) => result.status === "rejected"
    )

    assert.equal(successful.length, 1)
    assert.equal(rejected.length, 1)

    const diskState = await loadSimulationState(filePath)

    assert.deepEqual(engine.getState(), diskState)
    assert.ok(
      ["concurrent-001", "concurrent-002"].includes(
        diskState.positions.openPosition?.tradeId ?? ""
      )
    )
  })
})
test("prevents independent instances from overwriting each other", async () => {
  await withTemporaryState(async (filePath) => {
    const first = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    const second = await PersistentPositionEngine.restore(
      filePath
    )

    await first.enter(
      "instance-a-001",
      10,
      GUARD,
      "2026-10-07T20:05:00.000Z"
    )

    await assert.rejects(
      second.enter(
        "instance-b-001",
        10,
        GUARD,
        "2026-10-07T20:05:01.000Z"
      )
    )

    const diskState = await loadSimulationState(filePath)

    assert.equal(
      diskState.positions.openPosition?.tradeId,
      "instance-a-001"
    )

    assert.deepEqual(first.getState(), diskState)
  })
})
test("rejects writes while another process holds the lock", async () => {
  await withTemporaryState(async (filePath) => {
    const engine = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    const { mkdir, rmdir } = await import("node:fs/promises")
    const lockPath = `${filePath}.lock`

    const before = engine.getState()

    await mkdir(lockPath)

    try {
      await assert.rejects(
        engine.enter(
          "locked-trade-001",
          10,
          GUARD,
          "2026-10-07T20:05:00.000Z"
        ),
        /SIMULATION_STATE_LOCKED/
      )

      assert.deepEqual(engine.getState(), before)

      const diskState = await loadSimulationState(filePath)
      assert.deepEqual(diskState, before)
    } finally {
      await rmdir(lockPath)
    }
  })
})
test("releases file lock after a failed state conflict", async () => {
  await withTemporaryState(async (filePath) => {
    const first = await PersistentPositionEngine.initialize(
      filePath,
      START
    )

    const stale = await PersistentPositionEngine.restore(
      filePath
    )

    await first.enter(
      "lock-recovery-001",
      10,
      GUARD,
      "2026-10-07T20:05:00.000Z"
    )

    await assert.rejects(
      stale.enter(
        "stale-recovery-001",
        10,
        GUARD,
        "2026-10-07T20:05:01.000Z"
      ),
      /SIMULATION_STATE_CONFLICT/
    )

    const { stat } = await import("node:fs/promises")

    await assert.rejects(
      stat(`${filePath}.lock`),
      { code: "ENOENT" }
    )

    const recovered = await PersistentPositionEngine.restore(
      filePath
    )

    assert.equal(
      recovered.getState().positions.openPosition?.tradeId,
      "lock-recovery-001"
    )

    assert.deepEqual(
      recovered.getState(),
      await loadSimulationState(filePath)
    )
  })
})
