import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { firefox } from "playwright"
import {
  buildPond0xPortalObservation,
  classifyPond0xNetworkSurface,
  decimalToBaseUnits,
  type Pond0xNetworkSurface,
  type Pond0xQuoteDiagnostic,
  type Pond0xUnderlyingQuote,
} from "../../src/private-alpha/pond0x-portal-observation"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

const payAmountSol =
  process.env.PONDOX_PAY_AMOUNT_SOL ?? "0.01"
const maxDiscrepancyBps = Number(
  process.env.PONDOX_MAX_DISCREPANCY_BPS ?? 25
)
const dataDirectory = resolve(
  process.env.SHADOW_DATA_DIR ?? "private-data"
)
const outputPath = resolve(
  process.env.PONDOX_OBSERVATION_OUTPUT ??
    "private-data/pond0x-portal-observation.json"
)

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {}
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null
}

function nullableIntegerString(value: unknown) {
  if (typeof value === "string" && /^\\d+$/.test(value)) return value
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  return null
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
        typeof item === "string"
      )
    : []
}

function routeLabels(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    const route = asRecord(item)
    const swapInfo = asRecord(route.swapInfo)
    const label = nullableString(swapInfo.label)
    return label ? [label] : []
  })
}

async function main() {
  const browser = await firefox.launch({ headless: true })

  try {
    const context = await browser.newContext({
      locale: "en-US",
      timezoneId: "America/Mexico_City",
    })
    const page = await context.newPage()
    const observedHosts = new Set<string>()
    const networkSurfaceMap = new Map<string, Pond0xNetworkSurface>()
    const quoteDiagnostics: Pond0xQuoteDiagnostic[] = []
    const browserUltraQuotes: Pond0xUnderlyingQuote[] = []
    const quotePromises: Array<
      Promise<Pond0xUnderlyingQuote | null>
    > = []

    await page.exposeFunction(
      "__pond0xCaptureUltraQuote",
      (value: unknown) => {
        const capture = asRecord(value)
        const payload = asRecord(capture.payload)
        const candidate: Pond0xUnderlyingQuote = {
          provider: "JUPITER_ULTRA",
          sourceHost: nullableString(capture.sourceHost) ?? "",
          sourcePath: nullableString(capture.sourcePath) ?? "",
          httpStatus: nullableNumber(capture.httpStatus) ?? 0,
          inputMint: nullableString(payload.inputMint),
          inAmount: nullableString(payload.inAmount),
          outputMint: nullableString(payload.outputMint),
          outAmount: nullableString(payload.outAmount),
          otherAmountThreshold:
            nullableString(payload.otherAmountThreshold),
          priceImpactPct:
            nullableString(payload.priceImpactPct),
          swapMode: nullableString(payload.swapMode),
          routeLabels: stringArray(payload.routeLabels),
          router: nullableString(payload.router),
          feeBps: nullableNumber(payload.feeBps),
          feeMint: nullableString(payload.feeMint),
          feeAmount: nullableIntegerString(payload.feeAmount),
          referralAccount: nullableString(payload.referralAccount),
          referralFeeBps:
            nullableNumber(payload.referralFeeBps),
          signatureFeeLamports:
            nullableIntegerString(payload.signatureFeeLamports),
          prioritizationFeeLamports:
            nullableIntegerString(payload.prioritizationFeeLamports),
          rentFeeLamports:
            nullableIntegerString(payload.rentFeeLamports),
        }

        browserUltraQuotes.splice(
          0,
          browserUltraQuotes.length,
          candidate
        )
      }
    )

    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window)
      const captureWindow = window as typeof window & {
        __pond0xCaptureUltraQuote?: (
          value: unknown
        ) => Promise<void>
      }

      window.fetch = async (...args) => {
        const response = await originalFetch(...args)

        try {
          const url = new URL(response.url)
          if (
            url.hostname === "ultra-api.jup.ag" &&
            url.pathname === "/order"
          ) {
            void response.clone().json().then((value: unknown) => {
              if (!value || typeof value !== "object") return
              const data = value as Record<string, unknown>
              const routeLabels = Array.isArray(data.routePlan)
                ? data.routePlan.flatMap((item) => {
                    if (!item || typeof item !== "object") return []
                    const route = item as Record<string, unknown>
                    const swapInfo =
                      route.swapInfo &&
                      typeof route.swapInfo === "object"
                        ? route.swapInfo as Record<string, unknown>
                        : {}
                    return typeof swapInfo.label === "string"
                      ? [swapInfo.label]
                      : []
                  })
                : []

              return captureWindow.__pond0xCaptureUltraQuote?.({
                sourceHost: url.hostname,
                sourcePath: url.pathname,
                httpStatus: response.status,
                payload: {
                  inputMint: data.inputMint,
                  inAmount: data.inAmount,
                  outputMint: data.outputMint,
                  outAmount: data.outAmount,
                  otherAmountThreshold:
                    data.otherAmountThreshold,
                  priceImpactPct:
                    data.priceImpactPct ?? data.priceImpact,
                  swapMode: data.swapMode,
                  routeLabels,
                  router: data.router,
                  feeBps: data.feeBps,
                  feeMint: data.feeMint,
                  feeAmount: data.feeAmount,
                  referralAccount:
                    url.searchParams.get("referralAccount"),
                  referralFeeBps: Number(
                    url.searchParams.get("referralFee")
                  ),
                  signatureFeeLamports:
                    data.signatureFeeLamports,
                  prioritizationFeeLamports:
                    data.prioritizationFeeLamports,
                  rentFeeLamports: data.rentFeeLamports,
                },
              })
            }).catch(() => undefined)
          }
        } catch {
          // The original portal response remains untouched.
        }

        return response
      }
    })

    page.on("request", (request) => {
      try {
        const url = new URL(request.url())
        observedHosts.add(url.hostname)
        const surface = classifyPond0xNetworkSurface({
          host: url.hostname,
          path: url.pathname,
          method: request.method(),
          resourceType: request.resourceType(),
        })
        const key = [
          surface.host,
          surface.path,
          surface.method,
          surface.resourceType,
        ].join("|")
        networkSurfaceMap.set(key, surface)
      } catch {
        // Non-HTTP browser requests are irrelevant.
      }
    })

    page.on("response", (response) => {
      let url: URL
      try {
        url = new URL(response.url())
      } catch {
        return
      }

      const isLite =
        url.hostname === "lite-api.jup.ag" &&
        url.pathname === "/swap/v1/quote"
      const isUltra =
        url.hostname === "ultra-api.jup.ag" &&
        url.pathname === "/order"

      if (!isLite && !isUltra) return

      const diagnostic: Pond0xQuoteDiagnostic = {
        provider: isLite ? "JUPITER_LITE" : "JUPITER_ULTRA",
        sourceHost: url.hostname,
        sourcePath: url.pathname,
        observedAt: new Date().toISOString(),
        httpStatus: response.status(),
        contentType: response.headers()["content-type"] ?? null,
        requestInputMint: url.searchParams.get("inputMint"),
        requestOutputMint: url.searchParams.get("outputMint"),
        requestAmount: url.searchParams.get("amount"),
        requestReferralAccount:
          url.searchParams.get("referralAccount"),
        requestReferralFeeBps: Number.isFinite(Number(
          url.searchParams.get("referralFee")
        ))
          ? Number(url.searchParams.get("referralFee"))
          : null,
        parsed: false,
        failureReason: null,
      }
      quoteDiagnostics.push(diagnostic)

      quotePromises.push((async () => {
        try {
          const payload = asRecord(await response.json())
          diagnostic.parsed = true
          return {
            provider: isLite ? "JUPITER_LITE" : "JUPITER_ULTRA",
            sourceHost: url.hostname,
            sourcePath: url.pathname,
            httpStatus: response.status(),
            inputMint: nullableString(payload.inputMint),
            inAmount: nullableString(payload.inAmount),
            outputMint: nullableString(payload.outputMint),
            outAmount: nullableString(payload.outAmount),
            otherAmountThreshold:
              nullableString(payload.otherAmountThreshold),
            priceImpactPct:
              nullableString(payload.priceImpactPct),
            swapMode: nullableString(payload.swapMode),
            routeLabels: routeLabels(payload.routePlan),
            router: nullableString(payload.router),
            feeBps: nullableNumber(payload.feeBps),
            feeMint: nullableString(payload.feeMint),
            feeAmount: nullableIntegerString(payload.feeAmount),
            referralAccount:
              url.searchParams.get("referralAccount"),
            referralFeeBps: Number.isFinite(Number(
              url.searchParams.get("referralFee")
            ))
              ? Number(url.searchParams.get("referralFee"))
              : null,
            signatureFeeLamports:
              nullableIntegerString(payload.signatureFeeLamports),
            prioritizationFeeLamports:
              nullableIntegerString(payload.prioritizationFeeLamports),
            rentFeeLamports:
              nullableIntegerString(payload.rentFeeLamports),
          }
        } catch {
          diagnostic.failureReason = "RESPONSE_JSON_UNAVAILABLE"
          return null
        }
      })())
    })

    const target = new URL(
      "/swap/solana",
      "https://www.pond0x.com"
    )
    target.searchParams.set("sell", WRAPPED_SOL_MINT)
    target.searchParams.set("buy", WPOND_MINT)

    await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    })
    await page.waitForTimeout(5_000)

    const payInput = page
      .locator('input[placeholder="0.00"]:not([disabled])')
      .first()

    if (await payInput.count() === 0) {
      throw new Error("Pond0x pay input unavailable")
    }

    await payInput.fill(payAmountSol)

    const receiveInputs = page.locator(
      'input[placeholder="0.00"][disabled]'
    )

    await page.waitForFunction(() => {
      const elements = Array.from(
        document.querySelectorAll(
          'input[placeholder="0.00"][disabled]'
        )
      )
      return elements.some(
        (element) =>
          element instanceof HTMLInputElement &&
          element.value.trim().length > 0
      )
    }, undefined, { timeout: 30_000 }).catch(() => undefined)
    await page.waitForTimeout(5_000)

    const receiveValues = await receiveInputs.evaluateAll(
      (elements) =>
        elements.flatMap((element) => {
          if (
            element instanceof HTMLInputElement &&
            element.value.trim().length > 0
          ) {
            return [element.value]
          }
          return []
        })
    )
    const portalDisplayedReceiveAmount =
      receiveValues.at(-1) ?? null
    const portalDisplayedAt = new Date().toISOString()
    const networkQuotes = (
      await Promise.all(quotePromises)
    ).filter(
      (quote): quote is Pond0xUnderlyingQuote =>
        quote !== null
    )
    const quotes = [
      ...networkQuotes,
      ...browserUltraQuotes,
    ]
    const payAmountBaseUnits =
      decimalToBaseUnits(payAmountSol, 9)
    const matchingQuotes = [...quotes].reverse().filter(
      (candidate) =>
        candidate.inputMint === WRAPPED_SOL_MINT &&
        candidate.outputMint === WPOND_MINT &&
        candidate.inAmount === payAmountBaseUnits
    )
    const ultraQuote = matchingQuotes.find(
      (candidate) => candidate.provider === "JUPITER_ULTRA"
    ) ?? null
    const liteQuote = matchingQuotes.find(
      (candidate) => candidate.provider === "JUPITER_LITE"
    ) ?? null
    const quote = ultraQuote ?? liteQuote
    const benchmarkQuote = ultraQuote ? liteQuote : null

    const observedAt = new Date().toISOString()
    const observation = buildPond0xPortalObservation({
      observedAt,
      portalUrl: page.url(),
      payAmountSol,
      portalDisplayedReceiveAmount,
      portalDisplayedAt,
      quote,
      benchmarkQuote,
      quoteCandidates: quotes,
      quoteDiagnostics,
      observedHosts: [...observedHosts],
      networkSurfaces: [...networkSurfaceMap.values()],
      maxPortalDiscrepancyBps: maxDiscrepancyBps,
    })
    const archivePath = resolve(
      dataDirectory,
      "pond0x-observations",
      `${observedAt.replace(/[^0-9A-Za-z]/g, "")}.json`
    )
    const serialized = JSON.stringify(observation, null, 2)

    await mkdir(dirname(archivePath), { recursive: true })
    await writeFile(archivePath, serialized, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    })
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, serialized, {
      encoding: "utf8",
      mode: 0o600,
    })

    console.log(JSON.stringify({
      simulationOnly: true,
      walletConnected: false,
      transactionRequested: false,
      status: observation.status,
      payAmountSol: observation.payAmount,
      portalDisplayedReceiveAmount:
        observation.portalDisplayedReceiveAmount,
      underlyingOutAmountBaseUnits:
        observation.underlyingQuote?.outAmount ?? null,
      portalDisplayedAt: observation.portalDisplayedAt,
      quoteCandidates: observation.quoteCandidates.map((candidate) => ({
        provider: candidate.provider,
        outAmount: candidate.outAmount,
        otherAmountThreshold: candidate.otherAmountThreshold,
        priceImpactPct: candidate.priceImpactPct,
        router: candidate.router,
        feeBps: candidate.feeBps,
        feeMint: candidate.feeMint,
        feeAmount: candidate.feeAmount,
        referralAccount: candidate.referralAccount,
        referralFeeBps: candidate.referralFeeBps,
        signatureFeeLamports: candidate.signatureFeeLamports,
        prioritizationFeeLamports:
          candidate.prioritizationFeeLamports,
        rentFeeLamports: candidate.rentFeeLamports,
        routeLabels: candidate.routeLabels,
      })),
      quoteDiagnostics: observation.quoteDiagnostics,
      networkSurfaceSummary: Object.fromEntries(
        [...new Set(
          observation.networkSurfaces.map(
            (surface) => surface.classification
          )
        )].map((classification) => [
          classification,
          observation.networkSurfaces.filter(
            (surface) =>
              surface.classification === classification
          ).length,
        ])
      ),
      selectedPortalProvider:
        observation.underlyingQuote?.provider ?? null,
      benchmarkProvider:
        observation.benchmarkQuote?.provider ?? null,
      quoteSlippageBps: observation.quoteSlippageBps,
      portalQuoteDiscrepancyBps:
        observation.portalQuoteDiscrepancyBps,
      portalBenchmarkDifferenceBps:
        observation.portalBenchmarkDifferenceBps,
      declaredFeeBps: observation.declaredFeeBps,
      routeLabels:
        observation.underlyingQuote?.routeLabels ?? [],
      blockingReasons: observation.blockingReasons,
      outputPath,
      archivePath,
    }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Pond0x portal observation failed"
  )
  process.exitCode = 1
})
