import assert from "node:assert/strict"
import test from "node:test"

import {
  validateSolanaMintOnchain,
} from "../../src/private-alpha/solana-mint-validator"

const MINT = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx"
const TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const TOKEN_2022_PROGRAM =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

function mintData(input: {
  supply?: bigint
  decimals?: number
  initialized?: boolean
  mintAuthority?: boolean
  extended?: boolean
} = {}) {
  const bytes = Buffer.alloc(input.extended ? 100 : 82)
  if (input.mintAuthority) {
    bytes.writeUInt32LE(1, 0)
    bytes.fill(1, 4, 36)
  }
  bytes.writeBigUInt64LE(input.supply ?? BigInt(123_456), 36)
  bytes[44] = input.decimals ?? 6
  bytes[45] = input.initialized === false ? 0 : 1
  return bytes.toString("base64")
}

function payload(input: {
  owner?: string
  executable?: boolean
  data?: string
  supply?: string
  decimals?: number
  supplyError?: boolean
  accountValue?: Record<string, unknown> | null
} = {}) {
  const accountValue = input.accountValue === undefined
    ? {
        lamports: 1_461_600,
        owner: input.owner ?? TOKEN_PROGRAM,
        executable: input.executable ?? false,
        data: [input.data ?? mintData(), "base64"],
        rentEpoch: 0,
      }
    : input.accountValue
  return [
    {
      jsonrpc: "2.0",
      id: 1,
      result: {
        context: { slot: 100 },
        value: accountValue,
      },
    },
    input.supplyError
      ? {
          jsonrpc: "2.0",
          id: 2,
          error: { code: -32000, message: "unavailable" },
        }
      : {
          jsonrpc: "2.0",
          id: 2,
          result: {
            context: { slot: 101 },
            value: {
              amount: input.supply ?? "123456",
              decimals: input.decimals ?? 6,
              uiAmount: 0.123456,
              uiAmountString: "0.123456",
            },
          },
        },
  ]
}

function fetcher(
  value: unknown,
  inspect?: (init: RequestInit | undefined) => void,
  status = 200
) {
  return async (_input: string | URL, init?: RequestInit) => {
    inspect?.(init)
    return new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    })
  }
}

test("verifies a classic Solana mint with matching direct evidence", async () => {
  let requestBody: unknown
  const result = await validateSolanaMintOnchain({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    network: "solana",
    contractAddress: MINT,
    fetcher: fetcher(payload(), init => {
      requestBody = JSON.parse(String(init?.body))
    }),
    now: () => new Date("2026-09-17T02:00:00.000Z"),
  })

  assert.equal(result.status, "VERIFIED_ONCHAIN")
  assert.equal(result.tokenProgram, "TOKEN")
  assert.equal(result.ownerProgram, TOKEN_PROGRAM)
  assert.equal(result.executable, false)
  assert.equal(result.initialized, true)
  assert.equal(result.decimals, 6)
  assert.equal(result.supplyRaw, "123456")
  assert.equal(result.consistency, "MATCHED")
  assert.equal(result.accountAge, null)
  assert.equal(
    result.accountAgeReason,
    "UNAVAILABLE_FROM_MINT_ACCOUNT"
  )
  assert.equal(result.watchOnly, true)
  assert.deepEqual(
    (requestBody as Array<{ method: string }>).map(item => item.method),
    ["getAccountInfo", "getTokenSupply"]
  )
})

test("supports Token-2022 base mint evidence and authorities", async () => {
  const result = await validateSolanaMintOnchain({
    rpcUrl: "https://rpc.example.com/key",
    network: "solana",
    contractAddress: MINT,
    fetcher: fetcher(payload({
      owner: TOKEN_2022_PROGRAM,
      data: mintData({ mintAuthority: true, extended: true }),
    })),
  })

  assert.equal(result.status, "VERIFIED_ONCHAIN")
  assert.equal(result.tokenProgram, "TOKEN_2022")
  assert.equal(result.ownerProgram, TOKEN_2022_PROGRAM)
  assert.equal(typeof result.mintAuthority, "string")
  assert.equal(result.freezeAuthority, null)
})

test("blocks a supply or decimals mismatch", async () => {
  const result = await validateSolanaMintOnchain({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    network: "solana",
    contractAddress: MINT,
    fetcher: fetcher(payload({ supply: "123457" })),
  })

  assert.equal(result.status, "BLOCKED")
  assert.equal(result.consistency, "MISMATCH")
  assert.deepEqual(result.blockingReasons, [
    "SOLANA_MINT_SUPPLY_MISMATCH",
  ])
})

test("keeps valid mint evidence incomplete when crosscheck is unavailable", async () => {
  const result = await validateSolanaMintOnchain({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    network: "solana",
    contractAddress: MINT,
    fetcher: fetcher(payload({ supplyError: true })),
  })

  assert.equal(result.status, "INCOMPLETE")
  assert.equal(result.initialized, true)
  assert.equal(result.supplyRaw, "123456")
  assert.equal(result.consistency, "NOT_CHECKED")
  assert.ok(
    result.caveats.includes(
      "SOLANA_TOKEN_SUPPLY_CROSSCHECK_UNAVAILABLE"
    )
  )
})

test("distinguishes an unavailable mint from invalid account evidence", async () => {
  const unavailable = await validateSolanaMintOnchain({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    network: "solana",
    contractAddress: MINT,
    fetcher: fetcher(payload({ accountValue: null })),
  })
  assert.equal(unavailable.status, "UNAVAILABLE")
  assert.ok(
    unavailable.blockingReasons.includes(
      "SOLANA_MINT_ACCOUNT_UNAVAILABLE"
    )
  )

  const invalid = await validateSolanaMintOnchain({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    network: "solana",
    contractAddress: MINT,
    fetcher: fetcher(payload({
      owner: "11111111111111111111111111111111",
    })),
  })
  assert.equal(invalid.status, "BLOCKED")
  assert.ok(
    invalid.blockingReasons.includes(
      "SOLANA_MINT_ACCOUNT_INVALID"
    )
  )
})

test("fails safely before or during an unsafe RPC request", async () => {
  let called = false
  const invalidIdentity = await validateSolanaMintOnchain({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    network: "ethereum",
    contractAddress: MINT,
    fetcher: async () => {
      called = true
      throw new Error("must not run")
    },
  })
  assert.equal(invalidIdentity.status, "BLOCKED")
  assert.equal(called, false)

  const badUrl = await validateSolanaMintOnchain({
    rpcUrl: "http://localhost:8899",
    network: "solana",
    contractAddress: MINT,
  })
  assert.equal(badUrl.status, "BLOCKED")
  assert.ok(badUrl.blockingReasons.includes("SOLANA_RPC_URL_INVALID"))

  const failed = await validateSolanaMintOnchain({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    network: "solana",
    contractAddress: MINT,
    fetcher: fetcher({}, undefined, 503),
  })
  assert.equal(failed.status, "UNAVAILABLE")
  assert.ok(failed.blockingReasons.includes("SOLANA_RPC_HTTP_FAILED"))
})
