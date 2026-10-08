import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  createPositionEngine,
  synchronizeTradingDay,
} from "../../../src/private-alpha/pondsol-bot/position-engine"
import {
  inspectSimulationTemporaryFiles,
  loadSimulationState,
  saveSimulationState,
} from "../../../src/private-alpha/pondsol-bot/simulation-persistence"

const NOW = new Date("2026-10-08T12:00:00.000Z")

async function fixture(run: (filePath: string, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "pondsol-p2cb-"))
  try {
    await run(join(directory, "state.json"), directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function initialState() {
  return synchronizeTradingDay(createPositionEngine(), NOW)
}

test("partial temporary snapshot cannot replace the committed snapshot", async () => {
  await fixture(async (filePath, directory) => {
    const original = initialState()
    await saveSimulationState(filePath, original)
    const committedBytes = await readFile(filePath, "utf8")
    await writeFile(join(directory, ".state.json.crash.tmp"), '{"version":3,"engine":', "utf8")
    assert.deepEqual(await loadSimulationState(filePath), original)
    assert.equal(await readFile(filePath, "utf8"), committedBytes)
    assert.deepEqual(await inspectSimulationTemporaryFiles(filePath), [".state.json.crash.tmp"])
  })
})

test("complete but uncommitted temporary snapshot is never promoted", async () => {
  await fixture(async (filePath, directory) => {
    const original = initialState()
    await saveSimulationState(filePath, original)
    const committedBytes = await readFile(filePath, "utf8")
    const uncommitted = { ...original, dailyPnlCents: -100,
      dailyRiskClock: { tradingDayUtc: "2026-10-08", dailyPnlCents: -100 } }
    await writeFile(join(directory, ".state.json.uncommitted.tmp"),
      JSON.stringify({ version: 3, engine: uncommitted }), "utf8")
    assert.deepEqual(await loadSimulationState(filePath), original)
    assert.equal(await readFile(filePath, "utf8"), committedBytes)
  })
})

test("temporary snapshot alone never initializes missing committed state", async () => {
  await fixture(async (filePath, directory) => {
    await writeFile(join(directory, ".state.json.orphan.tmp"),
      JSON.stringify({ version: 3, engine: initialState() }), "utf8")
    await assert.rejects(loadSimulationState(filePath), /SIMULATION_STATE_NOT_FOUND/)
    assert.deepEqual(await inspectSimulationTemporaryFiles(filePath), [".state.json.orphan.tmp"])
  })
})
