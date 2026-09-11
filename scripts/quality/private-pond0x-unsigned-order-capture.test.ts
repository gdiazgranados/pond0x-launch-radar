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
import {
  capturePond0xUnsignedOrder,
} from "../../src/private-alpha/pond0x-unsigned-order-capture"
import {
  PONDOX_REFERRAL_ACCOUNT,
} from "../../src/private-alpha/pond0x-referral-vault-observer"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

const TAKER = address(
  "DmRY6zagBUNs3bsuXB9Gib5negt1RdwLFmzTFZysA2KU"
)
const PROGRAM = address("11111111111111111111111111111111")

function wire() {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    value => setTransactionMessageFeePayer(TAKER, value),
    value => setTransactionMessageLifetimeUsingBlockhash({
      blockhash: blockhash("11111111111111111111111111111111"),
      lastValidBlockHeight: BigInt(100),
    }, value),
    value => appendTransactionMessageInstruction({
      programAddress: PROGRAM,
      data: new Uint8Array([1]),
    }, value)
  )
  return getBase64EncodedWireTransaction(compileTransaction(message))
}

function request(fetcher: typeof fetch) {
  return capturePond0xUnsignedOrder({
    taker: TAKER,
    inputMint: WRAPPED_SOL_MINT,
    outputMint: WPOND_MINT,
    inputAmountBaseUnits: "10000000",
    referralAccount: PONDOX_REFERRAL_ACCOUNT,
    referralFeeBps: 95,
    fetcher,
  })
}

test("captures a watch-only unsigned order for the pinned taker", async () => {
  let requested = ""
  const result = await request(async input => {
    requested = String(input)
    return new Response(JSON.stringify({
      transaction: wire(),
      requestId: "order-001",
    }), {
      headers: { "content-type": "application/json" },
    })
  })

  assert.equal(result.status, "CAPTURED")
  assert.equal(result.wireInspection?.feePayer, TAKER)
  assert.match(requested, /taker=/)
  assert.match(requested, /referralAccount=/)
  assert.equal(result.signingEnabled, false)
  assert.equal(result.transactionSubmitted, false)
})

test("blocks an order without a transaction", async () => {
  const result = await request(async () =>
    new Response(JSON.stringify({ requestId: "order-001" }), {
      headers: { "content-type": "application/json" },
    })
  )
  assert.deepEqual(result.blockingReasons, [
    "PONDOX_ORDER_TRANSACTION_UNAVAILABLE",
  ])
})

test("blocks a wire whose fee payer differs from the taker", async () => {
  const result = await capturePond0xUnsignedOrder({
    taker: PONDOX_REFERRAL_ACCOUNT,
    inputMint: WRAPPED_SOL_MINT,
    outputMint: WPOND_MINT,
    inputAmountBaseUnits: "10000000",
    referralAccount: PONDOX_REFERRAL_ACCOUNT,
    referralFeeBps: 95,
    fetcher: async () =>
      new Response(JSON.stringify({
        transaction: wire(),
        requestId: "order-002",
      }), {
        headers: { "content-type": "application/json" },
      }),
  })
  assert.ok(result.blockingReasons.includes(
    "PONDOX_ORDER_FEE_PAYER_MISMATCH"
  ))
})
