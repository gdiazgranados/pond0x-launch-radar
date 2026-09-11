import test from "node:test"
import assert from "node:assert/strict"
import {
  evaluatePond0xProtectedTransaction,
} from "../../src/private-alpha/pond0x-protected-transaction-guard"
import type {
  Pond0xProtectedCampaign,
  Pond0xProtectedTransaction,
} from "../../src/private-alpha/pond0x-protected-transaction-guard"
import {
  PONDOX_REFERRAL_ACCOUNT,
} from "../../src/private-alpha/pond0x-referral-vault-observer"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

const DEDICATED_WALLET =
  "DedicatedPond0xWallet1111111111111111111111111"

function campaign(
  overrides: Partial<Pond0xProtectedCampaign> = {}
): Pond0xProtectedCampaign {
  return {
    campaignId: "campaign-2026-09-11-001",
    dedicatedWallet: DEDICATED_WALLET,
    fundedUsdCents: 10_000,
    capitalAtRiskUsdCents: 1_250,
    transactionAmountUsdCents: 1_250,
    processedTransactionIds: [],
    ...overrides,
  }
}

function transaction(
  overrides: Partial<Pond0xProtectedTransaction> = {}
): Pond0xProtectedTransaction {
  return {
    transactionId: "pond0x-transaction-001",
    capturedAt: "2026-09-11T00:00:00.000Z",
    feePayer: DEDICATED_WALLET,
    requiredSigners: [DEDICATED_WALLET],
    direction: "SOL_TO_WPOND",
    inputMint: WRAPPED_SOL_MINT,
    outputMint: WPOND_MINT,
    inputAmountBaseUnits: "125000000",
    minimumOutputAmountBaseUnits: "75000000000",
    referralAccount: PONDOX_REFERRAL_ACCOUNT,
    estimatedNetworkFeeLamports: "10000",
    simulatedInputDebitBaseUnits: "125000000",
    simulatedOutputCreditBaseUnits: "75500000000",
    simulationSucceeded: true,
    simulationError: null,
    unexpectedValueTransferCount: 0,
    authorityChangeCount: 0,
    delegateApprovalCount: 0,
    tokenAccountCloseCount: 0,
    addressLookupTableMutationCount: 0,
    ...overrides,
  }
}

function evaluate(input: {
  campaign?: Pond0xProtectedCampaign
  transaction?: Pond0xProtectedTransaction
  now?: string
} = {}) {
  return evaluatePond0xProtectedTransaction({
    now: input.now ?? "2026-09-11T00:00:10.000Z",
    campaign: input.campaign ?? campaign(),
    transaction: input.transaction ?? transaction(),
  })
}

test("approves a bounded simulated Pond0x transaction", () => {
  const result = evaluate()

  assert.equal(result.status, "APPROVED")
  assert.deepEqual(result.blockingReasons, [])
  assert.equal(result.transactionAmountUsdCents, 1_250)
  assert.equal(result.signingEnabled, false)
  assert.equal(result.transactionSubmitted, false)
})

test("blocks transaction and campaign limits outside policy", () => {
  const tooSmall = evaluate({
    campaign: campaign({ transactionAmountUsdCents: 999 }),
  })
  assert.equal(tooSmall.status, "BLOCKED")
  assert.ok(
    tooSmall.blockingReasons.includes(
      "PONDOX_GUARD_TRANSACTION_USD_OUT_OF_RANGE"
    )
  )

  const tooLarge = evaluate({
    campaign: campaign({
      fundedUsdCents: 10_001,
      capitalAtRiskUsdCents: 10_001,
      transactionAmountUsdCents: 1_501,
    }),
  })
  assert.ok(
    tooLarge.blockingReasons.includes(
      "PONDOX_GUARD_CAMPAIGN_FUNDING_OUT_OF_RANGE"
    )
  )
  assert.ok(
    tooLarge.blockingReasons.includes(
      "PONDOX_GUARD_CAMPAIGN_RISK_OUT_OF_RANGE"
    )
  )
  assert.ok(
    tooLarge.blockingReasons.includes(
      "PONDOX_GUARD_TRANSACTION_USD_OUT_OF_RANGE"
    )
  )
})

test("blocks a foreign signer, mint or referral", () => {
  const result = evaluate({
    transaction: transaction({
      feePayer: "ForeignWallet",
      requiredSigners: ["ForeignWallet", DEDICATED_WALLET],
      outputMint: WRAPPED_SOL_MINT,
      referralAccount: "ForeignReferral",
    }),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_SIGNER_MISMATCH"
    )
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_MINT_MISMATCH"
    )
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_REFERRAL_MISMATCH"
    )
  )
})

test("blocks unsafe simulated effects and excess network fees", () => {
  const result = evaluate({
    transaction: transaction({
      estimatedNetworkFeeLamports: "1000001",
      unexpectedValueTransferCount: 1,
      authorityChangeCount: 1,
      delegateApprovalCount: 1,
      tokenAccountCloseCount: 1,
      addressLookupTableMutationCount: 1,
    }),
  })

  assert.equal(result.status, "BLOCKED")
  for (const reason of [
    "PONDOX_GUARD_NETWORK_FEE_INVALID",
    "PONDOX_GUARD_UNEXPECTED_VALUE_TRANSFER",
    "PONDOX_GUARD_AUTHORITY_CHANGE",
    "PONDOX_GUARD_DELEGATE_APPROVAL",
    "PONDOX_GUARD_TOKEN_ACCOUNT_CLOSE",
    "PONDOX_GUARD_LOOKUP_TABLE_MUTATION",
  ]) {
    assert.ok(result.blockingReasons.includes(reason))
  }
})

test("blocks stale, replayed and failed simulations", () => {
  const result = evaluate({
    now: "2026-09-11T00:01:00.000Z",
    campaign: campaign({
      processedTransactionIds: ["pond0x-transaction-001"],
    }),
    transaction: transaction({
      simulationSucceeded: false,
      simulationError: "custom program error",
    }),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_TRANSACTION_STALE"
    )
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_TRANSACTION_REPLAY"
    )
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_SIMULATION_FAILED"
    )
  )
})

test("blocks altered debit or insufficient simulated output", () => {
  const result = evaluate({
    transaction: transaction({
      simulatedInputDebitBaseUnits: "125000001",
      simulatedOutputCreditBaseUnits: "74999999999",
    }),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_INPUT_DEBIT_MISMATCH"
    )
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_MINIMUM_OUTPUT_NOT_MET"
    )
  )
})
