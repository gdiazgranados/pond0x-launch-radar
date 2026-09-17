import { setTimeout as delay } from "node:timers/promises"
import { resolve } from "node:path"

import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import {
  runAdaptiveMaxTrendingMonitor,
  type MaxTrendingMonitorCycle,
} from "../../src/private-alpha/max-trending-adaptive-monitor"
import {
  coordinateMaxTrendingAttentionObservation,
  type MaxTrendingAttentionObservationResult,
} from "../../src/private-alpha/max-trending-attention-coordinator"
import {
  acquireMaxTrendingMonitorLock,
} from "../../src/private-alpha/max-trending-monitor-lock"

function optionalPositiveInteger(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      "MAX_TRENDING_MONITOR_MAX_CYCLES must be a positive integer"
    )
  }
  return parsed
}

function printableError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function printCycle(cycle: MaxTrendingMonitorCycle) {
  if (!cycle.ok) {
    console.log(JSON.stringify({
      cycle: cycle.cycle,
      ok: false,
      mode: cycle.mode,
      error: printableError(cycle.error),
      nextDelaySeconds: cycle.nextDelayMs === null
        ? null
        : cycle.nextDelayMs / 1_000,
    }))
    return
  }

  const result = cycle.result as MaxTrendingAttentionObservationResult
  console.log(JSON.stringify({
    cycle: cycle.cycle,
    ok: true,
    observedAt: result.observedAt,
    observationStatus: result.status,
    ledgerRevision: result.ledgerRevision,
    opportunityStatus: result.opportunity.status,
    candidates: result.opportunity.candidates.map(candidate => ({
      trigger: candidate.trigger,
      symbol: candidate.symbol,
      identityKey: candidate.identityKey,
      position: candidate.position,
      priority: candidate.priority,
    })),
    attentionInbox: result.attentionInbox,
    mode: cycle.mode,
    nextDelaySeconds: cycle.nextDelayMs === null
      ? null
      : cycle.nextDelayMs / 1_000,
    watchOnly: result.watchOnly,
    approvalGranted: result.approvalGranted,
    transactionRequested: result.transactionRequested,
  }))
}

async function main() {
  const dataDirectory = resolve(
    process.env.MAX_TRENDING_DATA_DIR ??
      process.env.SHADOW_DATA_DIR ??
      "private-data"
  )
  const observationLedgerPath = resolve(
    dataDirectory,
    "max-trending-ledger.json"
  )
  const attentionInboxPath = resolve(
    dataDirectory,
    "max-attention-inbox.json"
  )
  const lock = await acquireMaxTrendingMonitorLock({
    path: resolve(dataDirectory, "max-trending-monitor.lock"),
  })
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)

  try {
    const observationStore = new PrivateFileLedgerStore(
      observationLedgerPath
    )
    const attentionInboxStore = new PrivateFileLedgerStore(
      attentionInboxPath
    )
    const summary = await runAdaptiveMaxTrendingMonitor({
      observe: () => coordinateMaxTrendingAttentionObservation({
        observationStore,
        attentionInboxStore,
      }),
      wait: async (milliseconds, signal) => {
        await delay(milliseconds, undefined, { signal })
      },
      signal: controller.signal,
      maxCycles: optionalPositiveInteger(
        process.env.MAX_TRENDING_MONITOR_MAX_CYCLES
      ),
      onCycle: printCycle,
    })
    console.log(JSON.stringify({
      type: "MAX_TRENDING_MONITOR_SUMMARY",
      ...summary,
      watchOnly: true,
      approvalGranted: false,
      transactionRequested: false,
    }))
  } finally {
    process.removeListener("SIGINT", stop)
    process.removeListener("SIGTERM", stop)
    await lock.release()
  }
}

main().catch(error => {
  console.error(printableError(error))
  process.exitCode = 1
})
