import type { QuoteLeg } from "./size-aware-quote"

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>

type CommonQuoteRequest = {
  inputToken: string
  outputToken: string
  inputAmountBaseUnits: string
  inputDecimals: number
  outputDecimals: number
  estimatedFeeUsd: number
}

export type JupiterQuoteRequest = CommonQuoteRequest & {
  apiKey?: string
}

export type ZeroXPriceRequest = CommonQuoteRequest & {
  apiKey: string
  takerAddress: string
  nativeTokenPriceUsd: number
}

const JUPITER_KEYLESS_URL =
  "https://lite-api.jup.ag/swap/v1/quote"
const JUPITER_API_URL =
  "https://api.jup.ag/swap/v1/quote"
const ZERO_X_PRICE_URL =
  "https://api.0x.org/swap/allowance-holder/price"

function positiveIntegerString(value: string, name: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive base-unit integer`)
  }
}

function decimals(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0 || value > 30) {
    throw new Error(`${name} must be an integer from 0 to 30`)
  }
}

function nonNegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be non-negative`)
  }
}

function tokenIdentifier(value: string, name: string) {
  if (!value.trim() || value.length > 128) {
    throw new Error(`${name} is invalid`)
  }
}

function humanUnits(raw: string, tokenDecimals: number) {
  positiveIntegerString(raw, "quote amount")
  const amount = Number(raw) / 10 ** tokenDecimals
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("quote amount cannot be represented safely")
  }
  return amount
}

function routeId(
  provider: "jupiter" | "0x",
  labels: ReadonlyArray<string>
) {
  const normalized = labels
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(">")

  return `${provider}:${normalized || "unreported"}`
}

function validateCommon(request: CommonQuoteRequest) {
  tokenIdentifier(request.inputToken, "inputToken")
  tokenIdentifier(request.outputToken, "outputToken")
  if (request.inputToken === request.outputToken) {
    throw new Error("inputToken and outputToken must differ")
  }
  positiveIntegerString(
    request.inputAmountBaseUnits,
    "inputAmountBaseUnits"
  )
  decimals(request.inputDecimals, "inputDecimals")
  decimals(request.outputDecimals, "outputDecimals")
  nonNegative(request.estimatedFeeUsd, "estimatedFeeUsd")
}

async function getJson(
  fetcher: FetchLike,
  url: URL,
  headers: Record<string, string>
) {
  const response = await fetcher(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`quote provider returned HTTP ${response.status}`)
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("quote provider returned non-JSON content")
  }

  return response.json() as Promise<Record<string, unknown>>
}

export async function readJupiterQuote(
  request: JupiterQuoteRequest,
  fetcher: FetchLike = fetch
): Promise<QuoteLeg> {
  validateCommon(request)

  const url = new URL(
    request.apiKey ? JUPITER_API_URL : JUPITER_KEYLESS_URL
  )
  url.searchParams.set("inputMint", request.inputToken)
  url.searchParams.set("outputMint", request.outputToken)
  url.searchParams.set("amount", request.inputAmountBaseUnits)
  url.searchParams.set("swapMode", "ExactIn")
  url.searchParams.set("restrictIntermediateTokens", "true")

  const payload = await getJson(
    fetcher,
    url,
    request.apiKey
      ? { "x-api-key": request.apiKey }
      : {}
  )
  const inputAmount = String(payload.inAmount ?? "")
  const outputAmount = String(payload.outAmount ?? "")
  const routePlan = Array.isArray(payload.routePlan)
    ? payload.routePlan
    : []
  const labels = routePlan.map((step) => {
    if (!step || typeof step !== "object") return ""
    const swapInfo = (step as { swapInfo?: unknown }).swapInfo
    if (!swapInfo || typeof swapInfo !== "object") return ""
    const value = (swapInfo as { label?: unknown }).label
    return typeof value === "string" ? value : ""
  })

  if (inputAmount !== request.inputAmountBaseUnits) {
    throw new Error("Jupiter returned a different input amount")
  }

  return {
    routeId: routeId("jupiter", labels),
    inputAmount: humanUnits(inputAmount, request.inputDecimals),
    outputAmount: humanUnits(
      outputAmount,
      request.outputDecimals
    ),
    estimatedFeeUsd: request.estimatedFeeUsd,
  }
}

export async function readZeroXPrice(
  request: ZeroXPriceRequest,
  fetcher: FetchLike = fetch
): Promise<QuoteLeg> {
  validateCommon(request)
  if (!request.apiKey.trim()) {
    throw new Error("0x API key is required")
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(request.takerAddress)) {
    throw new Error("takerAddress must be an EVM address")
  }
  nonNegative(
    request.nativeTokenPriceUsd,
    "nativeTokenPriceUsd"
  )

  const url = new URL(ZERO_X_PRICE_URL)
  url.searchParams.set("chainId", "1")
  url.searchParams.set("sellToken", request.inputToken)
  url.searchParams.set("buyToken", request.outputToken)
  url.searchParams.set("sellAmount", request.inputAmountBaseUnits)
  url.searchParams.set("taker", request.takerAddress)

  const payload = await getJson(fetcher, url, {
    "0x-api-key": request.apiKey,
    "0x-version": "v2",
  })
  const inputAmount = String(payload.sellAmount ?? "")
  const outputAmount = String(payload.buyAmount ?? "")
  const route = payload.route
  const fills =
    route && typeof route === "object" &&
    Array.isArray((route as { fills?: unknown }).fills)
      ? (route as { fills: unknown[] }).fills
      : []
  const labels = fills.map((fill) => {
    if (!fill || typeof fill !== "object") return ""
    const value = (fill as { source?: unknown }).source
    return typeof value === "string" ? value : ""
  })

  if (inputAmount !== request.inputAmountBaseUnits) {
    throw new Error("0x returned a different input amount")
  }

  const gas = String(payload.gas ?? "0")
  const gasPrice = String(payload.gasPrice ?? "0")
  if (!/^\d+$/.test(gas) || !/^\d+$/.test(gasPrice)) {
    throw new Error("0x returned invalid gas estimates")
  }
  const gasFeeNative =
    Number(BigInt(gas) * BigInt(gasPrice)) / 1e18
  const gasFeeUsd =
    gasFeeNative * request.nativeTokenPriceUsd

  return {
    routeId: routeId("0x", labels),
    inputAmount: humanUnits(inputAmount, request.inputDecimals),
    outputAmount: humanUnits(
      outputAmount,
      request.outputDecimals
    ),
    estimatedFeeUsd:
      request.estimatedFeeUsd + gasFeeUsd,
  }
}
