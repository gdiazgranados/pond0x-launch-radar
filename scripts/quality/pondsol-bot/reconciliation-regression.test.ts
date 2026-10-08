import assert from "node:assert/strict"
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { PersistentPositionEngine } from "../../../src/private-alpha/pondsol-bot/persistent-position-engine"
import { loadSimulationState } from "../../../src/private-alpha/pondsol-bot/simulation-persistence"

const guard = { estimatedNetProfitPct: 2, quoteAgeSeconds: 5, worstCaseLossUsd: 1 }
const start = new Date("2026-10-07T20:00:00.000Z")
const insolvent = { exitValueUsd: 0, entryFeeUsd: 20, exitFeeUsd: 20, networkCostUsd: 15 }

test("insolvency persists reconciliation and blocks restore/enter/exit/synchronize", async () => {
 const dir = await mkdtemp(join(tmpdir(), "pondsol-reconciliation-"))
 const path = join(dir, "state.json")
 try {
  const engine = await PersistentPositionEngine.initialize(path, start)
  await engine.enter("insolvent-001", 10, guard, "2026-10-07T20:05:00.000Z")
  await assert.rejects(engine.exit("insolvent-001", insolvent, "2026-10-07T20:10:00.000Z"), /SIMULATION_RECONCILIATION_REQUIRED/)
  const restored = await PersistentPositionEngine.restore(path)
  const state = restored.getState()
  assert.equal(state.pendingReconciliationTradeId, "insolvent-001")
  assert.equal(state.ledger.operatingCapitalCents, 5000)
  assert.equal(state.positions.openPosition?.tradeId, "insolvent-001")
  assert.deepEqual(await loadSimulationState(path), state)
  await assert.rejects(restored.enter("next", 10, guard, "2026-10-07T20:20:00.000Z"), /SIMULATION_RECONCILIATION_REQUIRED/)
  await assert.rejects(restored.exit("insolvent-001", insolvent, "2026-10-07T20:30:00.000Z"), /SIMULATION_RECONCILIATION_REQUIRED/)
  await assert.rejects(restored.synchronize(new Date("2026-10-08T00:00:00.000Z")), /SIMULATION_RECONCILIATION_REQUIRED/)
  assert.deepEqual(restored.getState(), state)
 } finally { await rm(dir, {recursive:true,force:true}) }
})

test("v2 snapshots require explicit migration and inconsistent v3 balances are rejected", async () => {
 const dir = await mkdtemp(join(tmpdir(), "pondsol-snapshot-"))
 const path = join(dir, "state.json")
 try {
  await PersistentPositionEngine.initialize(path, start)
  const original = JSON.parse(await readFile(path,"utf8"))
  await writeFile(path, JSON.stringify({...original, version:2}))
  await assert.rejects(PersistentPositionEngine.restore(path), /UNSUPPORTED_SIMULATION_STATE_VERSION/)
  original.engine.ledger.operatingCapitalCents = 4900
  await writeFile(path, JSON.stringify(original))
  await assert.rejects(PersistentPositionEngine.restore(path), /INVALID_LEDGER_BALANCE/)
 } finally { await rm(dir,{recursive:true,force:true}) }
})
