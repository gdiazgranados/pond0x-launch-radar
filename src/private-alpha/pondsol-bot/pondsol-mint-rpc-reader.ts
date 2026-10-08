import {
  PONDSOL_TOKEN_IDENTITY,
  verifyPondSolIdentity,
  type PondSolMintObservation,
} from "./pondsol-token-identity"

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com"

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>

export type PondSolRpcResult = {
  verified: boolean
  reasons: string[]
  observation: PondSolMintObservation | null
  observedAtMs: number | null
}

export async function readPondSolMint(
  rpcUrl = DEFAULT_RPC,
  fetcher: FetchLike = fetch
): Promise<PondSolRpcResult> {
  const reject = (reason: string): PondSolRpcResult => ({
    verified: false,
    reasons: [reason],
    observation: null,
    observedAtMs: null,
  })

  let url: URL

  try {
    url = new URL(rpcUrl)
    if (url.protocol !== "https:" || url.username || url.password) {
      return reject("INVALID_RPC_URL")
    }
  } catch {
    return reject("INVALID_RPC_URL")
  }

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getAccountInfo",
    params: [
      PONDSOL_TOKEN_IDENTITY.mint,
      { encoding: "jsonParsed", commitment: "finalized" },
    ],
  }

  let payload: unknown

  try {
    const response = await fetcher(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })

    if (!response.ok) {
      return reject("RPC_HTTP_ERROR")
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().includes("application/json")) {
      return reject("RPC_NON_JSON")
    }

    payload = await response.json()
  } catch {
    return reject("RPC_REQUEST_FAILED")
  }

  if (!payload || typeof payload !== "object") {
    return reject("RPC_INVALID_RESPONSE")
  }

  const root = payload as Record<string, unknown>

  if (root.error || root.jsonrpc !== "2.0" || root.id !== 1) {
    return reject("RPC_INVALID_RESPONSE")
  }

  const result = root.result

  if (!result || typeof result !== "object") {
    return reject("RPC_INVALID_RESPONSE")
  }

  const resultObj = result as Record<string, unknown>
  const context = resultObj.context
  const account = resultObj.value

  if (
    !context || typeof context !== "object" ||
    !account || typeof account !== "object"
  ) {
    return reject("RPC_INVALID_RESPONSE")
  }

  const slot = (context as Record<string, unknown>).slot
  const accountObj = account as Record<string, unknown>
  const data = accountObj.data

  if (
    !Number.isSafeInteger(slot) ||
    (slot as number) <= 0 ||
    accountObj.owner !== PONDSOL_TOKEN_IDENTITY.tokenProgram ||
    !data || typeof data !== "object"
  ) {
    return reject("RPC_INVALID_MINT_ACCOUNT")
  }

  const dataObj = data as Record<string, unknown>
  const parsed = dataObj.parsed

  if (
    dataObj.program !== "spl-token" ||
    !parsed || typeof parsed !== "object"
  ) {
    return reject("RPC_INVALID_MINT_ACCOUNT")
  }

  const parsedObj = parsed as Record<string, unknown>
  const info = parsedObj.info

  if (!info || typeof info !== "object") {
    return reject("RPC_INVALID_MINT_ACCOUNT")
  }

  const observation: PondSolMintObservation = {
    mint: PONDSOL_TOKEN_IDENTITY.mint,
    ownerProgram: String(accountObj.owner),
    decimals: (info as Record<string, unknown>).decimals as number,
    accountType: String(parsedObj.type),
    finalizedSlot: slot as number,
  }

  const identity = verifyPondSolIdentity(observation)

  if (!identity.verified) {
    return {
      verified: false,
      reasons: identity.reasons,
      observation: null,
      observedAtMs: null,
    }
  }

  return {
    verified: true,
    reasons: [],
    observation,
    observedAtMs: Date.now(),
  }
}