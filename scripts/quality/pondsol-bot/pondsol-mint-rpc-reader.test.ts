import test from "node:test"
import assert from "node:assert/strict"

import {
  readPondSolMint,
} from "../../../src/private-alpha/pondsol-bot/pondsol-mint-rpc-reader"

import {
  PONDSOL_TOKEN_IDENTITY,
} from "../../../src/private-alpha/pondsol-bot/pondsol-token-identity"

function rpcResponse(
  decimals: number = 9,
  owner: string = PONDSOL_TOKEN_IDENTITY.tokenProgram
) {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: {
      context: { slot: 454644484 },
      value: {
        owner,
        data: {
          program: "spl-token",
          parsed: {
            type: "mint",
            info: { decimals },
          },
        },
      },
    },
  }
}

function mockFetch(payload: unknown, status = 200) {
  return async (_input: string | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })
}

test("accepts matching finalized mint response", async () => {
  let requestBody: any
  let requestMethod = ""

  const fetcher = async (
    _input: string | URL,
    init?: RequestInit
  ) => {
    requestMethod = init?.method ?? ""
    requestBody = JSON.parse(String(init?.body))
    return new Response(JSON.stringify(rpcResponse()), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }

  const result = await readPondSolMint(
    "https://api.mainnet-beta.solana.com",
    fetcher
  )

  assert.equal(result.verified, true)
  assert.equal(result.observation?.decimals, 9)
  assert.equal(result.observation?.finalizedSlot, 454644484)
  assert.equal(requestMethod, "POST")
  assert.equal(requestBody.method, "getAccountInfo")
  assert.equal(
    requestBody.params[0],
    PONDSOL_TOKEN_IDENTITY.mint
  )
  assert.equal(
    requestBody.params[1].commitment,
    "finalized"
  )
})

test("rejects wrong decimals", async () => {
  const result = await readPondSolMint(
    undefined,
    mockFetch(rpcResponse(6))
  )

  assert.equal(result.verified, false)
  assert.deepEqual(result.reasons, ["MINT_IDENTITY_MISMATCH"])
})

test("rejects wrong token program", async () => {
  const result = await readPondSolMint(
    undefined,
    mockFetch(rpcResponse(9, "wrong-program"))
  )

  assert.deepEqual(result.reasons, ["RPC_INVALID_MINT_ACCOUNT"])
})

test("rejects missing mint account", async () => {
  const payload = rpcResponse()
  payload.result.value = null as any

  const result = await readPondSolMint(
    undefined,
    mockFetch(payload)
  )

  assert.equal(result.verified, false)
})

test("rejects RPC HTTP failure", async () => {
  const result = await readPondSolMint(
    undefined,
    mockFetch({}, 429)
  )

  assert.deepEqual(result.reasons, ["RPC_HTTP_ERROR"])
})

test("rejects malformed RPC response", async () => {
  const result = await readPondSolMint(
    undefined,
    mockFetch({ result: {} })
  )

  assert.deepEqual(result.reasons, ["RPC_INVALID_RESPONSE"])
})

test("rejects insecure RPC URL", async () => {
  const result = await readPondSolMint(
    "http://example.com",
    mockFetch(rpcResponse())
  )

  assert.deepEqual(result.reasons, ["INVALID_RPC_URL"])
})

test("fails closed on network exception", async () => {
  const fetcher = async (): Promise<Response> => {
    throw new Error("network unavailable")
  }

  const result = await readPondSolMint(undefined, fetcher)

  assert.deepEqual(result.reasons, ["RPC_REQUEST_FAILED"])
})