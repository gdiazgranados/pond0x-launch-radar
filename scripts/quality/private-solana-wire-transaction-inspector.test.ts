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
  inspectSolanaWireTransaction,
} from "../../src/private-alpha/solana-wire-transaction-inspector"

const FEE_PAYER = address(
  "DmRY6zagBUNs3bsuXB9Gib5negt1RdwLFmzTFZysA2KU"
)
const SYSTEM_PROGRAM = address(
  "11111111111111111111111111111111"
)

function encodedTransaction(options: {
  withInstruction?: boolean
} = {}) {
  const withInstruction = options.withInstruction ?? true
  const base = pipe(
    createTransactionMessage({ version: 0 }),
    message => setTransactionMessageFeePayer(
      FEE_PAYER,
      message
    ),
    message => setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash(
          "11111111111111111111111111111111"
        ),
        lastValidBlockHeight: 100n,
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

test("decodes a bounded unsigned Solana v0 transaction", () => {
  const result = inspectSolanaWireTransaction(
    encodedTransaction()
  )

  assert.equal(result.status, "DECODED")
  assert.equal(result.transactionVersion, 0)
  assert.equal(result.feePayer, FEE_PAYER)
  assert.deepEqual(result.requiredSigners, [FEE_PAYER])
  assert.equal(result.instructions.length, 1)
  assert.equal(
    result.instructions[0].programAddress,
    SYSTEM_PROGRAM
  )
  assert.equal(result.instructions[0].dataLength, 3)
  assert.deepEqual(result.blockingReasons, [])
  assert.equal(result.signingEnabled, false)
  assert.equal(result.transactionSubmitted, false)
})

test("fails closed on invalid or malformed base64", () => {
  const invalid = inspectSolanaWireTransaction("not base64!")
  assert.equal(invalid.status, "BLOCKED")
  assert.deepEqual(
    invalid.blockingReasons,
    ["PONDOX_WIRE_BASE64_INVALID"]
  )

  const malformed = inspectSolanaWireTransaction("AAAA")
  assert.equal(malformed.status, "BLOCKED")
  assert.deepEqual(
    malformed.blockingReasons,
    ["PONDOX_WIRE_DECODE_FAILED"]
  )
})

test("blocks a decoded transaction without instructions", () => {
  const result = inspectSolanaWireTransaction(
    encodedTransaction({ withInstruction: false })
  )

  assert.equal(result.status, "BLOCKED")
  assert.equal(result.feePayer, FEE_PAYER)
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_WIRE_INSTRUCTIONS_EMPTY"
    )
  )
})
