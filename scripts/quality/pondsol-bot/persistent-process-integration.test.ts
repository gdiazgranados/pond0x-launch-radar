
import assert from "node:assert/strict"
import { test } from "node:test"
import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { PersistentPositionEngine } from "../../../src/private-alpha/pondsol-bot/persistent-position-engine"
import { loadSimulationState } from "../../../src/private-alpha/pondsol-bot/simulation-persistence"
import { calculateCapitalSnapshot } from "../../../src/private-alpha/pondsol-bot/capital-accounting"

type WorkerResult = {
  status: string
  tradeId?: string
  error?: string
}

function runWorker(
  filePath: string,
  tradeId: string
): Promise<WorkerResult> {
  return new Promise((resolveResult, rejectResult) => {
    const workerPath = resolve(
      "scripts/quality/pondsol-bot/persistent-process-worker.mjs"
    )

    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        workerPath,
        filePath,
        tradeId,
        "2026-10-07T20:05:00.000Z",
      ],
      {
        cwd: process.cwd(),
        windowsHide: true,
      }
    )

    let stdout = ""
    let stderr = ""

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })

    child.on("error", rejectResult)

    child.on("close", (code) => {
      try {
        const lines = stdout.trim().split(/\r?\n/)
        const result = JSON.parse(
          lines[lines.length - 1]
        ) as WorkerResult

        if (code !== 0 && code !== 2) {
          throw new Error(
            `WORKER_FAILED:${code}:${stderr}`
          )
        }

        resolveResult(result)
      } catch (error) {
        rejectResult(error)
      }
    })
  })
}

test("two Node processes cannot overwrite the same simulated position", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pondsol-process-")
  )

  const filePath = join(directory, "state.json")

  try {
    await PersistentPositionEngine.initialize(
      filePath,
      new Date("2026-10-07T20:00:00.000Z")
    )

    const results = await Promise.all([
      runWorker(filePath, "process-a-001"),
      runWorker(filePath, "process-b-001"),
    ])

    const accepted = results.filter(
      (result) => result.status === "ACCEPTED"
    )

    const rejected = results.filter(
      (result) => result.status === "REJECTED"
    )

    assert.equal(
      accepted.length,
      1,
      JSON.stringify(results)
    )

    assert.equal(
      rejected.length,
      1,
      JSON.stringify(results)
    )

    assert.match(
      rejected[0].error ?? "",
      /SIMULATION_STATE_CONFLICT|SIMULATION_STATE_LOCKED|TRADE_BLOCKED/
    )

    const state = await loadSimulationState(filePath)

    assert.equal(
      state.positions.openPosition?.tradeId,
      accepted[0].tradeId
    )

    assert.equal(
      state.positions.openPosition?.investedCents,
      1000
    )

    const capital = calculateCapitalSnapshot(
  state.ledger,
  state.positions
)

assert.equal(
  capital.availableCapitalCents,
  4000
)
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    })
  }
})
