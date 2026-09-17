import {
  getBase58Decoder,
  getBase64Encoder,
  isAddress,
} from "@solana/kit"

const TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const TOKEN_2022_PROGRAM =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
const MINT_BASE_SIZE = 82
const MAX_RESPONSE_BYTES = 250_000

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>

export type SolanaMintValidation = {
  schemaVersion: 1
  observedAt: string
  network: "solana"
  mintAddress: string
  status: "VERIFIED_ONCHAIN" | "INCOMPLETE" | "UNAVAILABLE" | "BLOCKED"
  rpcSlot: number | null
  ownerProgram: typeof TOKEN_PROGRAM | typeof TOKEN_2022_PROGRAM | null
  tokenProgram: "TOKEN" | "TOKEN_2022" | null
  executable: boolean | null
  initialized: boolean | null
  decimals: number | null
  supplyRaw: string | null
  mintAuthority: string | null
  freezeAuthority: string | null
  accountAge: null
  accountAgeReason: "UNAVAILABLE_FROM_MINT_ACCOUNT"
  consistency: "MATCHED" | "NOT_CHECKED" | "MISMATCH"
  blockingReasons: ReadonlyArray<string>
  caveats: ReadonlyArray<string>
  watchOnly: true
  approvalGranted: false
  transactionRequested: false
  source: "SOLANA_RPC_MINT_VALIDATION"
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function result(input: {
  observedAt: string
  mintAddress: string
  status: SolanaMintValidation["status"]
  rpcSlot?: number | null
  ownerProgram?: SolanaMintValidation["ownerProgram"]
  tokenProgram?: SolanaMintValidation["tokenProgram"]
  executable?: boolean | null
  initialized?: boolean | null
  decimals?: number | null
  supplyRaw?: string | null
  mintAuthority?: string | null
  freezeAuthority?: string | null
  consistency?: SolanaMintValidation["consistency"]
  blockingReasons?: ReadonlyArray<string>
  caveats?: ReadonlyArray<string>
}): SolanaMintValidation {
  return {
    schemaVersion: 1,
    observedAt: input.observedAt,
    network: "solana",
    mintAddress: input.mintAddress,
    status: input.status,
    rpcSlot: input.rpcSlot ?? null,
    ownerProgram: input.ownerProgram ?? null,
    tokenProgram: input.tokenProgram ?? null,
    executable: input.executable ?? null,
    initialized: input.initialized ?? null,
    decimals: input.decimals ?? null,
    supplyRaw: input.supplyRaw ?? null,
    mintAuthority: input.mintAuthority ?? null,
    freezeAuthority: input.freezeAuthority ?? null,
    accountAge: null,
    accountAgeReason: "UNAVAILABLE_FROM_MINT_ACCOUNT",
    consistency: input.consistency ?? "NOT_CHECKED",
    blockingReasons: [...new Set(input.blockingReasons ?? [])],
    caveats: [...new Set([
      "MINT_ACCOUNT_DOES_NOT_PROVE_MARKET_LIQUIDITY",
      "MINT_ACCOUNT_DOES_NOT_PREDICT_TOKEN_SUCCESS",
      ...(input.caveats ?? []),
    ])],
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "SOLANA_RPC_MINT_VALIDATION",
  }
}

function safeObservedAt(now: (() => Date) | undefined) {
  const observedAt = (now?.() ?? new Date()).toISOString()
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("Solana mint validation timestamp is invalid")
  }
  return observedAt
}

function rpcUrl(value: string) {
  const parsed = new URL(value)
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Solana RPC URL must use HTTPS without basic auth")
  }
  return parsed
}

function u32(bytes: Uint8Array, offset: number) {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(offset, true)
}

function u64(bytes: Uint8Array, offset: number) {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getBigUint64(offset, true)
}

function authority(
  bytes: Uint8Array,
  optionOffset: number,
  addressOffset: number
) {
  const option = u32(bytes, optionOffset)
  if (option === 0) return null
  if (option !== 1) {
    throw new Error("invalid Solana mint authority option")
  }
  return getBase58Decoder().decode(
    bytes.slice(addressOffset, addressOffset + 32)
  )
}

function parseMintData(dataBase64: string) {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      dataBase64
    )
  ) {
    throw new Error("invalid Solana mint base64")
  }
  const bytes = Uint8Array.from(\n    getBase64Encoder().encode(dataBase64)\n  )
  if (bytes.length < MINT_BASE_SIZE) {
    throw new Error("Solana mint account is too short")
  }
  const decimals = bytes[44]
  const initialized = bytes[45]
  if (decimals === undefined || initialized === undefined) {
    throw new Error("Solana mint base fields are absent")
  }
  if (initialized !== 0 && initialized !== 1) {
    throw new Error("Solana mint initialized flag is invalid")
  }

  return {
    supplyRaw: u64(bytes, 36).toString(),
    decimals,
    initialized: initialized === 1,
    mintAuthority: authority(bytes, 0, 4),
    freezeAuthority: authority(bytes, 46, 50),
  }
}

function envelope(
  payload: unknown,
  id: number
): Record<string, unknown> | null {
  if (!Array.isArray(payload)) return null
  return payload
    .map(record)
    .find(item => item?.id === id && item.jsonrpc === "2.0") ?? null
}

export async function validateSolanaMintOnchain(input: {
  rpcUrl: string
  network: string
  contractAddress: string
  fetcher?: FetchLike
  now?: () => Date
}): Promise<SolanaMintValidation> {
  const observedAt = safeObservedAt(input.now)
  if (
    input.network.toLowerCase() !== "solana" ||
    !isAddress(input.contractAddress)
  ) {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "BLOCKED",
      blockingReasons: ["SOLANA_MINT_IDENTITY_INVALID"],
    })
  }

  let url: URL
  try {
    url = rpcUrl(input.rpcUrl)
  } catch {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "BLOCKED",
      blockingReasons: ["SOLANA_RPC_URL_INVALID"],
    })
  }

  const body = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [
        input.contractAddress,
        { commitment: "confirmed", encoding: "base64" },
      ],
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "getTokenSupply",
      params: [
        input.contractAddress,
        { commitment: "confirmed" },
      ],
    },
  ]

  let payload: unknown
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "error",
    })
    if (!response.ok) {
      return result({
        observedAt,
        mintAddress: input.contractAddress,
        status: "UNAVAILABLE",
        blockingReasons: ["SOLANA_RPC_HTTP_FAILED"],
      })
    }
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().includes("application/json")) {
      return result({
        observedAt,
        mintAddress: input.contractAddress,
        status: "BLOCKED",
        blockingReasons: ["SOLANA_RPC_CONTENT_TYPE_INVALID"],
      })
    }
    const text = await response.text()
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      return result({
        observedAt,
        mintAddress: input.contractAddress,
        status: "BLOCKED",
        blockingReasons: ["SOLANA_RPC_RESPONSE_TOO_LARGE"],
      })
    }
    payload = JSON.parse(text)
  } catch {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "UNAVAILABLE",
      blockingReasons: ["SOLANA_RPC_REQUEST_FAILED"],
    })
  }

  const accountEnvelope = envelope(payload, 1)
  if (!accountEnvelope || accountEnvelope.error) {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "UNAVAILABLE",
      blockingReasons: ["SOLANA_MINT_ACCOUNT_UNAVAILABLE"],
    })
  }
  const accountResult = record(accountEnvelope.result)
  const context = record(accountResult?.context)
  const slot = context?.slot
  const account = record(accountResult?.value)
  if (!Number.isSafeInteger(slot) || Number(slot) < 0 || !account) {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "UNAVAILABLE",
      blockingReasons: ["SOLANA_MINT_ACCOUNT_UNAVAILABLE"],
    })
  }

  const owner = account.owner
  const executable = account.executable
  const data = account.data
  const ownerProgram: SolanaMintValidation["ownerProgram"] =
    owner === TOKEN_PROGRAM
      ? TOKEN_PROGRAM
      : owner === TOKEN_2022_PROGRAM
        ? TOKEN_2022_PROGRAM
        : null
  const tokenProgram = ownerProgram === TOKEN_PROGRAM
    ? "TOKEN"
    : ownerProgram === TOKEN_2022_PROGRAM
      ? "TOKEN_2022"
      : null
  if (
    tokenProgram === null ||
    executable !== false ||
    !Array.isArray(data) ||
    data.length !== 2 ||
    typeof data[0] !== "string" ||
    data[1] !== "base64"
  ) {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "BLOCKED",
      rpcSlot: Number(slot),
      ownerProgram,
      tokenProgram,
      executable: typeof executable === "boolean" ? executable : null,
      blockingReasons: ["SOLANA_MINT_ACCOUNT_INVALID"],
    })
  }

  let mint: ReturnType<typeof parseMintData>
  try {
    mint = parseMintData(data[0])
  } catch {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "BLOCKED",
      rpcSlot: Number(slot),
      ownerProgram,
      tokenProgram,
      executable: false,
      blockingReasons: ["SOLANA_MINT_DATA_INVALID"],
    })
  }
  if (!mint.initialized) {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "BLOCKED",
      rpcSlot: Number(slot),
      ownerProgram,
      tokenProgram,
      executable: false,
      ...mint,
      blockingReasons: ["SOLANA_MINT_NOT_INITIALIZED"],
    })
  }

  const supplyEnvelope = envelope(payload, 2)
  const supplyResult = record(supplyEnvelope?.result)
  const supplyContext = record(supplyResult?.context)
  const supplyValue = record(supplyResult?.value)
  const rpcSupply = supplyValue?.amount
  const rpcDecimals = supplyValue?.decimals
  const supplySlot = supplyContext?.slot
  if (
    !supplyEnvelope ||
    supplyEnvelope.error ||
    !Number.isSafeInteger(supplySlot) ||
    Number(supplySlot) < 0 ||
    typeof rpcSupply !== "string" ||
    !/^\d+$/.test(rpcSupply) ||
    !Number.isInteger(rpcDecimals) ||
    Number(rpcDecimals) < 0 ||
    Number(rpcDecimals) > 255
  ) {
    return result({
      observedAt,
      mintAddress: input.contractAddress,
      status: "INCOMPLETE",
      rpcSlot: Number(slot),
      ownerProgram,
      tokenProgram,
      executable: false,
      ...mint,
      caveats: ["SOLANA_TOKEN_SUPPLY_CROSSCHECK_UNAVAILABLE"],
    })
  }

  const matched = (
    rpcSupply === mint.supplyRaw &&
    Number(rpcDecimals) === mint.decimals
  )
  return result({
    observedAt,
    mintAddress: input.contractAddress,
    status: matched ? "VERIFIED_ONCHAIN" : "BLOCKED",
    rpcSlot: Math.max(Number(slot), Number(supplySlot)),
    ownerProgram,
    tokenProgram,
    executable: false,
    ...mint,
    consistency: matched ? "MATCHED" : "MISMATCH",
    blockingReasons: matched
      ? []
      : ["SOLANA_MINT_SUPPLY_MISMATCH"],
  })
}
