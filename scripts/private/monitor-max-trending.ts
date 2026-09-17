import { setTimeout as delay } from "node:timers/promises"
import { resolve } from "node:path"

import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import {
  runAdaptiveMaxTrendingMonitor,
  type MaxTrendingMonitorCycle,
} from "../../src/private-alpha/max-trending-adaptive-monitor"
import {
  acquireMaxTrendingMonitorLock,
} from "../../src/private-alpha/max-trending-monitor-lock"
import {
  coordinateMaxTrendingOpportunityCycle,
  type MaxTrendingOpportunityCycleResult,
} from "../../src/private-alpha/max-trending-opportunity-cycle"
import {
  DEFAULT_SOLANA_RPC_URL,
} from "../../src/private-alpha/solana-mint-validator"
import {
  notifyMaxAttentionWindows,
} from "../../src/private-alpha/windows-toast-notifier"

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

function booleanFlag(value: string | undefined, name: string) {
  if (value === undefined || value.trim() === "") return false
  if (value.toLowerCase() === "true") return true
  if (value.toLowerCase() === "false") return false
  throw new Error(`${name} must be true or false`)
}

async function notifyCycle(
  cycle: MaxTrendingMonitorCycle,
  enabled: boolean
) {
  if (!enabled || !cycle.ok) return
  const result = cycle.result as MaxTrendingOpportunityCycleResult
  if (result.decisionTickets.length === 0) return

  try {
    const notification = await notifyMaxAttentionWindows({
      tickets: result.decisionTickets,
    })
    console.log(JSON.stringify({
      type: "MAX_ATTENTION_WINDOWS_NOTIFICATION",
      ...notification,
      ticketCount: result.decisionTickets.length,
      watchOnly: true,
      approvalGranted: false,
      transactionRequested: false,
    }))
  } catch (error) {
    console.error(JSON.stringify({
      type: "MAX_ATTENTION_WINDOWS_NOTIFICATION_ERROR",
      error: printableError(error),
      ticketCount: result.decisionTickets.length,
      observationContinues: true,
      watchOnly: true,
      approvalGranted: false,
      transactionRequested: false,
    }))
  }
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

  const result = cycle.result as MaxTrendingOpportunityCycleResult
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
    context: {
      moved: result.opportunity.context.moved.map(change => ({
        symbol: change.asset.symbol,
        identityKey: change.identityKey,
        previousPosition: change.previousPosition,
        currentPosition: change.currentPosition,
      })),
      removed: result.opportunity.context.removed.map(change => ({
        symbol: change.asset.symbol,
        identityKey: change.identityKey,
        previousPosition: change.previousPosition,
      })),
    },
    attentionInbox: result.attentionInbox,
    onchainValidation: result.onchainValidation,
    jupiterValidation: result.jupiterValidation,
    communityResponse: result.communityResponse,
    decisionTickets: result.decisionTickets.map(ticket => ({
      ticketId: ticket.ticketId,
      status: ticket.status,
      trigger: ticket.trigger,
      symbol: ticket.identity.symbol,
      identityKey: ticket.identity.identityKey,
      position: ticket.attention.latestPosition,
      humanReviewState: ticket.humanReview.state,
      onchainStatus: ticket.onchain.status,
      routeStatus: ticket.route.status,
      diagnosticInputLamports:
        ticket.route.diagnosticInputLamports,
      outputAmountBaseUnits:
        ticket.route.outputAmountBaseUnits,
      routeId: ticket.route.routeId,
      venueIds: ticket.route.venueIds,
      riskFlags: ticket.riskFlags,
      successProbability: ticket.successProbability,
      investmentRecommendation:
        ticket.investmentRecommendation,
      requiresHumanDecision: ticket.humanReview.required,
    })),
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
  const onchainLedgerPath = resolve(
    dataDirectory,
    "max-attention-onchain.json"
  )
  const jupiterLedgerPath = resolve(
    dataDirectory,
    "max-attention-jupiter.json"
  )
  const communityResponseLedgerPath = resolve(
    dataDirectory,
    "max-community-response.json"
  )
  const windowsToastEnabled = booleanFlag(
    process.env.MAX_ATTENTION_WINDOWS_TOAST,
    "MAX_ATTENTION_WINDOWS_TOAST"
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
    const onchainStore = new PrivateFileLedgerStore(
      onchainLedgerPath
    )
    const jupiterStore = new PrivateFileLedgerStore(
      jupiterLedgerPath
    )
    const communityResponseStore = new PrivateFileLedgerStore(
      communityResponseLedgerPath
    )
    const summary = await runAdaptiveMaxTrendingMonitor({
      observe: () => coordinateMaxTrendingOpportunityCycle({
        observationStore,
        attentionInboxStore,
        onchainStore,
        jupiterStore,
        communityResponseStore,
        rpcUrl:
          process.env.SOLANA_RPC_URL ??
          DEFAULT_SOLANA_RPC_URL,
        diagnosticInputLamports:
          process.env.MAX_JUPITER_DIAGNOSTIC_INPUT_LAMPORTS,
        jupiterApiKey: process.env.JUPITER_API_KEY,
      }),
      wait: async (milliseconds, signal) => {
        await delay(milliseconds, undefined, { signal })
      },
      signal: controller.signal,
      maxCycles: optionalPositiveInteger(
        process.env.MAX_TRENDING_MONITOR_MAX_CYCLES
      ),
      onCycle: async cycle => {
        printCycle(cycle)
        await notifyCycle(cycle, windowsToastEnabled)
      },
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
