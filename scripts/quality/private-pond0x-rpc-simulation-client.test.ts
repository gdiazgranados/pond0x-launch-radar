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
  simulatePond0xWireTransaction,
} from "../../src/private-alpha/pond0x-rpc-simulation-client"

const FEE_PAYER = address(
  "DmRY6zagBUNs3bsuXB9Gib5negt1RdwLFmzTFZysA2KU"
)
const SYSTEM_PROGRAM = address(
  "11111111111111111111111111111111"
)

function encodedTransaction() {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    value => setTransactionMessageFeePayer(
      FEE_PAYER,
      value
    ),
    value => setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash(
          "11111111111111111111111111111111"
        ),
        lastValidBlockHeight: BigInt(100),
      },
      value
    ),
    value => appendTransactionMessageInstruction(
      {
        programAddress: SYSTEM_PROGRAM,
        data: new Uint8Array([1, 2, 3]),
      },
      value
    )
  )

  return getBase64EncodedWireTransaction(
    compileTransaction(message)
  )
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

test("simulates unsigned wire and requests its network fee", async () => {
  let requestBody: unknown
  const result = await simulatePond0xWireTransaction({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    transactionBase64: encodedTransaction(),
    watchedAccounts: [FEE_PAYER],
    fetcher: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return jsonResponse([
        {
          jsonrpc: "2.0",
          id: 1,
          result: {
            context: { slot: 1 },
            value: {
              err: null,
              logs: ["Program log: simulated"],
              unitsConsumed: 12345,
              accounts: [{
                lamports: 100000000,
                owner: SYSTEM_PROGRAM,
                executable: false,
                data: ["", "base64"],
              }],
            },
          },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          result: {
            context: { slot: 1 },
            value: 5000,
          },
        },
      ])
    },
  })

  assert.equal(result.status, "SIMULATED")
  assert.equal(result.simulationSucceeded, true)
  assert.equal(result.estimatedNetworkFeeLamports, "5000")
  assert.equal(result.unitsConsumed, 12345)
  assert.equal(result.postAccounts[0].address, FEE_PAYER)
  assert.deepEqual(result.blockingReasons, [])

  const requests = requestBody as Array<{
    method: string
    params: unknown[]
  }>
  assert.deepEqual(
    requests.map(value => value.method),
    ["simulateTransaction", "getFeeForMessage"]
  )
  const config = requests[0].params[1] as Record<string, unknown>
  assert.equal(config.sigVerify, false)
  assert.equal(config.replaceRecentBlockhash, true)
  assert.equal(
    JSON.stringify(requestBody).includes("sendTransaction"),
    false
  )
  assert.equal(result.signingEnabled, false)
  assert.equal(result.transactionSubmitted, false)
})

test("fails before RPC when wire input is blocked", async () => {
  let called = false
  const result = await simulatePond0xWireTransaction({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    transactionBase64: "AAAA",
    fetcher: async () => {
      called = true
      return jsonResponse([])
    },
  })

  assert.equal(called, false)
  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_WIRE_DECODE_FAILED"
    )
  )
})

test("blocks failed simulation while preserving sanitized error", async () => {
  const result = await simulatePond0xWireTransaction({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    transactionBase64: encodedTransaction(),
    fetcher: async () => jsonResponse([
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          context: { slot: 1 },
          value: {
            err: { InstructionError: [0, "Custom"] },
            logs: ["Program failed"],
            unitsConsumed: 100,
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        result: {
          context: { slot: 1 },
          value: 5000,
        },
      },
    ]),
  })

  assert.equal(result.status, "BLOCKED")
  assert.equal(result.simulationSucceeded, false)
  assert.match(
    result.simulationError ?? "",
    /InstructionError/
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_RPC_SIMULATION_FAILED"
    )
  )
})

test("fails closed on unsafe endpoints and malformed RPC responses", async () => {
  const unsafe = await simulatePond0xWireTransaction({
    rpcUrl: "http://api.mainnet-beta.solana.com",
    transactionBase64: encodedTransaction(),
  })
  assert.deepEqual(
    unsafe.blockingReasons,
    ["PONDOX_RPC_REQUEST_INVALID"]
  )

  const malformed = await simulatePond0xWireTransaction({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    transactionBase64: encodedTransaction(),
    fetcher: async () => jsonResponse({ result: null }),
  })
  assert.deepEqual(
    malformed.blockingReasons,
    ["PONDOX_RPC_RESPONSE_INVALID"]
  )
})
