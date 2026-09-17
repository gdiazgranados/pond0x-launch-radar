import { isAddress } from "@solana/kit"

import {
  readJupiterQuote,
  type ReadOnlyQuoteLeg,
} from "./read-only-quote-clients"
import type {
  SolanaMintValidation,
} from "./solana-mint-validator"

export const WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112"
export const DEFAULT_DIAGNOSTIC_INPUT_LAMPORTS = "10000000"

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>

export type MaxAttentionJupiterValidation = {
  schemaVersion: 1
  observedAt: string
  network: "solana"
  mintAddress: string
  status: "ROUTE_AVAILABLE" | "UNAVAILABLE" | "BLOCKED"
  diagnosticInputLamports: string
  quote: ReadOnlyQuoteLeg | null
  blockingReasons: ReadonlyArray<string>
  caveats: ReadonlyArray<string>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
  source: "JUPITER_READ_ONLY_QUOTE"
}

function result(input: {
  observedAt: string
  mintAddress: string
  status: MaxAttentionJupiterValidation["status"]
  diagnosticInputLamports: string
  quote?: ReadOnlyQuoteLeg | null
  blockingReasons?: ReadonlyArray<string>
  caveats?: ReadonlyArray<string>
}): MaxAttentionJupiterValidation {
  return {
    schemaVersion: 1,
    observedAt: input.observedAt,
    network: "solana",
    mintAddress: input.mintAddress,
    status: input.status,
    diagnosticInputLamports: input.diagnosticInputLamports,
    quote: input.quote ?? null,
    blockingReasons: [...new Set(input.blockingReasons ?? [])],
    caveats: [...new Set([
      "JUPITER_ROUTE_DOES_NOT_PREDICT_TOKEN_SUCCESS",
      "QUOTE_IS_DIAGNOSTIC_AND_MAY_EXPIRE",
      "PONDOX_EXECUTION_COSTS_ARE_NOT_INCLUDED",
      ...(input.caveats ?? []),
    ])],
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "JUPITER_READ_ONLY_QUOTE",
  }
}

function observedAt(now: (() => Date) | undefined) {
  const value = (now?.() ?? new Date()).toISOString()
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error("Jupiter route validation timestamp is invalid")
  }
  return value
}

export async function validateMaxAttentionJupiterRoute(input: {
  network: string
  contractAddress: string
  onchainValidation: SolanaMintValidation
  diagnosticInputLamports?: string
  apiKey?: string
  fetcher?: FetchLike
  now?: () => Date
}): Promise<MaxAttentionJupiterValidation> {
  const at = observedAt(input.now)
  const amount = input.diagnosticInputLamports ??
    DEFAULT_DIAGNOSTIC_INPUT_LAMPORTS
  const network = input.network.toLowerCase()

  if (
    network !== "solana" ||
    !isAddress(input.contractAddress) ||
    input.contractAddress === WRAPPED_SOL_MINT
  ) {
    return result({
      observedAt: at,
      mintAddress: input.contractAddress,
      status: "BLOCKED",
      diagnosticInputLamports: amount,
      blockingReasons: ["JUPITER_ROUTE_IDENTITY_INVALID"],
    })
  }

  if (
    !/^[1-9]\d*$/.test(amount) ||
    BigInt(amount) > BigInt(1_000_000_000)
  ) {
    return result({
      observedAt: at,
      mintAddress: input.contractAddress,
      status: "BLOCKED",
      diagnosticInputLamports: amount,
      blockingReasons: ["JUPITER_DIAGNOSTIC_AMOUNT_INVALID"],
    })
  }

  const onchain = input.onchainValidation
  if (
    onchain.network !== "solana" ||
    onchain.mintAddress !== input.contractAddress ||
    onchain.status !== "VERIFIED_ONCHAIN" ||
    onchain.consistency !== "MATCHED" ||
    onchain.decimals === null
  ) {
    return result({
      observedAt: at,
      mintAddress: input.contractAddress,
      status: "BLOCKED",
      diagnosticInputLamports: amount,
      blockingReasons: ["JUPITER_ROUTE_ONCHAIN_EVIDENCE_NOT_VERIFIED"],
    })
  }

  try {
    const quote = await readJupiterQuote(
      {
        inputToken: WRAPPED_SOL_MINT,
        outputToken: input.contractAddress,
        inputAmountBaseUnits: amount,
        inputDecimals: 9,
        outputDecimals: onchain.decimals,
        estimatedFeeUsd: 0,
        apiKey: input.apiKey,
      },
      input.fetcher
    )
    return result({
      observedAt: at,
      mintAddress: input.contractAddress,
      status: "ROUTE_AVAILABLE",
      diagnosticInputLamports: amount,
      quote,
    })
  } catch {
    return result({
      observedAt: at,
      mintAddress: input.contractAddress,
      status: "UNAVAILABLE",
      diagnosticInputLamports: amount,
      blockingReasons: ["JUPITER_READ_ONLY_QUOTE_UNAVAILABLE"],
    })
  }
}
