import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMaxAttentionDecisionTicket,
} from "../../src/private-alpha/max-attention-decision-ticket"
import type {
  MaxAttentionInboxCandidate,
} from "../../src/private-alpha/max-attention-inbox-repository"
import type {
  MaxAttentionOnchainEntry,
} from "../../src/private-alpha/max-attention-onchain-repository"
import type {
  MaxAttentionJupiterEntry,
} from "../../src/private-alpha/max-attention-jupiter-repository"

const MINT = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx"
const IDENTITY = `solana:${MINT}`
const CANDIDATE_ID =
  `max-attention:2026-09-17T02:00:00.000Z:${IDENTITY}`

function candidate(
  overrides: Partial<MaxAttentionInboxCandidate> = {}
): MaxAttentionInboxCandidate {
  return {
    identityKey: IDENTITY,
    network: "solana",
    contractAddress: MINT,
    symbol: "TEST",
    name: "Test Token",
    firstSeenAt: "2026-09-17T02:00:00.000Z",
    lastSeenAt: "2026-09-17T02:00:00.000Z",
    firstAttentionAt: "2026-09-17T02:00:00.000Z",
    lastAttentionAt: "2026-09-17T02:00:00.000Z",
    appearanceCount: 1,
    newCount: 1,
    reappearedCount: 0,
    firstPosition: 2,
    latestPosition: 2,
    bestPosition: 2,
    state: "PENDING_REVIEW",
    stateUpdatedAt: "2026-09-17T02:00:00.000Z",
    dismissalReason: null,
    evidence: [{
      candidateId: CANDIDATE_ID,
      observedAt: "2026-09-17T02:00:00.000Z",
      trigger: "NEW",
      position: 2,
    }],
    requiresHumanDecision: true,
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    ...overrides,
  }
}

function onchain(
  status: MaxAttentionOnchainEntry["validation"]["status"] =
    "VERIFIED_ONCHAIN",
  overrides: Partial<MaxAttentionOnchainEntry> = {}
): MaxAttentionOnchainEntry {
  return {
    identityKey: IDENTITY,
    candidateId: CANDIDATE_ID,
    validatedAt: "2026-09-17T02:01:00.000Z",
    validation: {
      schemaVersion: 1,
      observedAt: "2026-09-17T02:01:00.000Z",
      network: "solana",
      mintAddress: MINT,
      status,
      rpcSlot: status === "VERIFIED_ONCHAIN" ? 100 : null,
      ownerProgram: status === "VERIFIED_ONCHAIN"
        ? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        : null,
      tokenProgram: status === "VERIFIED_ONCHAIN" ? "TOKEN" : null,
      executable: status === "VERIFIED_ONCHAIN" ? false : null,
      initialized: status === "VERIFIED_ONCHAIN" ? true : null,
      decimals: status === "VERIFIED_ONCHAIN" ? 6 : null,
      supplyRaw: status === "VERIFIED_ONCHAIN" ? "123456" : null,
      mintAuthority: null,
      freezeAuthority: null,
      accountAge: null,
      accountAgeReason: "UNAVAILABLE_FROM_MINT_ACCOUNT",
      consistency: status === "VERIFIED_ONCHAIN"
        ? "MATCHED"
        : "NOT_CHECKED",
      blockingReasons: status === "BLOCKED"
        ? ["SOLANA_MINT_ACCOUNT_INVALID"]
        : [],
      caveats: ["MINT_ACCOUNT_DOES_NOT_PREDICT_TOKEN_SUCCESS"],
      watchOnly: true,
      approvalGranted: false,
      transactionRequested: false,
      source: "SOLANA_RPC_MINT_VALIDATION",
    },
    ...overrides,
  }
}

function jupiter(
  status: MaxAttentionJupiterEntry["validation"]["status"] =
    "ROUTE_AVAILABLE",
  overrides: Partial<MaxAttentionJupiterEntry> = {}
): MaxAttentionJupiterEntry {
  return {
    identityKey: IDENTITY,
    candidateId: CANDIDATE_ID,
    validatedAt: "2026-09-17T02:02:00.000Z",
    validation: {
      schemaVersion: 1,
      observedAt: "2026-09-17T02:02:00.000Z",
      network: "solana",
      mintAddress: MINT,
      status,
      diagnosticInputLamports: "10000000",
      quote: status === "ROUTE_AVAILABLE" ? {
        routeId: "jupiter:Meteora",
        venueIds: ["market-address"],
        inputAmountBaseUnits: "10000000",
        outputAmountBaseUnits: "2500000",
        inputAmount: 0.01,
        outputAmount: 2.5,
        estimatedFeeUsd: 0,
      } : null,
      blockingReasons: status === "BLOCKED"
        ? ["JUPITER_ROUTE_IDENTITY_INVALID"]
        : [],
      caveats: ["PONDOX_EXECUTION_COSTS_ARE_NOT_INCLUDED"],
      watchOnly: true,
      approvalGranted: false,
      transactionRequested: false,
      source: "JUPITER_READ_ONLY_QUOTE",
    },
    ...overrides,
  }
}

test("creates an immediate early-review ticket before enrichment", () => {
  const ticket = buildMaxAttentionDecisionTicket({
    candidate: candidate(),
    now: () => new Date("2026-09-17T02:00:01.000Z"),
  })

  assert.equal(ticket.status, "EARLY_REVIEW")
  assert.equal(ticket.trigger, "NEW")
  assert.equal(ticket.identity.contractAddress, MINT)
  assert.equal(ticket.attention.latestPosition, 2)
  assert.equal(ticket.onchain.status, "PENDING")
  assert.equal(ticket.route.status, "PENDING")
  assert.ok(ticket.riskFlags.includes("ONCHAIN_VALIDATION_PENDING"))
  assert.equal(ticket.successProbability, null)
  assert.equal(ticket.investmentRecommendation, null)
  assert.equal(ticket.transactionRequested, false)
})

test("keeps incomplete direct evidence pending without requesting Jupiter", () => {
  const ticket = buildMaxAttentionDecisionTicket({
    candidate: candidate(),
    onchain: onchain("INCOMPLETE"),
  })

  assert.equal(ticket.status, "VALIDATION_PENDING")
  assert.equal(ticket.onchain.status, "INCOMPLETE")
  assert.equal(ticket.route.status, "PENDING")
  assert.ok(ticket.riskFlags.includes("ONCHAIN_EVIDENCE_INCOMPLETE"))
})

test("reports a confirmed diagnostic route without a buy recommendation", () => {
  const direct = onchain()
  direct.validation.mintAuthority =
    "11111111111111111111111111111111"
  const ticket = buildMaxAttentionDecisionTicket({
    candidate: candidate(),
    onchain: direct,
    jupiter: jupiter(),
  })

  assert.equal(ticket.status, "ROUTE_CONFIRMED")
  assert.equal(ticket.onchain.status, "VERIFIED_ONCHAIN")
  assert.equal(ticket.route.status, "ROUTE_AVAILABLE")
  assert.equal(ticket.route.routeId, "jupiter:Meteora")
  assert.deepEqual(ticket.route.venueIds, ["market-address"])
  assert.ok(ticket.riskFlags.includes("MINT_AUTHORITY_PRESENT"))
  assert.equal(ticket.investmentRecommendation, null)
})

test("distinguishes unavailable enrichment from a technical block", () => {
  const unavailable = buildMaxAttentionDecisionTicket({
    candidate: candidate(),
    onchain: onchain(),
    jupiter: jupiter("UNAVAILABLE"),
  })
  const blocked = buildMaxAttentionDecisionTicket({
    candidate: candidate(),
    onchain: onchain("BLOCKED"),
  })

  assert.equal(unavailable.status, "DATA_UNAVAILABLE")
  assert.ok(unavailable.riskFlags.includes("JUPITER_DATA_UNAVAILABLE"))
  assert.equal(blocked.status, "BLOCKED")
  assert.ok(blocked.riskFlags.includes("ONCHAIN_VALIDATION_BLOCKED"))
})

test("preserves a human dismissal as the highest-priority block", () => {
  const ticket = buildMaxAttentionDecisionTicket({
    candidate: candidate({
      state: "DISMISSED",
      stateUpdatedAt: "2026-09-17T02:03:00.000Z",
      dismissalReason: "Not aligned with strategy",
    }),
    onchain: onchain(),
    jupiter: jupiter(),
  })

  assert.equal(ticket.status, "BLOCKED")
  assert.equal(ticket.humanReview.state, "DISMISSED")
  assert.equal(
    ticket.humanReview.dismissalReason,
    "Not aligned with strategy"
  )
  assert.ok(ticket.riskFlags.includes("HUMAN_DISMISSED"))
})

test("rejects stale or ungrounded validation evidence", () => {
  assert.throws(
    () => buildMaxAttentionDecisionTicket({
      candidate: candidate(),
      onchain: onchain("VERIFIED_ONCHAIN", {
        candidateId: "stale-candidate",
      }),
    }),
    /stale or mismatched/
  )
  assert.throws(
    () => buildMaxAttentionDecisionTicket({
      candidate: candidate(),
      jupiter: jupiter(),
    }),
    /lacks verified on-chain basis/
  )
})
