import assert from "node:assert/strict"
import test from "node:test"

import {
  notifyMaxAttentionWindows,
} from "../../src/private-alpha/windows-toast-notifier"
import type {
  MaxAttentionDecisionTicket,
} from "../../src/private-alpha/max-attention-decision-ticket"

function ticket(
  index = 1,
  symbol = "TEST"
): MaxAttentionDecisionTicket {
  return {
    schemaVersion: 1,
    ticketId: `max-ticket:candidate-${index}`,
    candidateId: `candidate-${index}`,
    generatedAt: "2026-09-17T03:00:00.000Z",
    triggeredAt: "2026-09-17T02:59:00.000Z",
    trigger: index % 2 === 0 ? "REAPPEARED" : "NEW",
    status: "ROUTE_CONFIRMED",
    identity: {
      identityKey:
        "solana:6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx",
      network: "solana",
      contractAddress:
        "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx",
      symbol,
      name: "Test",
    },
    attention: {
      latestPosition: index,
      bestPosition: 1,
      appearanceCount: 1,
      firstSeenAt: "2026-09-17T02:59:00.000Z",
      lastSeenAt: "2026-09-17T02:59:00.000Z",
    },
    humanReview: {
      state: "PENDING_REVIEW",
      stateUpdatedAt: "2026-09-17T02:59:00.000Z",
      dismissalReason: null,
      required: true,
    },
    onchain: {
      status: "VERIFIED_ONCHAIN",
      tokenProgram: "TOKEN",
      decimals: 6,
      supplyRaw: "123456",
      mintAuthority: null,
      freezeAuthority: null,
    },
    route: {
      status: "ROUTE_AVAILABLE",
      diagnosticInputLamports: "10000000",
      outputAmountBaseUnits: "2500000",
      routeId: "jupiter:Meteora",
      venueIds: ["market"],
    },
    riskFlags: [],
    caveats: [],
    successProbability: null,
    investmentRecommendation: null,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }
}

test("does nothing when there are no changed decision tickets", async () => {
  let calls = 0
  const result = await notifyMaxAttentionWindows({
    tickets: [],
    platform: "win32",
    executor: async () => {
      calls += 1
    },
  })

  assert.equal(result.status, "SKIPPED_EMPTY")
  assert.equal(result.sentCount, 0)
  assert.equal(calls, 0)
})

test("does not attempt Windows notification on another platform", async () => {
  let calls = 0
  const result = await notifyMaxAttentionWindows({
    tickets: [ticket()],
    platform: "linux",
    executor: async () => {
      calls += 1
    },
  })

  assert.equal(result.status, "SKIPPED_UNSUPPORTED")
  assert.equal(calls, 0)
})

test("uses PowerShell without putting ticket text in command arguments", async () => {
  const calls: Array<{
    executable: string
    args: ReadonlyArray<string>
    env: NodeJS.ProcessEnv
  }> = []
  const hostileSymbol = "A<&\"'; Write-Error hacked"
  const result = await notifyMaxAttentionWindows({
    tickets: [ticket(1, hostileSymbol)],
    platform: "win32",
    env: { SAFE_BASE: "yes" },
    executor: async input => {
      calls.push(input)
    },
  })

  assert.equal(result.status, "SENT")
  assert.equal(result.sentCount, 1)
  assert.equal(calls[0]?.executable, "powershell.exe")
  assert.ok(calls[0]?.args.includes("-EncodedCommand"))
  assert.equal(calls[0]?.args.join(" ").includes(hostileSymbol), false)
  assert.equal(calls[0]?.env.SAFE_BASE, "yes")
  const payload = JSON.parse(
    Buffer.from(
      calls[0]?.env.PONDOX_TOAST_PAYLOAD ?? "",
      "base64"
    ).toString("utf8")
  )
  assert.ok(payload.title.includes(hostileSymbol))
  assert.ok(payload.line1.includes("ROUTE_CONFIRMED"))
  assert.ok(payload.line2.includes("jupiter:Meteora"))
})

test("bounds a burst to three native notifications", async () => {
  let calls = 0
  const result = await notifyMaxAttentionWindows({
    tickets: [ticket(1), ticket(2), ticket(3), ticket(4)],
    platform: "win32",
    executor: async () => {
      calls += 1
    },
  })

  assert.equal(result.status, "SENT")
  assert.equal(result.sentCount, 3)
  assert.equal(calls, 3)
})
