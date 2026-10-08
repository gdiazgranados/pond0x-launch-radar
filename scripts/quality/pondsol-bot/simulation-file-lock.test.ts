
import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  diagnoseSimulationLock,
  inspectSimulationLock,
  withSimulationFileLock,
} from "../../../src/private-alpha/pondsol-bot/simulation-file-lock"

test("records lock ownership metadata", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-owner-")
  )
  const filePath = join(directory, "state.json")

  try {
    await withSimulationFileLock(filePath, async () => {
      const owner = await inspectSimulationLock(filePath)

      assert.ok(owner)
      assert.equal(owner.version, 1)
      assert.equal(owner.pid, process.pid)
      assert.ok(owner.hostname.length > 0)
      assert.ok(owner.lockId.length > 0)
      assert.ok(
        Number.isFinite(Date.parse(owner.acquiredAtUtc))
      )
    })

    assert.equal(
      await inspectSimulationLock(filePath),
      null
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects concurrent lock acquisition", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-concurrent-")
  )
  const filePath = join(directory, "state.json")

  try {
    await withSimulationFileLock(filePath, async () => {
      await assert.rejects(
        withSimulationFileLock(filePath, async () => {}),
        /SIMULATION_STATE_LOCKED/
      )
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("preserves lock when ownership changes", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-ownership-")
  )
  const filePath = join(directory, "state.json")
  const ownerPath = `${filePath}.lock/owner.json`

  try {
    await assert.rejects(
      withSimulationFileLock(filePath, async () => {
        const owner = await inspectSimulationLock(filePath)

        assert.ok(owner)

        await import("node:fs/promises").then(
          ({ writeFile }) =>
            writeFile(
              ownerPath,
              JSON.stringify({
                ...owner,
                lockId: "different-owner",
              })
            )
        )
      }),
      /SIMULATION_LOCK_OWNERSHIP_LOST/
    )

    const contents = await readFile(ownerPath, "utf8")
    const owner = JSON.parse(contents)

    assert.equal(owner.lockId, "different-owner")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("releases owned lock after operation failure", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-operation-failure-")
  )
  const filePath = join(directory, "state.json")

  try {
    await assert.rejects(
      withSimulationFileLock(filePath, async () => {
        throw new Error("SIMULATED_OPERATION_FAILURE")
      }),
      /SIMULATED_OPERATION_FAILURE/
    )

    assert.equal(
      await inspectSimulationLock(filePath),
      null
    )

    await withSimulationFileLock(filePath, async () => {
      assert.ok(await inspectSimulationLock(filePath))
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("preserves orphaned locks without automatic recovery", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-orphan-")
  )

  const filePath = join(directory, "state.json")
  const lockPath = `${filePath}.lock`

  try {
    const { mkdir } = await import("node:fs/promises")

    // Simulate a crash that left a lock directory
    // without ownership metadata.
    await mkdir(lockPath)

    assert.equal(
      await inspectSimulationLock(filePath),
      null
    )

    await assert.rejects(
      withSimulationFileLock(filePath, async () => {}),
      /SIMULATION_STATE_LOCKED/
    )

    // The orphaned lock must remain untouched.
    const { stat } = await import("node:fs/promises")

    assert.ok((await stat(lockPath)).isDirectory())
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})
test("identifies unlocked and active locks", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-diagnosis-")
  )
  const filePath = join(directory, "state.json")

  try {
    assert.equal(
      await diagnoseSimulationLock(filePath),
      "UNLOCKED"
    )

    await withSimulationFileLock(filePath, async () => {
      assert.equal(
        await diagnoseSimulationLock(filePath),
        "ACTIVE"
      )
    })

    assert.equal(
      await diagnoseSimulationLock(filePath),
      "UNLOCKED"
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("classifies missing and uncertain lock owners safely", async () => {
  const { mkdir, writeFile, stat } =
    await import("node:fs/promises")
  const { hostname } = await import("node:os")

  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-lock-diagnosis-")
  )
  const filePath = join(directory, "state.json")
  const lockPath = `${filePath}.lock`

  try {
    await mkdir(lockPath)

    // A lock without metadata must be treated as unknown.
    assert.equal(
      await diagnoseSimulationLock(filePath),
      "UNKNOWN"
    )

    const ownerPath = join(lockPath, "owner.json")

    await writeFile(
      ownerPath,
      JSON.stringify({
        version: 1,
        pid: process.pid,
        hostname: "different-host",
        lockId: "remote-owner",
        acquiredAtUtc: new Date().toISOString(),
      })
    )

    assert.equal(
      await diagnoseSimulationLock(filePath),
      "UNKNOWN"
    )

    // A nonexistent PID is only a candidate for recovery.
    // The test probes for an unused PID without assuming
    // that a particular numeric PID is always available.
    let missingPid: number | undefined

    for (const candidate of [2147483647, 2147483646]) {
      try {
        process.kill(candidate, 0)
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ESRCH"
        ) {
          missingPid = candidate
          break
        }
      }
    }

    assert.ok(
      missingPid !== undefined,
      "NO_CONFIRMED_MISSING_PID"
    )

    await writeFile(
      ownerPath,
      JSON.stringify({
        version: 1,
        pid: missingPid,
        hostname: hostname(),
        lockId: "orphan-candidate",
        acquiredAtUtc: new Date().toISOString(),
      })
    )

    assert.equal(
      await diagnoseSimulationLock(filePath),
      "ORPHAN_CANDIDATE"
    )

    // Diagnosis must never remove the lock.
    assert.ok((await stat(lockPath)).isDirectory())
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})

test("rejects corrupted lock metadata without deleting the lock", async () => {
  const { mkdir, writeFile, stat } =
    await import("node:fs/promises")

  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-corrupt-lock-")
  )

  const filePath = join(directory, "state.json")
  const lockPath = `${filePath}.lock`

  try {
    await mkdir(lockPath)

    await writeFile(
      join(lockPath, "owner.json"),
      "{invalid-json"
    )

    assert.equal(
      await diagnoseSimulationLock(filePath),
      "UNKNOWN"
    )

    await assert.rejects(
      withSimulationFileLock(filePath, async () => {}),
      /SIMULATION_STATE_LOCKED/
    )

    assert.ok((await stat(lockPath)).isDirectory())
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})

test("does not delete a lock replaced during an operation", async () => {
  const { readFile, writeFile, stat } =
    await import("node:fs/promises")

  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-replaced-lock-")
  )

  const filePath = join(directory, "state.json")
  const lockPath = `${filePath}.lock`
  const ownerPath = join(lockPath, "owner.json")

  try {
    await assert.rejects(
      withSimulationFileLock(filePath, async () => {
        const owner = JSON.parse(
          await readFile(ownerPath, "utf8")
        )

        await writeFile(
          ownerPath,
          JSON.stringify({
            ...owner,
            lockId: "replacement-owner",
          })
        )
      }),
      /SIMULATION_LOCK_OWNERSHIP_LOST/
    )

    assert.ok((await stat(lockPath)).isDirectory())

    const owner = JSON.parse(
      await readFile(ownerPath, "utf8")
    )

    assert.equal(owner.lockId, "replacement-owner")

    await assert.rejects(
      withSimulationFileLock(filePath, async () => {}),
      /SIMULATION_STATE_LOCKED/
    )
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})


test("preserves both operation and cleanup errors", async () => {
  const { writeFile, stat } =
    await import("node:fs/promises")

  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-double-failure-")
  )

  const filePath = join(directory, "state.json")
  const lockPath = `${filePath}.lock`
  const ownerPath = join(lockPath, "owner.json")

  try {
    await assert.rejects(
      withSimulationFileLock(filePath, async () => {
        const owner = await inspectSimulationLock(filePath)

        assert.ok(owner)

        await writeFile(
          ownerPath,
          JSON.stringify({
            ...owner,
            lockId: "unexpected-owner",
          })
        )

        throw new Error("ORIGINAL_OPERATION_FAILURE")
      }),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError)

        assert.equal(
          error.message,
          "SIMULATION_OPERATION_AND_CLEANUP_FAILED"
        )

        assert.equal(error.errors.length, 2)

        assert.match(
          String(error.errors[0]),
          /ORIGINAL_OPERATION_FAILURE/
        )

        assert.match(
          String(error.errors[1]),
          /SIMULATION_LOCK_OWNERSHIP_LOST/
        )

        return true
      }
    )

    // Ownership changed: the lock must remain intact.
    assert.ok((await stat(lockPath)).isDirectory())
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})
