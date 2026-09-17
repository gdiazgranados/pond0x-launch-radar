import type {
  MaxTrendingObservationResult,
} from "./max-trending-observation-coordinator"

export type MaxTrendingMonitorCycle =
  | {
      cycle: number
      ok: true
      result: MaxTrendingObservationResult
      mode: "NORMAL" | "FAST"
      nextDelayMs: number | null
    }
  | {
      cycle: number
      ok: false
      error: unknown
      mode: "BACKOFF"
      nextDelayMs: number | null
    }

export type MaxTrendingMonitorSummary = {
  cycles: number
  successfulCycles: number
  failedCycles: number
  stoppedBySignal: boolean
}

type Wait = (milliseconds: number, signal?: AbortSignal) => Promise<void>

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

export async function runAdaptiveMaxTrendingMonitor(input: {
  observe: () => Promise<MaxTrendingObservationResult>
  wait: Wait
  now?: () => number
  signal?: AbortSignal
  onCycle?: (cycle: MaxTrendingMonitorCycle) => void | Promise<void>
  maxCycles?: number
  normalIntervalMs?: number
  fastIntervalMs?: number
  fastWindowMs?: number
  errorBackoffMs?: number
  maximumErrorBackoffMs?: number
}): Promise<MaxTrendingMonitorSummary> {
  const now = input.now ?? Date.now
  const maxCycles = input.maxCycles === undefined
    ? Number.MAX_SAFE_INTEGER
    : positiveInteger(input.maxCycles, "maxCycles")
  const normalIntervalMs = positiveInteger(
    input.normalIntervalMs ?? 120_000,
    "normalIntervalMs"
  )
  const fastIntervalMs = positiveInteger(
    input.fastIntervalMs ?? 30_000,
    "fastIntervalMs"
  )
  const fastWindowMs = positiveInteger(
    input.fastWindowMs ?? 300_000,
    "fastWindowMs"
  )
  const errorBackoffMs = positiveInteger(
    input.errorBackoffMs ?? 120_000,
    "errorBackoffMs"
  )
  const maximumErrorBackoffMs = positiveInteger(
    input.maximumErrorBackoffMs ?? 600_000,
    "maximumErrorBackoffMs"
  )
  if (
    fastIntervalMs >= normalIntervalMs ||
    errorBackoffMs > maximumErrorBackoffMs
  ) {
    throw new Error("invalid MAX monitor interval policy")
  }

  let cycles = 0
  let successfulCycles = 0
  let failedCycles = 0
  let consecutiveFailures = 0
  let fastUntil: number | null = null

  while (cycles < maxCycles && !input.signal?.aborted) {
    cycles += 1
    let cycle: MaxTrendingMonitorCycle

    try {
      const result = await input.observe()
      successfulCycles += 1
      consecutiveFailures = 0
      const observedNow = now()
      if (
        result.opportunity.status === "EARLY_ATTENTION" &&
        (fastUntil === null || observedNow >= fastUntil)
      ) {
        fastUntil = observedNow + fastWindowMs
      }
      if (fastUntil !== null && observedNow >= fastUntil) {
        fastUntil = null
      }
      const mode = fastUntil === null ? "NORMAL" : "FAST"
      cycle = {
        cycle: cycles,
        ok: true,
        result,
        mode,
        nextDelayMs: cycles === maxCycles
          ? null
          : mode === "FAST"
            ? fastIntervalMs
            : normalIntervalMs,
      }
    } catch (error) {
      failedCycles += 1
      consecutiveFailures += 1
      const delay = Math.min(
        errorBackoffMs * 2 ** (consecutiveFailures - 1),
        maximumErrorBackoffMs
      )
      cycle = {
        cycle: cycles,
        ok: false,
        error,
        mode: "BACKOFF",
        nextDelayMs: cycles === maxCycles ? null : delay,
      }
    }

    await input.onCycle?.(cycle)
    if (cycle.nextDelayMs === null || input.signal?.aborted) break

    try {
      await input.wait(cycle.nextDelayMs, input.signal)
    } catch (error) {
      if (input.signal?.aborted) break
      throw error
    }
  }

  return {
    cycles,
    successfulCycles,
    failedCycles,
    stoppedBySignal: input.signal?.aborted ?? false,
  }
}
