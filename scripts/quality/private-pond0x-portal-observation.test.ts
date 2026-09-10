import test from "node:test"
import assert from "node:assert/strict"
import {
  buildPond0xPortalObservation,
  classifyPond0xNetworkSurface,
  decimalToBaseUnits,
  type Pond0xUnderlyingQuote,
} from "../../src/private-alpha/pond0x-portal-observation"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

const portalUrl =
  "https://www.pond0x.com/swap/solana" +
  `?sell=${WRAPPED_SOL_MINT}&buy=${WPOND_MINT}&amt=0.01`

function quote(
  overrides: Partial<Pond0xUnderlyingQuote> = {}
): Pond0xUnderlyingQuote {
  return {
    provider: "JUPITER_LITE",
    sourceHost: "lite-api.jup.ag",
    sourcePath: "/swap/v1/quote",
    httpStatus: 200,
    inputMint: WRAPPED_SOL_MINT,
    inAmount: "10000000",
    outputMint: WPOND_MINT,
    outAmount: "7165096166",
    otherAmountThreshold: "7129270686",
    priceImpactPct: "0.0206260627771521248707748884",
    swapMode: "ExactIn",
    routeLabels: ["Raydium CLMM"],
    router: null,
    feeBps: null,
    signatureFeeLamports: null,
    prioritizationFeeLamports: null,
    rentFeeLamports: null,
    ...overrides,
  }
}

function observation(
  overrides: Partial<
    Parameters<typeof buildPond0xPortalObservation>[0]
  > = {}
) {
  return buildPond0xPortalObservation({
    observedAt: "2026-09-10T15:00:00.000Z",
    portalUrl,
    payAmountSol: "0.01",
    portalDisplayedReceiveAmount: "7,165,096.166",
    quote: quote(),
    observedHosts: [
      "www.pond0x.com",
      "lite-api.jup.ag",
    ],
    ...overrides,
  })
}

test("converts decimal amounts to exact base units", () => {
  assert.equal(decimalToBaseUnits("0.01", 9), "10000000")
  assert.equal(
    decimalToBaseUnits("7,311,091.356", 3),
    "7311091356"
  )
})

test("measures a reconciled Pond0x quote", () => {
  const result = observation()

  assert.equal(result.status, "MEASURED")
  assert.equal(result.payAmountBaseUnits, "10000000")
  assert.equal(
    result.portalDisplayedReceiveBaseUnits,
    "7165096166"
  )
  assert.ok(
    Math.abs((result.quoteSlippageBps ?? 0) - 50) < 0.001
  )
  assert.equal(result.portalQuoteDiscrepancyBps, 0)
  assert.deepEqual(result.blockingReasons, [])
})

test("blocks the observed portal and quote discrepancy", () => {
  const result = observation({
    portalDisplayedReceiveAmount: "7,311,091.356",
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    (result.portalQuoteDiscrepancyBps ?? 0) > 200
  )
  assert.deepEqual(
    result.blockingReasons,
    ["PONDOX_PORTAL_QUOTE_DISCREPANCY"]
  )
})

test("blocks mint and route changes", () => {
  const result = observation({
    quote: quote({
      outputMint: "replacement-mint",
      routeLabels: ["replacement-route"],
    }),
  })

  assert.equal(result.status, "BLOCKED")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_QUOTE_OUTPUT_MINT_MISMATCH"
    )
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_QUOTE_ROUTE_NOT_ALLOWED"
    )
  )
})

test("blocks unexpected network hosts", () => {
  const result = observation({
    observedHosts: [
      "www.pond0x.com",
      "lite-api.jup.ag",
      "unexpected.example",
    ],
  })

  assert.equal(result.status, "BLOCKED")
  assert.deepEqual(
    result.unexpectedHosts,
    ["unexpected.example"]
  )
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_UNEXPECTED_NETWORK_HOST"
    )
  )
})

test("records passive third-party assets without blocking", () => {
  const surface = classifyPond0xNetworkSurface({
    host: "s2.coinmarketcap.com",
    path: "/static/img/coins/64x64/1.png",
    method: "GET",
    resourceType: "image",
  })
  const result = observation({
    observedHosts: ["www.pond0x.com", surface.host],
    networkSurfaces: [surface],
  })

  assert.equal(surface.classification, "PASSIVE_ASSET")
  assert.equal(result.status, "MEASURED")
  assert.deepEqual(result.unexpectedHosts, [])
})

test("treats a Clear image as passive without trusting the app", () => {
  const surface = classifyPond0xNetworkSurface({
    host: "stable-mainnet.vercel.app",
    path: "/_next/static/media/paper.png",
    method: "GET",
    resourceType: "image",
  })

  assert.equal(surface.classification, "PASSIVE_ASSET")
})

test("treats the exact Google Fonts stylesheet as passive", () => {
  const surface = classifyPond0xNetworkSurface({
    host: "fonts.googleapis.com",
    path: "/css2",
    method: "GET",
    resourceType: "fetch",
  })

  assert.equal(surface.classification, "PASSIVE_ASSET")
})

test("hard-blocks the Clear execution surface", () => {
  const surface = classifyPond0xNetworkSurface({
    host: "stable-mainnet.vercel.app",
    path: "/swap",
    method: "GET",
    resourceType: "document",
  })
  const result = observation({
    observedHosts: ["www.pond0x.com", surface.host],
    networkSurfaces: [surface],
  })

  assert.equal(surface.classification, "DENIED_EXECUTION_HOST")
  assert.equal(result.status, "BLOCKED")
  assert.deepEqual(result.unexpectedHosts, [
    "stable-mainnet.vercel.app",
  ])
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_DENIED_EXECUTION_HOST"
    )
  )
})

test("preserves Ultra economic evidence without selecting it", () => {
  const ultra = quote({
    provider: "JUPITER_ULTRA",
    sourceHost: "ultra-api.jup.ag",
    sourcePath: "/order",
    otherAmountThreshold: null,
    swapMode: null,
    router: "jupiterz",
    feeBps: 100,
    signatureFeeLamports: "5000",
  })
  const result = observation({
    quoteCandidates: [quote(), ultra],
  })

  assert.equal(result.status, "MEASURED")
  assert.equal(result.underlyingQuote?.provider, "JUPITER_LITE")
  assert.equal(result.quoteCandidates.length, 2)
  assert.equal(result.quoteCandidates[1]?.feeBps, 100)
})

test("fails closed when the underlying quote is absent", () => {
  const result = observation({ quote: null })

  assert.equal(result.status, "UNAVAILABLE")
  assert.ok(
    result.blockingReasons.includes(
      "PONDOX_UNDERLYING_QUOTE_UNAVAILABLE"
    )
  )
  assert.equal(result.transactionRequested, false)
  assert.equal(result.walletConnected, false)
})
