import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { test } from "node:test"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { diagnoseSimulationLock, withSimulationFileLock } from "../../../src/private-alpha/pondsol-bot/simulation-file-lock"
import { PersistentPositionEngine } from "../../../src/private-alpha/pondsol-bot/persistent-position-engine"

async function crash(filePath: string, phase: string): Promise<void> {
  const worker = resolve("scripts/quality/pondsol-bot/lock-crash-metadata-worker.mjs")
  await new Promise<void>((resolveDone, reject) => {
    const child = spawn(process.execPath, [worker, filePath, phase], { windowsHide: true })
    let output = ""
    let errors = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => { output += chunk })
    child.stderr.on("data", (chunk: string) => { errors += chunk })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 99 || !output.includes(`CRASH_PHASE:${phase}`)) {
        reject(new Error(`UNEXPECTED_CRASH_WORKER_RESULT:${code}:${output}:${errors}`))
      } else resolveDone()
    })
  })
}

for (const phase of ["before-metadata", "after-metadata"] as const) {
  test(`process crash ${phase} leaves lock untouched and blocks restore`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "pondsol-crash-"))
    const filePath = join(directory, "state.json")
    try {
      await PersistentPositionEngine.initialize(filePath, new Date("2026-10-08T10:00:00.000Z"))
      const before = await readFile(filePath, "utf8")
      await crash(filePath, phase)
      const lockPath = `${filePath}.lock`
      assert.ok((await stat(lockPath)).isDirectory())
      const diagnosis = await diagnoseSimulationLock(filePath)
      if (phase === "before-metadata") assert.equal(diagnosis, "UNKNOWN")
      else assert.ok(["ORPHAN_CANDIDATE", "UNKNOWN"].includes(diagnosis), diagnosis)
      await assert.rejects(PersistentPositionEngine.restore(filePath), /SIMULATION_STATE_LOCKED/)
      await assert.rejects(withSimulationFileLock(filePath, async () => {}), /SIMULATION_STATE_LOCKED/)
      assert.ok((await stat(lockPath)).isDirectory())
      assert.equal(await readFile(filePath, "utf8"), before)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}

test("crash lock is never auto-recovered by repeated diagnosis", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pondsol-repeat-diagnosis-"))
  const filePath = join(directory, "state.json")
  try {
    await crash(filePath, "after-metadata")
    const ownerFile = join(`${filePath}.lock`, "owner.json")
    const original = await readFile(ownerFile, "utf8")
    for (let i = 0; i < 3; i++) {
      const status = await diagnoseSimulationLock(filePath)
      assert.ok(["ORPHAN_CANDIDATE", "UNKNOWN"].includes(status), status)
      assert.equal(await readFile(ownerFile, "utf8"), original)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
