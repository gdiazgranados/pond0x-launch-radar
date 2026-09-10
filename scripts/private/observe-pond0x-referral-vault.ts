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
  type Pond0xVaultScanDiagnostic,
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

const signatureFetchLimit = boundedInteger(
  "PONDOX_VAULT_SIGNATURE_LIMIT",
  25,
  1,
  100
)
const successfulFlowTarget = boundedInteger(
  "PONDOX_VAULT_FLOW_TARGET",
  5,
  1,
  20
)
const searchWithdrawals =
  process.env.PONDOX_VAULT_SEARCH_WITHDRAWALS === "1"
const signaturePageLimit = boundedInteger(
  "PONDOX_VAULT_PAGE_LIMIT",
  4,
  1,
  20
)
const transactionRequestLimit = boundedInteger(
  "PONDOX_VAULT_TRANSACTION_LIMIT",
  40,
  1,
  100
)
const requestDelayMs = boundedInteger(
  "PONDOX_VAULT_REQUEST_DELAY_MS",
  750,
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

async function wait(milliseconds: number) {
  if (milliseconds === 0) return
  await new Promise((resolveWait) => {
    setTimeout(resolveWait, milliseconds)
  })
}

async function rpc<T>(
  method: string,
  params: ReadonlyArray<unknown>
): Promise<T> {
  const maximumAttempts = 4

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
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

    if (response.ok) {
      const payload = await response.json() as RpcEnvelope<T>
      if (payload.error || payload.result === undefined) {
        throw new Error(
          "Solana RPC " + method + " failed: " +
          (payload.error?.message ?? "missing result")
        )
      }
      return payload.result
    }

    const retryable =
      response.status === 429 || response.status >= 500
    if (!retryable || attempt === maximumAttempts) {
      throw new Error(
        "Solana RPC failed with HTTP " + response.status
      )
    }

    const retryAfter = Number(
      response.headers.get("retry-after")
    )
    const fallbackDelay = 1_000 * (2 ** (attempt - 1))
    const retryDelay = Number.isFinite(retryAfter) &&
      retryAfter > 0
      ? Math.min(retryAfter * 1_000, 15_000)
      : fallbackDelay
    await wait(retryDelay)
  }

  throw new Error("Solana RPC retry loop exhausted")
}

async function delay() {
  await wait(requestDelayMs)
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
  const flows: Pond0xVaultFlow[] = []
  let before: string | undefined
  let signatureCount = 0
  let examinedSignatureCount = 0
  let failedSignatureCount = 0
  let unavailableTransactionCount = 0
  let unreferencedTransactionCount = 0
  let transactionRequestCount = 0
  let pageCount = 0
  let stoppedReason: Pond0xVaultScanDiagnostic["stoppedReason"] =
    "PAGE_LIMIT"

  scanPages:
  for (
    let page = 0;
    page < (searchWithdrawals ? signaturePageLimit : 1);
    page += 1
  ) {
    const options: {
      limit: number
      commitment: "confirmed"
      before?: string
    } = {
      limit: signatureFetchLimit,
      commitment: "confirmed",
    }
    if (before) options.before = before

    const signatures = await rpc<SignatureInfo[]>(
      "getSignaturesForAddress",
      [input.tokenAccount, options]
    )
    pageCount += 1
    signatureCount += signatures.length

    if (signatures.length === 0) {
      stoppedReason = "HISTORY_EXHAUSTED"
      break
    }

    for (const signatureInfo of signatures) {
      if (
        !searchWithdrawals &&
        flows.length >= successfulFlowTarget
      ) {
        stoppedReason = "TARGET_REACHED"
        break scanPages
      }
      if (
        searchWithdrawals &&
        flows.some((flow) => flow.direction === "WITHDRAWAL")
      ) {
        stoppedReason = "WITHDRAWAL_FOUND"
        break scanPages
      }

      examinedSignatureCount += 1
      if (typeof signatureInfo.signature !== "string") {
        unavailableTransactionCount += 1
        continue
      }
      if (
        signatureInfo.err !== null &&
        signatureInfo.err !== undefined
      ) {
        failedSignatureCount += 1
        continue
      }
      if (
        transactionRequestCount >= transactionRequestLimit
      ) {
        stoppedReason = "TRANSACTION_LIMIT"
        break scanPages
      }

      await delay()
      transactionRequestCount += 1
      const transaction =
        await rpc<Pond0xParsedTransaction | null>(
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
      if (!transaction) {
        unavailableTransactionCount += 1
        continue
      }

      const flow = analyzePond0xVaultTransaction({
        signature: signatureInfo.signature,
        vaultTokenAccount: input.tokenAccount,
        expectedMint: input.mint,
        transaction,
      })
      if (flow) {
        flows.push(flow)
      } else {
        unreferencedTransactionCount += 1
      }
    }

    if (
      searchWithdrawals &&
      flows.some((flow) => flow.direction === "WITHDRAWAL")
    ) {
      stoppedReason = "WITHDRAWAL_FOUND"
      break
    }

    before = signatures.at(-1)?.signature
    if (!searchWithdrawals) {
      stoppedReason = flows.length >= successfulFlowTarget
        ? "TARGET_REACHED"
        : "RECENT_WINDOW_COMPLETE"
      break
    }
    if (signatures.length < signatureFetchLimit || !before) {
      stoppedReason = "HISTORY_EXHAUSTED"
      break
    }
  }

  const diagnostic: Pond0xVaultScanDiagnostic = {
    tokenAccount: input.tokenAccount,
    mint: input.mint,
    signatureCount,
    examinedSignatureCount,
    failedSignatureCount,
    unavailableTransactionCount,
    unreferencedTransactionCount,
    transactionRequestCount,
    pageCount,
    flowCount: flows.length,
    stoppedReason,
  }

  return { flows, diagnostic }
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
  const vaultScans: Pond0xVaultScanDiagnostic[] = []
  for (const vault of balances) {
    await delay()
    const scan = await observeVault({
      tokenAccount: vault.tokenAccount,
      mint: vault.mint,
    })
    flows.push(...scan.flows)
    vaultScans.push(scan.diagnostic)
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
    vaultScans,
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
    searchWithdrawals,
    signatureFetchLimitPerPage: signatureFetchLimit,
    signaturePageLimitPerVault:
      searchWithdrawals ? signaturePageLimit : 1,
    transactionRequestLimitPerVault: transactionRequestLimit,
    successfulFlowTargetPerVault:
      searchWithdrawals ? null : successfulFlowTarget,
    balances,
    vaultScans,
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
