import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  capturePond0xUnsignedOrder,
} from "../../src/private-alpha/pond0x-unsigned-order-capture"
import {
  PONDOX_REFERRAL_ACCOUNT,
} from "../../src/private-alpha/pond0x-referral-vault-observer"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

const portalObservationPath = resolve(
  process.env.PONDOX_OBSERVATION_OUTPUT ??
    "private-data/pond0x-portal-observation.json"
)
const outputPath = resolve(
  process.env.PONDOX_UNSIGNED_TRANSACTION_INPUT ??
    "private-data/pond0x-unsigned-transaction.json"
)

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("portal observation is invalid")
  }
  return value as Record<string, unknown>
}

async function main() {
  const taker = process.env.PONDOX_DEDICATED_WALLET ?? ""
  if (!taker) {
    throw new Error("PONDOX_DEDICATED_WALLET is required")
  }

  const observation = record(JSON.parse(
    await readFile(portalObservationPath, "utf8")
  ))
  if (observation.status !== "MEASURED") {
    throw new Error("fresh measured portal observation is required")
  }
  const quote = record(observation.underlyingQuote)
  const capturedAt = Date.parse(String(observation.observedAt ?? ""))
  if (
    !Number.isFinite(capturedAt) ||
    Date.now() - capturedAt > 30_000
  ) {
    throw new Error("portal observation is stale; run it again")
  }
  const amount = String(quote.inAmount ?? "")
  const referralFeeBps = Number(quote.referralFeeBps)
  if (
    quote.inputMint !== WRAPPED_SOL_MINT ||
    quote.outputMint !== WPOND_MINT ||
    quote.referralAccount !== PONDOX_REFERRAL_ACCOUNT ||
    !/^[1-9]\d*$/.test(amount) ||
    !Number.isSafeInteger(referralFeeBps)
  ) {
    throw new Error("portal quote identity is incomplete")
  }

  const capture = await capturePond0xUnsignedOrder({
    taker,
    inputMint: WRAPPED_SOL_MINT,
    outputMint: WPOND_MINT,
    inputAmountBaseUnits: amount,
    referralAccount: PONDOX_REFERRAL_ACCOUNT,
    referralFeeBps,
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify({
    transactionBase64: capture.transactionBase64,
    watchedAccounts: capture.watchedAccounts,
    capture,
  }, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  })

  console.log(JSON.stringify({
    watchOnly: true,
    signingEnabled: false,
    transactionSubmitted: false,
    status: capture.status,
    requestId: capture.requestId,
    transactionVersion:
      capture.wireInspection?.transactionVersion ?? null,
    feePayer: capture.wireInspection?.feePayer ?? null,
    blockingReasons: capture.blockingReasons,
    outputPath,
  }, null, 2))
  if (capture.status !== "CAPTURED") process.exitCode = 1
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Pond0x unsigned capture failed"
  )
  process.exitCode = 1
})
