import {
  notifyMaxAttentionWindows,
} from "../../src/private-alpha/windows-toast-notifier"
import type {
  MaxAttentionDecisionTicket,
} from "../../src/private-alpha/max-attention-decision-ticket"

const ticket: MaxAttentionDecisionTicket = {
  schemaVersion: 1,
  ticketId: "max-ticket:manual-windows-test",
  candidateId: "manual-windows-test",
  generatedAt: new Date().toISOString(),
  triggeredAt: new Date().toISOString(),
  trigger: "NEW",
  status: "EARLY_REVIEW",
  identity: {
    identityKey: "solana:manual-windows-test",
    network: "solana",
    contractAddress: "manual-windows-test",
    symbol: "TEST",
    name: "Pond0x MAX notification test",
  },
  attention: {
    latestPosition: 1,
    bestPosition: 1,
    appearanceCount: 1,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  },
  humanReview: {
    state: "PENDING_REVIEW",
    stateUpdatedAt: new Date().toISOString(),
    dismissalReason: null,
    required: true,
  },
  onchain: {
    status: "PENDING",
    tokenProgram: null,
    decimals: null,
    supplyRaw: null,
    mintAuthority: null,
    freezeAuthority: null,
  },
  route: {
    status: "PENDING",
    diagnosticInputLamports: null,
    outputAmountBaseUnits: null,
    routeId: null,
    venueIds: [],
  },
  riskFlags: ["MANUAL_TEST_ONLY"],
  caveats: ["THIS_IS_NOT_A_REAL_TOKEN_SIGNAL"],
  successProbability: null,
  investmentRecommendation: null,
  watchOnly: true,
  approvalGranted: false,
  transactionRequested: false,
}

async function main() {
  const result = await notifyMaxAttentionWindows({
    tickets: [ticket],
  })

  console.log(JSON.stringify({
    type: "MAX_ATTENTION_WINDOWS_TOAST_TEST",
    ...result,
    simulatedSignal: true,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
