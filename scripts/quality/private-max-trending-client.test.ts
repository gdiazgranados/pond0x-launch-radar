import test from "node:test"
import assert from "node:assert/strict"
import {
  observeMaxTrending,
  parseMaxTrendingPayload,
} from "../../src/private-alpha/max-trending-client"

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const solanaMint = "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq"

test("normalizes a live-shaped MAX trending payload", () => {
  const result = parseMaxTrendingPayload({
    tokens: [{ symbol: "SOL" }],
    trending: [{
      network: "SOL",
      mint: solanaMint,
      symbol: "TEST",
      name: "Test Token",
      price: 1.25,
      change24h: 19.99,
      liquidity: 125000,
      marketCap: 2500000,
      volume24h: 375000,
    }],
  }, "2026-09-16T12:00:00.000Z")

  assert.equal(result.status, "OBSERVED")
  assert.equal(result.tokenCount, 1)
  assert.deepEqual(result.trending[0], {
    network: "solana",
    contractAddress: solanaMint,
    symbol: "TEST",
    name: "Test Token",
    position: 1,
    price: 1.25,
    change24h: 19.99,
    liquidity: 125000,
    marketCap: 2500000,
    volume24h: 375000,
    identityKey: `solana:${solanaMint}`,
  })
  assert.equal(result.watchOnly, true)
  assert.equal(result.approvalGranted, false)
  assert.equal(result.transactionRequested, false)
})

test("treats an empty trending array as valid EMPTY evidence", () => {
  const result = parseMaxTrendingPayload({ tokens: [], trending: [] })
  assert.equal(result.status, "EMPTY")
  assert.deepEqual(result.trending, [])
})

test("supports nested token identity without trusting symbol as identity", () => {
  const result = parseMaxTrendingPayload({
    tokens: [],
    trending: [{
      chain: "ethereum",
      token: {
        address: "0x1111111111111111111111111111111111111111",
        symbol: "SAME",
      },
    }],
  })
  assert.equal(
    result.trending[0]?.identityKey,
    "ethereum:0x1111111111111111111111111111111111111111"
  )
})

test("fails closed on partial or malformed payloads", () => {
  assert.throws(
    () => parseMaxTrendingPayload({ tokens: [] }),
    /tokens and trending arrays/
  )
  assert.throws(
    () => parseMaxTrendingPayload({
      tokens: [],
      trending: [{ network: "solana", symbol: "NO_MINT" }],
    }),
    /lacks network or contract/
  )
  assert.throws(
    () => parseMaxTrendingPayload({
      tokens: [],
      trending: [{ network: "ethereum", address: "javascript:alert(1)" }],
    }),
    /invalid EVM contract/
  )
})

test("rejects duplicate normalized identities", () => {
  const token = {
    network: "ethereum",
    address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  }
  assert.throws(
    () => parseMaxTrendingPayload({ tokens: [], trending: [token, token] }),
    /duplicate trending assets/
  )
})

test("uses only the exact watch-only Pond0x MAX GET request", async () => {
  let requestedUrl = ""
  let requestedInit: RequestInit | undefined
  const result = await observeMaxTrending({
    now: () => new Date("2026-09-16T12:00:00.000Z"),
    fetcher: async (input, init) => {
      requestedUrl = String(input)
      requestedInit = init
      return jsonResponse({ tokens: [], trending: [] })
    },
  })

  const url = new URL(requestedUrl)
  assert.equal(url.origin, "https://www.pond0x.com")
  assert.equal(url.pathname, "/api/max/search")
  assert.equal(url.searchParams.get("q"), "")
  assert.equal(url.searchParams.get("verified"), "false")
  assert.equal(url.searchParams.get("network"), "all")
  assert.equal(requestedInit?.method, "GET")
  assert.equal(requestedInit?.redirect, "error")
  assert.equal(requestedInit?.cache, "no-store")
  assert.equal(result.status, "EMPTY")
})

test("fails closed on HTTP, content type, JSON and size errors", async () => {
  await assert.rejects(
    () => observeMaxTrending({ fetcher: async () => jsonResponse({}, 429) }),
    /HTTP 429/
  )
  await assert.rejects(
    () => observeMaxTrending({
      fetcher: async () => new Response("<html />", {
        headers: { "content-type": "text/html" },
      }),
    }),
    /non-JSON/
  )
  await assert.rejects(
    () => observeMaxTrending({
      fetcher: async () => new Response("not-json", {
        headers: { "content-type": "application/json" },
      }),
    }),
    /invalid JSON/
  )
  await assert.rejects(
    () => observeMaxTrending({
      fetcher: async () => new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": "1000001",
        },
      }),
    }),
    /size limit/
  )
})
