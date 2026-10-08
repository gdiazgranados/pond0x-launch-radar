import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { withSimulationFileLock } from "../../../src/private-alpha/pondsol-bot/simulation-file-lock"

test("does not release a substituted lock directory even if owner metadata was copied", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pondsol-lock-swap-"))
  const filePath = join(directory, "state.json")
  const lockPath = `${filePath}.lock`
  const parkedPath = `${filePath}.parked`
  try {
    await assert.rejects(
      withSimulationFileLock(filePath, async () => {
        const metadata = await readFile(join(lockPath, "owner.json"), "utf8")
        await rename(lockPath, parkedPath)
        await mkdir(lockPath)
        await writeFile(join(lockPath, "owner.json"), metadata, "utf8")
      }),
      /SIMULATION_LOCK_DIRECTORY_REPLACED/
    )
    assert.ok((await stat(lockPath)).isDirectory())
    assert.ok((await stat(parkedPath)).isDirectory())
    await assert.rejects(
      withSimulationFileLock(filePath, async () => {}),
      /SIMULATION_STATE_LOCKED/
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
