import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  diagnoseSimulationLock,
  withSimulationFileLock,
} from "../../../src/private-alpha/pondsol-bot/simulation-file-lock"

async function withFixture(run: (filePath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "pondsol-lock-cleanup-"))
  try {
    await run(join(directory, "snapshot.json"))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function leaveUnexpectedFile(filePath: string): Promise<void> {
  await writeFile(`${filePath}.lock/unexpected.txt`, "do not remove automatically")
}

async function assertFailClosed(filePath: string): Promise<void> {
  const lockPath = `${filePath}.lock`
  assert.equal((await stat(lockPath)).isDirectory(), true)
  assert.equal(await readFile(`${lockPath}/unexpected.txt`, "utf8"), "do not remove automatically")
  // The owner metadata may already have been removed when rmdir failed.
  assert.equal(await diagnoseSimulationLock(filePath), "UNKNOWN")
  await assert.rejects(
    withSimulationFileLock(filePath, async () => "must-not-run"),
    /SIMULATION_STATE_LOCKED/
  )
}

test("partial cleanup failure leaves an uncertain lock and blocks reacquisition", async () => {
  await withFixture(async (filePath) => {
    await assert.rejects(
      withSimulationFileLock(filePath, async () => {
        await leaveUnexpectedFile(filePath)
        return "operation-succeeded"
      }),
      (error: unknown) =>
        error instanceof Error &&
        ("code" in error && (error.code === "ENOTEMPTY" || error.code === "EEXIST"))
    )
    await assertFailClosed(filePath)
  })
})

test("operation error and partial cleanup error are both reported without unlocking", async () => {
  await withFixture(async (filePath) => {
    const operationError = new Error("SIMULATED_OPERATION_FAILURE")
    await assert.rejects(
      withSimulationFileLock(filePath, async () => {
        await leaveUnexpectedFile(filePath)
        throw operationError
      }),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError)
        assert.equal(error.message, "SIMULATION_OPERATION_AND_CLEANUP_FAILED")
        assert.equal(error.errors[0], operationError)
        assert.ok(error.errors[1] instanceof Error)
        assert.ok(
          "code" in error.errors[1] &&
          (error.errors[1].code === "ENOTEMPTY" || error.errors[1].code === "EEXIST")
        )
        return true
      }
    )
    await assertFailClosed(filePath)
  })
})
