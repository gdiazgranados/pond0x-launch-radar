import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "./wpond-quote-observer"

export const PONDOX_REFERRAL_ACCOUNT =
  "9VjBWxGnJMzDaRxFHLWjDwRZcCpcH5cq8G5V4o1ymecj"
export const PONDOX_REFERRAL_PROGRAM =
  "REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3"
export const PONDOX_WSOL_VAULT =
  "GJdPHD8U12hM6Aaw3GtWfY8dqeaZxDrNoWKYg4sKhmNN"
export const PONDOX_WPOND_VAULT =
  "CBqvmpXFgzbw1F8XEwKrfpq3RKMhwwiKFoXkLwtCXgxA"

export type Pond0xVaultFlowDirection =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "UNCHANGED"

type ParsedAccountKey = string | {
  pubkey?: string
  signer?: boolean
}

type ParsedTokenBalance = {
  accountIndex?: number
  mint?: string
  owner?: string
  uiTokenAmount?: {
    amount?: string
    decimals?: number
  }
}

type ParsedInstruction = {
  program?: string
  parsed?: {
    type?: string
    info?: Record<string, unknown>
  }
}

export type Pond0xParsedTransaction = {
  slot?: number
  blockTime?: number | null
  meta?: {
    err?: unknown
    fee?: number
    computeUnitsConsumed?: number
    preTokenBalances?: ParsedTokenBalance[]
    postTokenBalances?: ParsedTokenBalance[]
    innerInstructions?: Array<{
      instructions?: ParsedInstruction[]
    }>
  }
  transaction?: {
    message?: {
      accountKeys?: ParsedAccountKey[]
      instructions?: ParsedInstruction[]
    }
  }
}

export type Pond0xVaultFlow = {
  signature: string
  slot: number | null
  blockTime: number | null
  successful: boolean
  vaultTokenAccount: string
  mint: string
  decimals: number
  direction: Pond0xVaultFlowDirection
  deltaRaw: string
  amountRaw: string
  estimatedDepositShareBps: number | null
  estimateBasis:
    | "SAME_MINT_POSITIVE_DELTAS"
    | null
  signers: ReadonlyArray<string>
  sources: ReadonlyArray<string>
  destinations: ReadonlyArray<string>
  authorities: ReadonlyArray<string>
  networkFeeLamports: number | null
  computeUnitsConsumed: number | null
}

export type Pond0xVaultScanDiagnostic = {
  tokenAccount: string
  mint: string
  signatureCount: number
  failedSignatureCount: number
  unavailableTransactionCount: number
  unreferencedTransactionCount: number
  flowCount: number
}

export type Pond0xReferralVaultBalance = {
  tokenAccount: string
  mint: string
  owner: string
  rawAmount: string
  decimals: number
}

export type Pond0xReferralVaultSnapshot = {
  schemaVersion: 1
  simulationOnly: true
  readOnly: true
  walletConnected: false
  transactionRequested: false
  observedAt: string
  referralAccount: string
  referralProgram: string
  referralExecutable: false
  balances: ReadonlyArray<Pond0xReferralVaultBalance>
  vaultScans: ReadonlyArray<Pond0xVaultScanDiagnostic>
  flows: ReadonlyArray<Pond0xVaultFlow>
  depositCount: number
  withdrawalCount: number
  unchangedCount: number
  withdrawalDestinations: ReadonlyArray<string>
  source: "SOLANA_JSON_RPC"
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0
    ? value
    : null
}

function integerString(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value)
    ? value
    : null
}

function publicKey(value: ParsedAccountKey) {
  return typeof value === "string"
    ? value
    : stringValue(value.pubkey)
}

function unique(values: ReadonlyArray<string>) {
  return [...new Set(values)].sort()
}

function optionalInteger(value: unknown) {
  return Number.isInteger(value) ? Number(value) : null
}

function ratioBps(numerator: bigint, denominator: bigint) {
  if (denominator <= BigInt(0)) return null
  return Number(
    numerator * BigInt(100_000_000) / denominator
  ) / 10_000
}

function balanceMap(
  balances: ReadonlyArray<ParsedTokenBalance>
) {
  const mapped = new Map<number, ParsedTokenBalance>()
  for (const balance of balances) {
    if (Number.isInteger(balance.accountIndex)) {
      mapped.set(Number(balance.accountIndex), balance)
    }
  }
  return mapped
}

function rawAmount(balance: ParsedTokenBalance | undefined) {
  const value = integerString(balance?.uiTokenAmount?.amount)
  return value ? BigInt(value) : BigInt(0)
}

function allInstructions(transaction: Pond0xParsedTransaction) {
  return [
    ...(transaction.transaction?.message?.instructions ?? []),
    ...(transaction.meta?.innerInstructions ?? [])
      .flatMap((group) => group.instructions ?? []),
  ]
}

export function analyzePond0xVaultTransaction(input: {
  signature: string
  vaultTokenAccount: string
  expectedMint: string
  transaction: Pond0xParsedTransaction
}): Pond0xVaultFlow | null {
  if (!input.signature.trim()) {
    throw new Error("signature is required")
  }

  const keys =
    input.transaction.transaction?.message?.accountKeys ?? []
  const vaultIndex = keys.findIndex(
    (key) => publicKey(key) === input.vaultTokenAccount
  )
  if (vaultIndex < 0) return null

  const pre = balanceMap(
    input.transaction.meta?.preTokenBalances ?? []
  )
  const post = balanceMap(
    input.transaction.meta?.postTokenBalances ?? []
  )
  const preBalance = pre.get(vaultIndex)
  const postBalance = post.get(vaultIndex)
  const details = postBalance ?? preBalance
  if (!details) return null

  const mint = stringValue(details.mint)
  if (mint !== input.expectedMint) {
    throw new Error("vault mint identity changed")
  }

  const decimals = Number(details.uiTokenAmount?.decimals)
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("vault decimals are unavailable")
  }

  const before = rawAmount(preBalance)
  const after = rawAmount(postBalance)
  const delta = after - before
  const direction: Pond0xVaultFlowDirection =
    delta > BigInt(0)
      ? "DEPOSIT"
      : delta < BigInt(0)
        ? "WITHDRAWAL"
        : "UNCHANGED"
  const amount = delta < BigInt(0) ? -delta : delta

  const changedIndices = new Set([
    ...pre.keys(),
    ...post.keys(),
  ])
  let positiveSameMintDeltas = BigInt(0)
  for (const index of changedIndices) {
    const candidate = post.get(index) ?? pre.get(index)
    if (candidate?.mint !== mint) continue
    const candidateDelta =
      rawAmount(post.get(index)) - rawAmount(pre.get(index))
    if (candidateDelta > BigInt(0)) {
      positiveSameMintDeltas += candidateDelta
    }
  }

  const related = allInstructions(input.transaction)
    .map((instruction) => ({
      instruction,
      info: record(instruction.parsed?.info),
    }))
    .filter(({ info }) =>
      info.source === input.vaultTokenAccount ||
      info.destination === input.vaultTokenAccount
    )

  const sources = unique(related.flatMap(({ info }) => {
    const value = stringValue(info.source)
    return value ? [value] : []
  }))
  const destinations = unique(related.flatMap(({ info }) => {
    const value = stringValue(info.destination)
    return value ? [value] : []
  }))
  const authorities = unique(related.flatMap(({ info }) => {
    const value = stringValue(info.authority)
    return value ? [value] : []
  }))
  const signers = unique(keys.flatMap((key) => {
    if (typeof key === "string" || key.signer !== true) return []
    const value = stringValue(key.pubkey)
    return value ? [value] : []
  }))

  return {
    signature: input.signature,
    slot: optionalInteger(input.transaction.slot),
    blockTime: optionalInteger(input.transaction.blockTime),
    successful:
      input.transaction.meta?.err === null ||
      input.transaction.meta?.err === undefined,
    vaultTokenAccount: input.vaultTokenAccount,
    mint,
    decimals,
    direction,
    deltaRaw: delta.toString(),
    amountRaw: amount.toString(),
    estimatedDepositShareBps:
      direction === "DEPOSIT"
        ? ratioBps(amount, positiveSameMintDeltas)
        : null,
    estimateBasis:
      direction === "DEPOSIT" &&
      positiveSameMintDeltas > BigInt(0)
        ? "SAME_MINT_POSITIVE_DELTAS"
        : null,
    signers,
    sources,
    destinations,
    authorities,
    networkFeeLamports:
      optionalInteger(input.transaction.meta?.fee),
    computeUnitsConsumed:
      optionalInteger(
        input.transaction.meta?.computeUnitsConsumed
      ),
  }
}

export function buildPond0xReferralVaultSnapshot(input: {
  observedAt: string
  referralAccount: string
  referralProgram: string
  referralExecutable: boolean
  balances: ReadonlyArray<Pond0xReferralVaultBalance>
  vaultScans?: ReadonlyArray<Pond0xVaultScanDiagnostic>
  flows: ReadonlyArray<Pond0xVaultFlow>
}): Pond0xReferralVaultSnapshot {
  if (input.referralAccount !== PONDOX_REFERRAL_ACCOUNT) {
    throw new Error("unexpected Pond0x referral account")
  }
  if (input.referralProgram !== PONDOX_REFERRAL_PROGRAM) {
    throw new Error("unexpected Pond0x referral program")
  }
  if (input.referralExecutable) {
    throw new Error("referral account unexpectedly executable")
  }

  const expectedVaults = new Map([
    [WRAPPED_SOL_MINT, PONDOX_WSOL_VAULT],
    [WPOND_MINT, PONDOX_WPOND_VAULT],
  ])
  for (const balance of input.balances) {
    if (
      balance.owner !== PONDOX_REFERRAL_ACCOUNT ||
      expectedVaults.get(balance.mint) !== balance.tokenAccount ||
      !integerString(balance.rawAmount)
    ) {
      throw new Error("referral vault balance identity changed")
    }
  }
  const observedMints = new Set(
    input.balances.map((balance) => balance.mint)
  )
  if (
    input.balances.length !== expectedVaults.size ||
    observedMints.size !== expectedVaults.size ||
    [...expectedVaults.keys()].some(
      (mint) => !observedMints.has(mint)
    )
  ) {
    throw new Error("required referral vault balances are missing")
  }

  const depositCount = input.flows.filter(
    (flow) => flow.direction === "DEPOSIT"
  ).length
  const withdrawalCount = input.flows.filter(
    (flow) => flow.direction === "WITHDRAWAL"
  ).length
  const unchangedCount = input.flows.filter(
    (flow) => flow.direction === "UNCHANGED"
  ).length
  const withdrawalDestinations = unique(
    input.flows
      .filter((flow) => flow.direction === "WITHDRAWAL")
      .flatMap((flow) =>
        flow.destinations.filter(
          (destination) =>
            destination !== flow.vaultTokenAccount
        )
      )
  )

  return {
    schemaVersion: 1,
    simulationOnly: true,
    readOnly: true,
    walletConnected: false,
    transactionRequested: false,
    observedAt: input.observedAt,
    referralAccount: input.referralAccount,
    referralProgram: input.referralProgram,
    referralExecutable: false,
    balances: input.balances,
    vaultScans: input.vaultScans ?? [],
    flows: input.flows,
    depositCount,
    withdrawalCount,
    unchangedCount,
    withdrawalDestinations,
    source: "SOLANA_JSON_RPC",
  }
}
