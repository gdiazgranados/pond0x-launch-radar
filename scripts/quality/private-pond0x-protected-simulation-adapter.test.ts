import test from "node:test"
import assert from "node:assert/strict"
import {
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit"
import type {
  Address,
} from "@solana/kit"
import {
  evaluatePond0xProtectedSimulation,
} from "../../src/private-alpha/pond0x-protected-simulation-adapter"
import type {
  Pond0xProtectedSimulationEvidence,
  Pond0xProtectedTransactionIntent,
} from "../../src/private-alpha/pond0x-protected-simulation-adapter"
import type {
  Pond0xProtectedCampaign,
} from "../../src/private-alpha/pond0x-protected-transaction-guard"
import {
  PONDOX_REFERRAL_ACCOUNT,
} from "../../src/private-alpha/pond0x-referral-vault-observer"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

const DEDICATED_WALLET = address(
  "DmRY6zagBUNs3bsuXB9Gib5negt1RdwLFmzTFZysA2KU"
)
const FOREIGN_WALLET = address(
  "8Gbn5kYt117y3JbzTWzzz9uc6FXAbvHjGZKTB9fKgU4n"
)
const SYSTEM_PROGRAM = address(
  "11111111111111111111111111111111"
)

function encodedTransaction(
  feePayer: Address = DEDICATED_WALLET,
  withInstruction = true
) {
  const base = pipe(
    createTransactionMessage({ version: 0 }),
    message => setTransactionMessageFeePayer(
      feePayer,
      message
    ),
    message => setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash(
          "11111111111111111111111111111111"
        ),
        lastValidBlockHeight: BigInt(100),
      },
      message
    )
  )
  const message = withInstruction
    ? appendTransactionMessageInstruction(
        {
          programAddress: SYSTEM_PROGRAM,
          data: new Uint8Array([1, 2, 3]),
        },
        base
      )
    : base

  return getBase64EncodedWireTransaction(
    compileTransaction(message)
  )
}

function campaign(): Pond0xProtectedCampaign {
  return {
    campaignId: "campaign-2026-09-11-001",
    dedicatedWallet: DEDICATED_WALLET,
    fundedUsdCents: 10_000,
    capitalAtRiskUsdCents: 1_250,
    transactionAmountUsdCents: 1_250,
    processedTransactionIds: [],
  }
}

function intent(
  overrides: Partial<Pond0xProtectedTransactionIntent> = {}
): Pond0xProtectedTransactionIntent {
  return {
    transactionId: "pond0x-wire-001",
    capturedAt: "2026-09-11T00:00:00.000Z",
    direction: "SOL_TO_WPOND",
    inputMint: WRAPPED_SOL_MINT,
    outputMint: WPOND_MINT,
    inputAmountBaseUnits: "125000000",
    minimumOutputAmountBaseUnits: "75000000000",
    referralAccount: PONDOX_REFERRAL_ACCOUNT,
    ...overrides,
  }
}

function simulation(
  overrides: Partial<Pond0xProtectedSimulationEvidence> = {}
): Pond0xProtectedSimulationEvidence {
  return {
    transactionId: "pond0x-wire-001",
    observedAt: "2026-09-11T00:00:05.000Z",
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

test("approves matching wire and simulated Pond0x evidence", () => {
  const result = evaluatePond0xProtectedSimulation({
    now: "2026-09-11T00:00:10.000Z",
    campaign: campaign(),
    transactionBase64: encodedTransaction(),
    intent: intent(),
    simulation: simulation(),
  })

  assert.equal(result.status, "APPROVED")
  assert.equal(result.wireInspection.feePayer, DEDICATED_WALLET)
  assert.equal(result.guardDecision.status, "APPROVED")
  assert.deepEqual(result.blockingReasons, [])
  assert.equal(result.signingEnabled, false)
  assert.equal(result.transactionSubmitted, false)
})

test("uses the wire fee payer and blocks a foreign signer", () => {
  const result = evaluatePond0xProtectedSimulation({
    now: "2026-09-11T00:00:10.000Z",
    campaign: campaign(),
    transactionBase64: encodedTransaction(FOREIGN_WALLET),
    intent: intent(),
    simulation: simulation(),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_SIGNER_MISMATCH"
    )
  )
})

test("blocks simulation evidence bound to another transaction", () => {
  const result = evaluatePond0xProtectedSimulation({
    now: "2026-09-11T00:00:10.000Z",
    campaign: campaign(),
    transactionBase64: encodedTransaction(),
    intent: intent(),
    simulation: simulation({
      transactionId: "pond0x-wire-002",
    }),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_SIMULATION_TRANSACTION_ID_MISMATCH"
    )
  )
})

test("propagates wire and simulation failures without signing", () => {
  const result = evaluatePond0xProtectedSimulation({
    now: "2026-09-11T00:00:10.000Z",
    campaign: campaign(),
    transactionBase64: encodedTransaction(
      DEDICATED_WALLET,
      false
    ),
    intent: intent(),
    simulation: simulation({
      simulationSucceeded: false,
      simulationError: "custom program error",
    }),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_WIRE_INSTRUCTIONS_EMPTY"
    )
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_GUARD_SIMULATION_FAILED"
    )
  )
  assert.equal(result.signingEnabled, false)
  assert.equal(result.transactionSubmitted, false)
})
