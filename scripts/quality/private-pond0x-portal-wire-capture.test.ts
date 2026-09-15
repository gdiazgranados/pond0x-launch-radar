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
  capturePond0xPortalWire,
} from "../../src/private-alpha/pond0x-portal-wire-capture"

const WALLET = address(
  "DmRY6zagBUNs3bsuXB9Gib5negt1RdwLFmzTFZysA2KU"
)
const OTHER_WALLET = address(
  "4QwSwNriKPrz8DLW4ju5uxC2TN5cksJx6tPUPj7DGLAW"
)
const SYSTEM_PROGRAM = address(
  "11111111111111111111111111111111"
)

function wire(feePayer: string = WALLET) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    value =>
      setTransactionMessageFeePayer(
        address(feePayer),
        value
      ),
    value =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash(
            "11111111111111111111111111111111"
          ),
          lastValidBlockHeight: BigInt(100),
        },
        value
      ),
    value =>
      appendTransactionMessageInstruction(
        {
          programAddress: SYSTEM_PROGRAM,
          data: new Uint8Array([1]),
        },
        value
      )
  )

  return getBase64EncodedWireTransaction(
    compileTransaction(message)
  )
}

function capture(overrides: {
  capturedAt?: string
  portalUrl?: string
  responseUrl?: string
  expectedWallet?: string
  payload?: unknown
} = {}) {
  return capturePond0xPortalWire({
    capturedAt:
      overrides.capturedAt ??
      "2026-09-15T12:00:00.000Z",
    portalUrl:
      overrides.portalUrl ??
      "https://www.pond0x.com/swap/solana",
    responseUrl:
      overrides.responseUrl ??
      (
        "https://ultra-api.jup.ag/order" +
        `?taker=${WALLET}`
      ),
    expectedWallet:
      overrides.expectedWallet ?? WALLET,
    payload:
      overrides.payload ?? {
        transaction: wire(),
        requestId: "portal-order-001",
      },
  })
}

test(
  "captures an unsigned wire intercepted through Pond0x",
  () => {
    const result = capture()

    assert.equal(result.status, "CAPTURED")
    assert.equal(result.requestId, "portal-order-001")
    assert.equal(result.wireInspection?.feePayer, WALLET)
    assert.deepEqual(
      result.wireInspection?.requiredSigners,
      [WALLET]
    )
    assert.match(
      result.wireSha256 ?? "",
      /^[0-9a-f]{64}$/
    )
    assert.deepEqual(result.blockingReasons, [])
    assert.equal(result.executionAuthorized, false)
    assert.equal(result.signingEnabled, false)
    assert.equal(result.transactionSubmitted, false)
  }
)

test(
  "blocks a wire not observed from the Pond0x portal",
  () => {
    const result = capture({
      portalUrl:
        "https://example.com/swap/solana",
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_PORTAL_WIRE_PORTAL_ORIGIN_INVALID"
      )
    )
  }
)

test(
  "blocks a response outside the exact Ultra order endpoint",
  () => {
    const result = capture({
      responseUrl:
        "https://ultra-api.jup.ag/execute" +
        `?taker=${WALLET}`,
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_PORTAL_WIRE_RESPONSE_ORIGIN_INVALID"
      )
    )
  }
)

test(
  "blocks a response requested for another taker",
  () => {
    const result = capture({
      responseUrl:
        "https://ultra-api.jup.ag/order" +
        `?taker=${OTHER_WALLET}`,
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_PORTAL_WIRE_TAKER_MISMATCH"
      )
    )
  }
)

test(
  "blocks a wire whose signer differs from the dedicated wallet",
  () => {
    const result = capture({
      payload: {
        transaction: wire(OTHER_WALLET),
        requestId: "portal-order-002",
      },
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_PORTAL_WIRE_SIGNER_MISMATCH"
      )
    )
  }
)

test(
  "blocks malformed or incomplete portal order evidence",
  () => {
    const invalidPayload = capture({
      payload: "not-an-object",
    })
    const missingTransaction = capture({
      payload: {
        requestId: "portal-order-003",
      },
    })
    const missingRequestId = capture({
      payload: {
        transaction: wire(),
      },
    })

    assert.ok(
      invalidPayload.blockingReasons.includes(
        "PONDOX_PORTAL_WIRE_RESPONSE_INVALID"
      )
    )
    assert.ok(
      missingTransaction.blockingReasons.includes(
        "PONDOX_PORTAL_WIRE_TRANSACTION_UNAVAILABLE"
      )
    )
    assert.ok(
      missingRequestId.blockingReasons.includes(
        "PONDOX_PORTAL_WIRE_REQUEST_ID_INVALID"
      )
    )
  }
)

test(
  "fails closed on an invalid capture timestamp",
  () => {
    const result = capture({
      capturedAt: "not-a-date",
    })

    assert.equal(result.status, "BLOCKED")
    assert.ok(
      result.blockingReasons.includes(
        "PONDOX_PORTAL_WIRE_TIMESTAMP_INVALID"
      )
    )
  }
)