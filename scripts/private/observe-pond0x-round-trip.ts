import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { firefox, type Page } from "playwright"
import {
  classifyPond0xNetworkSurface,
  decimalToBaseUnits,
  type Pond0xNetworkSurface,
  type Pond0xUnderlyingQuote,
} from "../../src/private-alpha/pond0x-portal-observation"
import {
  evaluatePond0xRoundTripEconomics,
  type Pond0xRoundTripQuoteLeg,
} from "../../src/private-alpha/pond0x-round-trip-economics"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

const payAmountSol =
  process.env.PONDOX_PAY_AMOUNT_SOL ?? "0.01"
const outputPath = resolve(
  process.env.PONDOX_ROUND_TRIP_OUTPUT ??
    "private-data/pond0x-round-trip-economics.json"
)
const dataDirectory = resolve(
  process.env.SHADOW_DATA_DIR ?? "private-data"
)

type CapturedQuote = {
  observedAt: string
  quote: Pond0xUnderlyingQuote
}

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
  if (typeof value === "string" && /^\d+$/.test(value)) return value
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
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

function baseUnitsToDecimal(value: string, decimals: number) {
  if (!/^\d+$/.test(value)) {
    throw new Error("base-unit amount is invalid")
  }
  const padded = value.padStart(decimals + 1, "0")
  const whole = padded.slice(0, -decimals) || "0"
  const fraction = decimals === 0
    ? ""
    : padded.slice(-decimals).replace(/0+$/, "")
  return fraction ? whole + "." + fraction : whole
}

async function displayedOutput(page: Page) {
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

  const values = await receiveInputs.evaluateAll(
    (elements) =>
      elements.flatMap((element) =>
        element instanceof HTMLInputElement &&
        element.value.trim().length > 0
          ? [element.value]
          : []
      )
  )
  return values.at(-1) ?? null
}

async function main() {
  const browser = await firefox.launch({ headless: true })

  try {
    const context = await browser.newContext({
      locale: "en-US",
      timezoneId: "America/Mexico_City",
    })
    const page = await context.newPage()
    const captures: CapturedQuote[] = []
    const surfaceMap = new Map<string, Pond0xNetworkSurface>()

    await page.exposeFunction(
      "__pond0xCaptureRoundTripQuote",
      (value: unknown) => {
        const capture = asRecord(value)
        const payload = asRecord(capture.payload)
        captures.push({
          observedAt: new Date().toISOString(),
          quote: {
            provider: "JUPITER_ULTRA",
            sourceHost:
              nullableString(capture.sourceHost) ?? "",
            sourcePath:
              nullableString(capture.sourcePath) ?? "",
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
            referralAccount:
              nullableString(payload.referralAccount),
            referralFeeBps:
              nullableNumber(payload.referralFeeBps),
            signatureFeeLamports:
              nullableIntegerString(
                payload.signatureFeeLamports
              ),
            prioritizationFeeLamports:
              nullableIntegerString(
                payload.prioritizationFeeLamports
              ),
            rentFeeLamports:
              nullableIntegerString(payload.rentFeeLamports),
          },
        })
      }
    )

    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window)
      const captureWindow = window as typeof window & {
        __pond0xCaptureRoundTripQuote?: (
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

              return captureWindow
                .__pond0xCaptureRoundTripQuote?.({
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
                    referralFeeBps:
                      url.searchParams.has("referralFee") &&
                      Number.isFinite(Number(
                        url.searchParams.get("referralFee")
                      ))
                        ? Number(
                            url.searchParams.get("referralFee")
                          )
                        : null,
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
          // Preserve the original portal response.
        }
        return response
      }
    })

    page.on("request", (request) => {
      try {
        const url = new URL(request.url())
        const surface = classifyPond0xNetworkSurface({
          host: url.hostname,
          path: url.pathname,
          method: request.method(),
          resourceType: request.resourceType(),
        })
        surfaceMap.set(
          [
            surface.host,
            surface.path,
            surface.method,
            surface.resourceType,
          ].join("|"),
          surface
        )
      } catch {
        // Ignore non-HTTP browser requests.
      }
    })

    async function observeLeg(input: {
      inputMint: string
      outputMint: string
      amountDecimal: string
      inputDecimals: number
      outputDecimals: number
    }): Promise<Pond0xRoundTripQuoteLeg> {
      const startCaptureIndex = captures.length
      const target = new URL(
        "/swap/solana",
        "https://www.pond0x.com"
      )
      target.searchParams.set("sell", input.inputMint)
      target.searchParams.set("buy", input.outputMint)

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

      await payInput.fill(input.amountDecimal)
      const displayed = await displayedOutput(page)
      const displayedBaseUnits = displayed
        ? decimalToBaseUnits(displayed, input.outputDecimals)
        : null
      const inputBaseUnits = decimalToBaseUnits(
        input.amountDecimal,
        input.inputDecimals
      )
      const quote = captures
        .slice(startCaptureIndex)
        .reverse()
        .find((candidate) =>
          candidate.quote.inputMint === input.inputMint &&
          candidate.quote.outputMint === input.outputMint &&
          candidate.quote.inAmount === inputBaseUnits
        ) ?? null

      return {
        observedAt:
          quote?.observedAt ?? new Date().toISOString(),
        portalDisplayedAmountBaseUnits: displayedBaseUnits,
        quote: quote?.quote ?? null,
      }
    }

    const entry = await observeLeg({
      inputMint: WRAPPED_SOL_MINT,
      outputMint: WPOND_MINT,
      amountDecimal: payAmountSol,
      inputDecimals: 9,
      outputDecimals: 3,
    })
    const acquired = entry.quote?.outAmount
    const exit = acquired
      ? await observeLeg({
          inputMint: WPOND_MINT,
          outputMint: WRAPPED_SOL_MINT,
          amountDecimal: baseUnitsToDecimal(acquired, 3),
          inputDecimals: 3,
          outputDecimals: 9,
        })
      : {
          observedAt: new Date().toISOString(),
          portalDisplayedAmountBaseUnits: null,
          quote: null,
        }

    const unsafeSurfaces = [...surfaceMap.values()].filter(
      (surface) =>
        surface.classification === "DENIED_EXECUTION_HOST" ||
        surface.classification === "UNKNOWN_ACTIVE"
    )
    const observedAt = new Date().toISOString()
    const evaluated = evaluatePond0xRoundTripEconomics({
      observedAt,
      entry,
      exit,
    })
    const networkReasons = unsafeSurfaces.map((surface) =>
      surface.classification === "DENIED_EXECUTION_HOST"
        ? "PONDOX_DENIED_EXECUTION_HOST"
        : "PONDOX_UNEXPECTED_NETWORK_HOST"
    )
    const economics = networkReasons.length === 0
      ? evaluated
      : {
          ...evaluated,
          status: "BLOCKED" as const,
          blockingReasons: [
            ...new Set([
              ...evaluated.blockingReasons,
              ...networkReasons,
            ]),
          ],
        }
    const archivePath = resolve(
      dataDirectory,
      "pond0x-round-trip-observations",
      observedAt.replace(/[^0-9A-Za-z]/g, "") + ".json"
    )
    const artifact = {
      ...economics,
      entry,
      exit,
      networkSurfaces: [...surfaceMap.values()],
    }
    const serialized = JSON.stringify(artifact, null, 2)

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
      status: economics.status,
      payAmountSol,
      acquiredTokenAmountBaseUnits:
        economics.acquiredTokenAmountBaseUnits,
      exitOutputLamports: economics.exitOutputLamports,
      entryDeclaredFeeBps: economics.entryDeclaredFeeBps,
      exitDeclaredFeeBps: economics.exitDeclaredFeeBps,
      totalDeclaredFeeBps: economics.totalDeclaredFeeBps,
      roundTripLossLamports: economics.roundTripLossLamports,
      roundTripLossBps: economics.roundTripLossBps,
      breakEvenAppreciationBps:
        economics.breakEvenAppreciationBps,
      blockingReasons: economics.blockingReasons,
      unsafeSurfaces,
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
      : "Pond0x round-trip observation failed"
  )
  process.exitCode = 1
})
