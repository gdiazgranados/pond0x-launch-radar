import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "./wpond-quote-observer"

export const PONDOX_PORTAL_ORIGIN = "https://www.pond0x.com"
export const PONDOX_SOLANA_SWAP_PATH = "/swap/solana"

export const PONDOX_OBSERVER_ALLOWED_HOSTS = [
  "www.pond0x.com",
  "api.web3modal.org",
  "pulse.walletconnect.org",
  "mm-sdk-analytics.api.cx.metamask.io",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "plugin.jup.ag",
  "datapi.jup.ag",
  "lite-api.jup.ag",
  "ultra-api.jup.ag",
  "mainnet.helius-rpc.com",
  "jup.ag",
] as const

export type Pond0xPortalObservationStatus =
  | "MEASURED"
  | "BLOCKED"
  | "UNAVAILABLE"

export type Pond0xUnderlyingQuote = {
  provider: "JUPITER_LITE" | "JUPITER_ULTRA"
  sourceHost: string
  sourcePath: string
  httpStatus: number
  inputMint: string | null
  inAmount: string | null
  outputMint: string | null
  outAmount: string | null
  otherAmountThreshold: string | null
  priceImpactPct: string | null
  swapMode: string | null
  routeLabels: ReadonlyArray<string>
  router: string | null
  feeBps: number | null
  feeMint: string | null
  feeAmount: string | null
  referralAccount: string | null
  referralFeeBps: number | null
  signatureFeeLamports: string | null
  prioritizationFeeLamports: string | null
  rentFeeLamports: string | null
}

export type Pond0xNetworkSurfaceClassification =
  | "PONDOX_PORTAL"
  | "QUOTE_API"
  | "RPC"
  | "WALLET_INFRASTRUCTURE"
  | "PASSIVE_ASSET"
  | "DENIED_EXECUTION_HOST"
  | "UNKNOWN_ACTIVE"

export type Pond0xNetworkSurface = {
  host: string
  path: string
  method: string
  resourceType: string
  classification: Pond0xNetworkSurfaceClassification
}

const passiveResourceTypes = new Set([
  "font",
  "image",
  "media",
  "stylesheet",
])

export function classifyPond0xNetworkSurface(input: {
  host: string
  path: string
  method: string
  resourceType: string
}): Pond0xNetworkSurface {
  let classification: Pond0xNetworkSurfaceClassification

  if (
    passiveResourceTypes.has(input.resourceType) ||
    (
      input.host === "fonts.googleapis.com" &&
      input.method === "GET" &&
      input.path === "/css2"
    )
  ) {
    classification = "PASSIVE_ASSET"
  } else if (input.host === "stable-mainnet.vercel.app") {
    classification = "DENIED_EXECUTION_HOST"
  } else if (input.host === "www.pond0x.com") {
    classification = "PONDOX_PORTAL"
  } else if (
    input.host === "lite-api.jup.ag" ||
    input.host === "ultra-api.jup.ag" ||
    input.host === "datapi.jup.ag" ||
    input.host === "plugin.jup.ag" ||
    input.host === "jup.ag"
  ) {
    classification = "QUOTE_API"
  } else if (input.host === "mainnet.helius-rpc.com") {
    classification = "RPC"
  } else if (
    input.host === "api.web3modal.org" ||
    input.host === "pulse.walletconnect.org" ||
    input.host === "mm-sdk-analytics.api.cx.metamask.io"
  ) {
    classification = "WALLET_INFRASTRUCTURE"
  } else {
    classification = "UNKNOWN_ACTIVE"
  }

  return { ...input, classification }
}

export type Pond0xQuoteDiagnostic = {
  provider: "JUPITER_LITE" | "JUPITER_ULTRA"
  sourceHost: string
  sourcePath: string
  observedAt: string
  httpStatus: number | null
  contentType: string | null
  requestInputMint: string | null
  requestOutputMint: string | null
  requestAmount: string | null
  requestReferralAccount: string | null
  requestReferralFeeBps: number | null
  parsed: boolean
  failureReason: string | null
}

export type Pond0xPortalObservation = {
  schemaVersion: 1
  simulationOnly: true
  walletConnected: false
  transactionRequested: false
  observedAt: string
  status: Pond0xPortalObservationStatus
  portalUrl: string
  payToken: "SOL"
  receiveToken: "wPOND"
  payAmount: string
  payAmountBaseUnits: string
  portalDisplayedReceiveAmount: string | null
  portalDisplayedAt: string | null
  portalDisplayedReceiveBaseUnits: string | null
  underlyingQuote: Pond0xUnderlyingQuote | null
  benchmarkQuote: Pond0xUnderlyingQuote | null
  quoteCandidates: ReadonlyArray<Pond0xUnderlyingQuote>
  quoteDiagnostics: ReadonlyArray<Pond0xQuoteDiagnostic>
  quoteSlippageBps: number | null
  portalQuoteDiscrepancyBps: number | null
  portalBenchmarkDifferenceBps: number | null
  declaredFeeBps: number | null
  observedHosts: ReadonlyArray<string>
  networkSurfaces: ReadonlyArray<Pond0xNetworkSurface>
  unexpectedHosts: ReadonlyArray<string>
  blockingReasons: ReadonlyArray<string>
  source: "PONDOX_FIREFOX_UI_AND_JUPITER_NETWORK"
}

function positiveInteger(value: string | null): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
}

export function decimalToBaseUnits(
  value: string,
  decimals: number
): string {
  const normalized = value.replace(/,/g, "").trim()
  const match = normalized.match(/^(0|[1-9]\d*)(?:\.(\d+))?$/)
  if (!match) throw new Error("amount must be a non-negative decimal")

  const fraction = match[2] ?? ""
  if (fraction.length > decimals) {
    throw new Error("amount exceeds supported decimals")
  }

  const combined =
    `${match[1]}${fraction.padEnd(decimals, "0")}`
      .replace(/^0+(?=\d)/, "")

  return combined || "0"
}

function ratioBps(
  difference: bigint,
  denominator: bigint
): number {
  if (denominator <= BigInt(0)) {
    throw new Error("ratio denominator must be positive")
  }

  const negative = difference < BigInt(0)
  const absolute = negative ? -difference : difference
  const scaled = Number(
    (absolute * BigInt(100_000_000)) / denominator
  ) / 10_000

  return negative ? -scaled : scaled
}

function uniqueSorted(values: ReadonlyArray<string>) {
  return [...new Set(values.filter(Boolean))].sort()
}

export function buildPond0xPortalObservation(input: {
  observedAt: string
  portalUrl: string
  payAmountSol: string
  portalDisplayedReceiveAmount: string | null
  portalDisplayedAt?: string | null
  quote: Pond0xUnderlyingQuote | null
  benchmarkQuote?: Pond0xUnderlyingQuote | null
  quoteCandidates?: ReadonlyArray<Pond0xUnderlyingQuote>
  quoteDiagnostics?: ReadonlyArray<Pond0xQuoteDiagnostic>
  observedHosts: ReadonlyArray<string>
  networkSurfaces?: ReadonlyArray<Pond0xNetworkSurface>
  maxPortalDiscrepancyBps?: number
}): Pond0xPortalObservation {
  const blockingReasons: string[] = []
  const maxPortalDiscrepancyBps =
    input.maxPortalDiscrepancyBps ?? 25

  if (
    !Number.isFinite(maxPortalDiscrepancyBps) ||
    maxPortalDiscrepancyBps < 0
  ) {
    throw new Error(
      "maxPortalDiscrepancyBps must be non-negative"
    )
  }

  const portal = new URL(input.portalUrl)
  if (
    portal.origin !== PONDOX_PORTAL_ORIGIN ||
    portal.pathname !== PONDOX_SOLANA_SWAP_PATH
  ) {
    blockingReasons.push("PONDOX_PORTAL_URL_MISMATCH")
  }
  if (portal.searchParams.get("sell") !== WRAPPED_SOL_MINT) {
    blockingReasons.push("PONDOX_SELL_MINT_MISMATCH")
  }
  if (portal.searchParams.get("buy") !== WPOND_MINT) {
    blockingReasons.push("PONDOX_BUY_MINT_MISMATCH")
  }

  const payAmountBaseUnits = decimalToBaseUnits(
    input.payAmountSol,
    9
  )
  if (payAmountBaseUnits === "0") {
    throw new Error("payAmountSol must be positive")
  }

  const observedHosts = uniqueSorted(input.observedHosts)
  const allowedHosts = new Set<string>(
    PONDOX_OBSERVER_ALLOWED_HOSTS
  )
  const networkSurfaces = input.networkSurfaces ?? []
  const deniedExecutionHosts = uniqueSorted(
    networkSurfaces
      .filter((surface) =>
        surface.classification === "DENIED_EXECUTION_HOST"
      )
      .map((surface) => surface.host)
  )
  const unknownActiveHosts = uniqueSorted(
    networkSurfaces
      .filter((surface) =>
        surface.classification === "UNKNOWN_ACTIVE"
      )
      .map((surface) => surface.host)
  )
  const legacyUnexpectedHosts = networkSurfaces.length === 0
    ? observedHosts.filter((host) => !allowedHosts.has(host))
    : []
  const unexpectedHosts = uniqueSorted([
    ...deniedExecutionHosts,
    ...unknownActiveHosts,
    ...legacyUnexpectedHosts,
  ])
  if (deniedExecutionHosts.length > 0) {
    blockingReasons.push("PONDOX_DENIED_EXECUTION_HOST")
  }
  if (unknownActiveHosts.length > 0 || legacyUnexpectedHosts.length > 0) {
    blockingReasons.push("PONDOX_UNEXPECTED_NETWORK_HOST")
  }

  let displayedBaseUnits: string | null = null
  if (input.portalDisplayedReceiveAmount) {
    try {
      displayedBaseUnits = decimalToBaseUnits(
        input.portalDisplayedReceiveAmount,
        3
      )
      if (displayedBaseUnits === "0") {
        blockingReasons.push("PONDOX_DISPLAYED_OUTPUT_INVALID")
      }
    } catch {
      blockingReasons.push("PONDOX_DISPLAYED_OUTPUT_INVALID")
    }
  } else {
    blockingReasons.push("PONDOX_DISPLAYED_OUTPUT_UNAVAILABLE")
  }

  const quote = input.quote
  if (!quote) {
    return {
      schemaVersion: 1,
      simulationOnly: true,
      walletConnected: false,
      transactionRequested: false,
      observedAt: input.observedAt,
      status: "UNAVAILABLE",
      portalUrl: input.portalUrl,
      payToken: "SOL",
      receiveToken: "wPOND",
      payAmount: input.payAmountSol,
      payAmountBaseUnits,
      portalDisplayedReceiveAmount:
        input.portalDisplayedReceiveAmount,
      portalDisplayedAt: input.portalDisplayedAt ?? null,
      portalDisplayedReceiveBaseUnits: displayedBaseUnits,
      underlyingQuote: null,
      benchmarkQuote: input.benchmarkQuote ?? null,
      quoteCandidates: input.quoteCandidates ?? [],
      quoteDiagnostics: input.quoteDiagnostics ?? [],
      quoteSlippageBps: null,
      portalQuoteDiscrepancyBps: null,
      portalBenchmarkDifferenceBps: null,
      declaredFeeBps: null,
      observedHosts,
      networkSurfaces,
      unexpectedHosts,
      blockingReasons: [
        ...new Set([
          ...blockingReasons,
          "PONDOX_UNDERLYING_QUOTE_UNAVAILABLE",
        ]),
      ],
      source:
        "PONDOX_FIREFOX_UI_AND_JUPITER_NETWORK",
    }
  }

  const validLiteSource =
    quote.provider === "JUPITER_LITE" &&
    quote.sourceHost === "lite-api.jup.ag" &&
    quote.sourcePath === "/swap/v1/quote"
  const validUltraSource =
    quote.provider === "JUPITER_ULTRA" &&
    quote.sourceHost === "ultra-api.jup.ag" &&
    quote.sourcePath === "/order"

  if (
    (!validLiteSource && !validUltraSource) ||
    quote.httpStatus !== 200
  ) {
    blockingReasons.push("PONDOX_QUOTE_SOURCE_INVALID")
  }
  if (quote.inputMint !== WRAPPED_SOL_MINT) {
    blockingReasons.push("PONDOX_QUOTE_INPUT_MINT_MISMATCH")
  }
  if (quote.outputMint !== WPOND_MINT) {
    blockingReasons.push("PONDOX_QUOTE_OUTPUT_MINT_MISMATCH")
  }
  if (quote.inAmount !== payAmountBaseUnits) {
    blockingReasons.push("PONDOX_QUOTE_INPUT_AMOUNT_MISMATCH")
  }
  if (
    quote.swapMode !== "ExactIn" &&
    !(quote.provider === "JUPITER_ULTRA" && quote.swapMode === null)
  ) {
    blockingReasons.push("PONDOX_QUOTE_MODE_MISMATCH")
  }
  if (
    quote.routeLabels.length === 0 ||
    quote.routeLabels.some(
      (label) => label !== "Raydium CLMM"
    )
  ) {
    blockingReasons.push("PONDOX_QUOTE_ROUTE_NOT_ALLOWED")
  }
  if (!positiveInteger(quote.outAmount)) {
    blockingReasons.push("PONDOX_QUOTE_OUTPUT_INVALID")
  }
  if (!positiveInteger(quote.otherAmountThreshold)) {
    blockingReasons.push("PONDOX_QUOTE_THRESHOLD_INVALID")
  }

  let quoteSlippageBps: number | null = null
  if (
    positiveInteger(quote.outAmount) &&
    positiveInteger(quote.otherAmountThreshold)
  ) {
    const outAmount = BigInt(quote.outAmount)
    const threshold = BigInt(quote.otherAmountThreshold)
    if (threshold > outAmount) {
      blockingReasons.push("PONDOX_QUOTE_THRESHOLD_INVALID")
    } else {
      quoteSlippageBps = ratioBps(
        outAmount - threshold,
        outAmount
      )
    }
  }

  let portalQuoteDiscrepancyBps: number | null = null
  if (
    displayedBaseUnits &&
    positiveInteger(quote.outAmount)
  ) {
    portalQuoteDiscrepancyBps = ratioBps(
      BigInt(displayedBaseUnits) - BigInt(quote.outAmount),
      BigInt(quote.outAmount)
    )
    if (
      Math.abs(portalQuoteDiscrepancyBps) >
      maxPortalDiscrepancyBps
    ) {
      blockingReasons.push(
        "PONDOX_PORTAL_QUOTE_DISCREPANCY"
      )
    }
  }

  let portalBenchmarkDifferenceBps: number | null = null
  const benchmarkOutAmount =
    input.benchmarkQuote?.outAmount ?? null
  if (
    positiveInteger(quote.outAmount) &&
    positiveInteger(benchmarkOutAmount)
  ) {
    portalBenchmarkDifferenceBps = ratioBps(
      BigInt(quote.outAmount) - BigInt(benchmarkOutAmount),
      BigInt(benchmarkOutAmount)
    )
  }

  const uniqueReasons = [...new Set(blockingReasons)]

  return {
    schemaVersion: 1,
    simulationOnly: true,
    walletConnected: false,
    transactionRequested: false,
    observedAt: input.observedAt,
    status:
      uniqueReasons.length === 0 ? "MEASURED" : "BLOCKED",
    portalUrl: input.portalUrl,
    payToken: "SOL",
    receiveToken: "wPOND",
    payAmount: input.payAmountSol,
    payAmountBaseUnits,
    portalDisplayedReceiveAmount:
      input.portalDisplayedReceiveAmount,
    portalDisplayedAt: input.portalDisplayedAt ?? null,
    portalDisplayedReceiveBaseUnits: displayedBaseUnits,
    underlyingQuote: quote,
    benchmarkQuote: input.benchmarkQuote ?? null,
    quoteCandidates: input.quoteCandidates ?? [quote],
    quoteDiagnostics: input.quoteDiagnostics ?? [],
    quoteSlippageBps,
    portalQuoteDiscrepancyBps,
    portalBenchmarkDifferenceBps,
    declaredFeeBps: quote.feeBps,
    observedHosts,
    networkSurfaces,
    unexpectedHosts,
    blockingReasons: uniqueReasons,
    source: "PONDOX_FIREFOX_UI_AND_JUPITER_NETWORK",
  }
}
