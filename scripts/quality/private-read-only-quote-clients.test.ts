import test from "node:test"
import assert from "node:assert/strict"
import {
  readJupiterQuote,
  readZeroXPrice,
} from "../../src/private-alpha/read-only-quote-clients"

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

test("uses Jupiter keyless GET quote without transaction endpoints", async () => {
  let requestedUrl = ""
  let requestedInit: RequestInit | undefined
  const fetcher = async (
    input: string | URL,
    init?: RequestInit
  ) => {
    requestedUrl = String(input)
    requestedInit = init
    return jsonResponse({
      inAmount: "1000000",
      outAmount: "500000000",
      routePlan: [
        { swapInfo: { label: "Meteora" } },
      ],
    })
  }

  const quote = await readJupiterQuote(
    {
      inputToken: "USDC-mint",
      outputToken: "PAPER-mint",
      inputAmountBaseUnits: "1000000",
      inputDecimals: 6,
      outputDecimals: 9,
      estimatedFeeUsd: 0.01,
    },
    fetcher
  )

  const url = new URL(requestedUrl)
  assert.equal(url.origin, "https://lite-api.jup.ag")
  assert.equal(url.pathname, "/swap/v1/quote")
  assert.equal(url.searchParams.get("swapMode"), "ExactIn")
  assert.equal(requestedInit?.method, "GET")
  assert.deepEqual(requestedInit?.headers, {})
  assert.equal(quote.routeId, "jupiter:Meteora")
  assert.equal(quote.inputAmount, 1)
  assert.equal(quote.outputAmount, 0.5)
  assert.equal(quote.inputAmountBaseUnits, "1000000")
  assert.equal(quote.outputAmountBaseUnits, "500000000")
})

test("sends a Jupiter key only in the server request header", async () => {
  let requestedUrl = ""
  let headers: Record<string, string> = {}
  const fetcher = async (
    input: string | URL,
    init?: RequestInit
  ) => {
    requestedUrl = String(input)
    headers = init?.headers as Record<string, string>
    return jsonResponse({
      inAmount: "1000000",
      outAmount: "500000000",
      routePlan: [],
    })
  }

  await readJupiterQuote(
    {
      inputToken: "USDC-mint",
      outputToken: "PAPER-mint",
      inputAmountBaseUnits: "1000000",
      inputDecimals: 6,
      outputDecimals: 9,
      estimatedFeeUsd: 0,
      apiKey: "server-secret",
    },
    fetcher
  )

  assert.equal(new URL(requestedUrl).origin, "https://api.jup.ag")
  assert.equal(
    new URL(requestedUrl).search.includes("server-secret"),
    false
  )
  assert.equal(headers["x-api-key"], "server-secret")
})

test("uses the 0x read-only price endpoint and includes estimated gas", async () => {
  let requestedUrl = ""
  let requestedInit: RequestInit | undefined
  const fetcher = async (
    input: string | URL,
    init?: RequestInit
  ) => {
    requestedUrl = String(input)
    requestedInit = init
    return jsonResponse({
      sellAmount: "1000000000000000000",
      buyAmount: "2000000",
      gas: "21000",
      gasPrice: "1000000000",
      route: {
        fills: [{ source: "Uniswap_V3" }],
      },
    })
  }

  const quote = await readZeroXPrice(
    {
      inputToken: "0x1111111111111111111111111111111111111111",
      outputToken: "0x2222222222222222222222222222222222222222",
      inputAmountBaseUnits: "1000000000000000000",
      inputDecimals: 18,
      outputDecimals: 6,
      estimatedFeeUsd: 0.1,
      apiKey: "server-secret",
      takerAddress: "0x0000000000000000000000000000000000000001",
      nativeTokenPriceUsd: 2500,
    },
    fetcher
  )

  const url = new URL(requestedUrl)
  assert.equal(url.origin, "https://api.0x.org")
  assert.equal(url.pathname, "/swap/allowance-holder/price")
  assert.equal(requestedInit?.method, "GET")
  assert.equal(
    (requestedInit?.headers as Record<string, string>)[
      "0x-version"
    ],
    "v2"
  )
  assert.equal(quote.routeId, "0x:Uniswap_V3")
  assert.equal(quote.inputAmount, 1)
  assert.equal(quote.outputAmount, 2)
  assert.equal(
    quote.inputAmountBaseUnits,
    "1000000000000000000"
  )
  assert.equal(quote.outputAmountBaseUnits, "2000000")
  assert.ok(Math.abs(quote.estimatedFeeUsd - 0.1525) < 1e-9)
})

test("fails closed on bad responses and invalid request values", async () => {
  const failingFetch = async () => jsonResponse({}, 429)

  await assert.rejects(
    () =>
      readJupiterQuote(
        {
          inputToken: "USDC",
          outputToken: "PAPER",
          inputAmountBaseUnits: "100",
          inputDecimals: 6,
          outputDecimals: 9,
          estimatedFeeUsd: 0,
        },
        failingFetch
      ),
    /HTTP 429/
  )

  await assert.rejects(
    () =>
      readZeroXPrice(
        {
          inputToken: "same",
          outputToken: "same",
          inputAmountBaseUnits: "100",
          inputDecimals: 6,
          outputDecimals: 9,
          estimatedFeeUsd: 0,
          apiKey: "secret",
          takerAddress:
            "0x0000000000000000000000000000000000000001",
          nativeTokenPriceUsd: 2500,
        },
        failingFetch
      ),
    /must differ/
  )
})
