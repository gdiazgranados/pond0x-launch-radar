import assert from "node:assert/strict"
import test from "node:test"

import {
  runAdaptiveMaxTrendingMonitor,
  type MaxTrendingMonitorCycle,
} from "../../src/private-alpha/max-trending-adaptive-monitor"
import type {
  MaxTrendingObservationResult,
} from "../../src/private-alpha/max-trending-observation-coordinator"

function observation(
  status: "EARLY_ATTENTION" | "CONTEXT_ONLY" | "NO_CHANGE"
): MaxTrendingObservationResult {
  const observedAt = "2026-09-17T00:00:00.000Z"
  return {
    schemaVersion: 1,
    observedAt,
    rawSnapshot: {
      schemaVersion: 1,
      observedAt,
      status: "EMPTY",
      query: {
        q: "",
        verified: false,
        network: "all",
      },
      tokenCount: 0,
      trending: [],
      watchOnly: true,
      approvalGranted: false,
      transactionRequested: false,
      source: "PONDOX_MAX_SEARCH",
    },
    status: status === "NO_CHANGE" ? "UNCHANGED" : "MATERIAL_CHANGE",
    persisted: true,
    ledgerRevision: 1,
    observationStats: {
      totalCount: 1,
      baselineCount: 0,
      materialCount: status === "NO_CHANGE" ? 0 : 1,
      unchangedCount: status === "NO_CHANGE" ? 1 : 0,
      emptyCount: 0,
      lastUnchangedAt: status === "NO_CHANGE" ? observedAt : null,
      lastEmptyAt: null,
    },
    snapshotHash: "snapshot",
    opportunity: {
      schemaVersion: 1,
      observedAt,
      status,
      candidates: [],
      context: { moved: [], removed: [] },
      fastFollowUp: {
        recommended: status === "EARLY_ATTENTION",
        afterSeconds: status === "EARLY_ATTENTION" ? 10 : null,
      },
      watchOnly: true,
      approvalGranted: false,
      transactionRequested: false,
    },
    event: null,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

test("uses the normal thirty-second cadence without an early candidate", async () => {
  const waits: number[] = []
  const cycles: MaxTrendingMonitorCycle[] = []

  const summary = await runAdaptiveMaxTrendingMonitor({
    observe: async () => observation("NO_CHANGE"),
    wait: async milliseconds => {
      waits.push(milliseconds)
    },
    maxCycles: 3,
    onCycle: cycle => {
      cycles.push(cycle)
    },
  })

  assert.deepEqual(waits, [30_000, 30_000])
  assert.deepEqual(cycles.map(cycle => cycle.mode), [
    "NORMAL",
    "NORMAL",
    "NORMAL",
  ])
  assert.deepEqual(summary, {
    cycles: 3,
    successfulCycles: 3,
    failedCycles: 0,
    stoppedBySignal: false,
  })
})

test("uses a ten-second cadence for the default two-minute fast window", async () => {
  let clock = 0
  const waits: number[] = []
  const modes: string[] = []

  await runAdaptiveMaxTrendingMonitor({
    observe: async () => observation("EARLY_ATTENTION"),
    wait: async milliseconds => {
      waits.push(milliseconds)
      clock += milliseconds
    },
    now: () => clock,
    maxCycles: 13,
    onCycle: cycle => {
      modes.push(cycle.mode)
    },
  })

  assert.deepEqual(waits, Array(12).fill(10_000))
  assert.deepEqual(modes, [
    ...Array(12).fill("FAST"),
    "NORMAL",
  ])
})

test("caps repeated early signals to one non-renewable fast window", async () => {
  let clock = 0
  const waits: number[] = []
  const modes: string[] = []

  await runAdaptiveMaxTrendingMonitor({
    observe: async () => observation("EARLY_ATTENTION"),
    wait: async milliseconds => {
      waits.push(milliseconds)
      clock += milliseconds
    },
    now: () => clock,
    maxCycles: 4,
    normalIntervalMs: 100,
    fastIntervalMs: 25,
    fastWindowMs: 75,
    onCycle: cycle => {
      modes.push(cycle.mode)
    },
  })

  assert.deepEqual(waits, [25, 25, 25])
  assert.deepEqual(modes, ["FAST", "FAST", "FAST", "NORMAL"])
})

test("backs off exponentially and resets after a successful cycle", async () => {
  const waits: number[] = []
  const outcomes = ["error", "error", "success", "error", "success"]

  const summary = await runAdaptiveMaxTrendingMonitor({
    observe: async () => {
      const outcome = outcomes.shift()
      if (outcome === "error") throw new Error("temporary failure")
      return observation("NO_CHANGE")
    },
    wait: async milliseconds => {
      waits.push(milliseconds)
    },
    maxCycles: 5,
    normalIntervalMs: 100,
    fastIntervalMs: 25,
    errorBackoffMs: 50,
    maximumErrorBackoffMs: 200,
  })

  assert.deepEqual(waits, [50, 100, 100, 50])
  assert.equal(summary.successfulCycles, 2)
  assert.equal(summary.failedCycles, 3)
})

test("stops cleanly when the abort signal interrupts a wait", async () => {
  const controller = new AbortController()

  const summary = await runAdaptiveMaxTrendingMonitor({
    observe: async () => observation("NO_CHANGE"),
    wait: async () => {
      controller.abort()
      throw new DOMException("aborted", "AbortError")
    },
    signal: controller.signal,
  })

  assert.deepEqual(summary, {
    cycles: 1,
    successfulCycles: 1,
    failedCycles: 0,
    stoppedBySignal: true,
  })
})

test("rejects unsafe interval policies before observing", async () => {
  let observed = false

  await assert.rejects(
    runAdaptiveMaxTrendingMonitor({
      observe: async () => {
        observed = true
        return observation("NO_CHANGE")
      },
      wait: async () => undefined,
      maxCycles: 1,
      normalIntervalMs: 30,
      fastIntervalMs: 30,
    }),
    /invalid MAX monitor interval policy/
  )
  assert.equal(observed, false)
})
