import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  analyzePond0xVaultTransaction,
  buildPond0xReferralVaultSnapshot,
  PONDOX_REFERRAL_ACCOUNT,
  PONDOX_REFERRAL_PROGRAM,
  PONDOX_WPOND_VAULT,
  PONDOX_WSOL_VAULT,
  type Pond0xParsedTransaction,
  type Pond0xReferralVaultBalance,
  type Pond0xVaultFlow,
} from "../../src/private-alpha/pond0x-referral-vault-observer"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

const rpcUrl =
  process.env.SOLANA_RPC_URL ??
  "https://api.mainnet-beta.solana.com"
const outputPath = resolve(
  process.env.PONDOX_REFERRAL_VAULT_OUTPUT ??
    "private-data/pond0x-referral-vault-observation.json"
)
const dataDirectory = resolve(
  process.env.SHADOW_DATA_DIR ?? "private-data"
)

function boundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const value = Number(process.env[name] ?? fallback)
  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      name + " must be an integer from " +
      minimum + " to " + maximum
    )
  }
  return value
}

const signatureLimit = boundedInteger(
  "PONDOX_VAULT_SIGNATURE_LIMIT",
  10,
  1,
  50
)
const requestDelayMs = boundedInteger(
  "PONDOX_VAULT_REQUEST_DELAY_MS",
  350,
  0,
  5_000
)

type RpcEnvelope<T> = {
  result?: T
  error?: {
    code?: number
    message?: string
  }
}

type AccountInfo = {
  executable?: boolean
  owner?: string
}

type TokenAccount = {
  pubkey?: string
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string
          owner?: string
          tokenAmount?: {
            amount?: string
            decimals?: number
          }
        }
      }
    }
  }
}

type SignatureInfo = {
  signature?: string
  err?: unknown
}

async function rpc<T>(
  method: string,
  params: ReadonlyArray<unknown>
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(
      "Solana RPC failed with HTTP " + response.status
    )
  }

  const payload = await response.json() as RpcEnvelope<T>
  if (payload.error || payload.result === undefined) {
    throw new Error(
      "Solana RPC " + method + " failed: " +
      (payload.error?.message ?? "missing result")
    )
  }
  return payload.result
}

async function delay() {
  if (requestDelayMs === 0) return
  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, requestDelayMs)
  })
}

function parseRequiredBalance(
  accounts: ReadonlyArray<TokenAccount>,
  input: {
    mint: string
    tokenAccount: string
  }
): Pond0xReferralVaultBalance {
  const account = accounts.find(
    (candidate) => candidate.pubkey === input.tokenAccount
  )
  const info = account?.account?.data?.parsed?.info
  const amount = info?.tokenAmount?.amount
  const decimals = Number(info?.tokenAmount?.decimals)

  if (
    info?.mint !== input.mint ||
    info.owner !== PONDOX_REFERRAL_ACCOUNT ||
    typeof amount !== "string" ||
    !/^\d+$/.test(amount) ||
    !Number.isInteger(decimals)
  ) {
    throw new Error(
      "required Pond0x referral vault is unavailable"
    )
  }

  return {
    tokenAccount: input.tokenAccount,
    mint: input.mint,
    owner: info.owner,
    rawAmount: amount,
    decimals,
  }
}

async function observeVault(input: {
  tokenAccount: string
  mint: string
}) {
  const signatures = await rpc<SignatureInfo[]>(
    "getSignaturesForAddress",
    [
      input.tokenAccount,
      {
        limit: signatureLimit,
        commitment: "confirmed",
      },
    ]
  )
  const flows: Pond0xVaultFlow[] = []

  for (const signatureInfo of signatures) {
    if (
      typeof signatureInfo.signature !== "string" ||
      (
        signatureInfo.err !== null &&
        signatureInfo.err !== undefined
      )
    ) {
      continue
    }

    await delay()
    const transaction = await rpc<Pond0xParsedTransaction | null>(
      "getTransaction",
      [
        signatureInfo.signature,
        {
          encoding: "jsonParsed",
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        },
      ]
    )
    if (!transaction) continue

    const flow = analyzePond0xVaultTransaction({
      signature: signatureInfo.signature,
      vaultTokenAccount: input.tokenAccount,
      expectedMint: input.mint,
      transaction,
    })
    if (flow) flows.push(flow)
  }

  return flows
}

function timestampKey(value: string) {
  return value.replace(/[^0-9A-Za-z]/g, "")
}

async function main() {
  const referralResponse = await rpc<{
    value?: AccountInfo | null
  }>(
    "getAccountInfo",
    [
      PONDOX_REFERRAL_ACCOUNT,
      {
        encoding: "base64",
        commitment: "confirmed",
      },
    ]
  )
  const referral = referralResponse.value
  if (
    !referral ||
    referral.owner !== PONDOX_REFERRAL_PROGRAM ||
    referral.executable !== false
  ) {
    throw new Error(
      "Pond0x referral account identity changed"
    )
  }

  const tokenAccounts = await rpc<{ value?: TokenAccount[] }>(
    "getTokenAccountsByOwner",
    [
      PONDOX_REFERRAL_ACCOUNT,
      {
        programId:
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      },
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
      },
    ]
  )
  const accounts = tokenAccounts.value ?? []
  const balances = [
    parseRequiredBalance(accounts, {
      mint: WRAPPED_SOL_MINT,
      tokenAccount: PONDOX_WSOL_VAULT,
    }),
    parseRequiredBalance(accounts, {
      mint: WPOND_MINT,
      tokenAccount: PONDOX_WPOND_VAULT,
    }),
  ]

  const flows: Pond0xVaultFlow[] = []
  for (const vault of balances) {
    await delay()
    flows.push(...await observeVault({
      tokenAccount: vault.tokenAccount,
      mint: vault.mint,
    }))
  }
  flows.sort(
    (left, right) =>
      (right.blockTime ?? 0) - (left.blockTime ?? 0)
  )

  const observedAt = new Date().toISOString()
  const snapshot = buildPond0xReferralVaultSnapshot({
    observedAt,
    referralAccount: PONDOX_REFERRAL_ACCOUNT,
    referralProgram: PONDOX_REFERRAL_PROGRAM,
    referralExecutable: false,
    balances,
    flows,
  })
  const archivePath = resolve(
    dataDirectory,
    "pond0x-referral-vault-observations",
    timestampKey(observedAt) + ".json"
  )
  const serialized = JSON.stringify(snapshot, null, 2)

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
    readOnly: true,
    walletConnected: false,
    transactionRequested: false,
    observedAt,
    signatureLimitPerVault: signatureLimit,
    balances,
    flowCount: flows.length,
    depositCount: snapshot.depositCount,
    withdrawalCount: snapshot.withdrawalCount,
    unchangedCount: snapshot.unchangedCount,
    withdrawalDestinations:
      snapshot.withdrawalDestinations,
    recentFlows: flows.slice(0, 10).map((flow) => ({
      signature: flow.signature,
      mint: flow.mint,
      direction: flow.direction,
      deltaRaw: flow.deltaRaw,
      estimatedDepositShareBps:
        flow.estimatedDepositShareBps,
      signers: flow.signers,
      sources: flow.sources,
      destinations: flow.destinations,
    })),
    outputPath,
    archivePath,
  }, null, 2))
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Pond0x referral vault observation failed"
  )
  process.exitCode = 1
})
