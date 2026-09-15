import { createHash } from "node:crypto"
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit"

export const PONDOX_ALLOWED_PROGRAM_ADDRESSES = [
  "ComputeBudget111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
] as const

const PONDOX_ALLOWED_PROGRAM_SET = new Set<string>(
  PONDOX_ALLOWED_PROGRAM_ADDRESSES
)

export type SolanaWireInstructionInspection = {
  instructionIndex: number
  programAddressIndex: number
  programAddress: string | null
  accountIndices: ReadonlyArray<number>
  dataLength: number
}

export type SolanaWireTransactionInspection = {
  schemaVersion: 1
  status: "DECODED" | "BLOCKED"
  transactionVersion: "legacy" | number | null
  wireByteLength: number
  wireSha256: string | null
  feePayer: string | null
  requiredSigners: ReadonlyArray<string>
  staticAccountCount: number
  addressTableLookupCount: number
  instructions: ReadonlyArray<SolanaWireInstructionInspection>
  unresolvedProgramAddressIndices: ReadonlyArray<number>
  blockingReasons: ReadonlyArray<string>
  signingEnabled: false
  transactionSubmitted: false
  source: "SOLANA_UNSIGNED_WIRE_INSPECTION"
}

function blocked(
  reason: string
): SolanaWireTransactionInspection {
  return {
    schemaVersion: 1,
    status: "BLOCKED",
    transactionVersion: null,
    wireByteLength: 0,
    wireSha256: null,
    feePayer: null,
    requiredSigners: [],
    staticAccountCount: 0,
    addressTableLookupCount: 0,
    instructions: [],
    unresolvedProgramAddressIndices: [],
    blockingReasons: [reason],
    signingEnabled: false,
    transactionSubmitted: false,
    source: "SOLANA_UNSIGNED_WIRE_INSPECTION",
  }
}

export function inspectSolanaWireTransaction(
  transactionBase64: string
): SolanaWireTransactionInspection {
  if (
    typeof transactionBase64 !== "string" ||
    transactionBase64.length === 0 ||
    transactionBase64.length > 16_384 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(transactionBase64)
  ) {
    return blocked("PONDOX_WIRE_BASE64_INVALID")
  }

  try {
    const wireBytes = getBase64Encoder().encode(
      transactionBase64
    )

    if (
      wireBytes.length === 0 ||
      wireBytes.length > 4_096
    ) {
      return blocked("PONDOX_WIRE_SIZE_INVALID")
    }

    const wireSha256 = createHash("sha256")
      .update(Uint8Array.from(wireBytes))
      .digest("hex")

    const transaction =
      getTransactionDecoder().decode(wireBytes)

    if (
      Object.values(transaction.signatures).some(
        signature => signature !== null
      )
    ) {
      return {
        ...blocked("PONDOX_WIRE_SIGNATURE_PRESENT"),
        wireByteLength: wireBytes.length,
        wireSha256,
      }
    }

    const message =
      getCompiledTransactionMessageDecoder().decode(
        transaction.messageBytes
      )

    if (
      message.version !== "legacy" &&
      message.version !== 0
    ) {
      return {
        ...blocked("PONDOX_WIRE_VERSION_UNSUPPORTED"),
        transactionVersion: message.version,
        wireByteLength: wireBytes.length,
        wireSha256,
      }
    }

    const staticAccounts = message.staticAccounts.map(String)
    const signerCount = message.header.numSignerAccounts
    const requiredSigners = staticAccounts.slice(
      0,
      signerCount
    )

    const addressTableLookupCount =
      "addressTableLookups" in message &&
      Array.isArray(message.addressTableLookups)
        ? message.addressTableLookups.length
        : 0

    const unresolved = new Set<number>()

    const instructions = message.instructions.map(
      (instruction, instructionIndex) => {
        const programAddress =
          instruction.programAddressIndex <
          staticAccounts.length
            ? staticAccounts[
                instruction.programAddressIndex
              ]
            : null

        if (programAddress === null) {
          unresolved.add(
            instruction.programAddressIndex
          )
        }

        return {
          instructionIndex,
          programAddressIndex:
            instruction.programAddressIndex,
          programAddress,
          accountIndices: [
            ...(instruction.accountIndices ?? []),
          ],
          dataLength: instruction.data?.length ?? 0,
        }
      }
    )

    const reasons: string[] = []

    if (
      signerCount < 1 ||
      requiredSigners.length !== signerCount
    ) {
      reasons.push(
        "PONDOX_WIRE_SIGNER_LAYOUT_INVALID"
      )
    }

    if (staticAccounts.length === 0) {
      reasons.push(
        "PONDOX_WIRE_STATIC_ACCOUNTS_EMPTY"
      )
    }

    if (instructions.length === 0) {
      reasons.push(
        "PONDOX_WIRE_INSTRUCTIONS_EMPTY"
      )
    }

    if (
      instructions.some(
        instruction =>
          instruction.programAddress !== null &&
          !PONDOX_ALLOWED_PROGRAM_SET.has(
            instruction.programAddress
          )
      )
    ) {
      reasons.push(
        "PONDOX_WIRE_PROGRAM_NOT_ALLOWED"
      )
    }

    if (unresolved.size > 0) {
      reasons.push(
        "PONDOX_WIRE_PROGRAM_ADDRESS_UNRESOLVED"
      )
    }

    return {
      schemaVersion: 1,
      status:
        reasons.length === 0 ? "DECODED" : "BLOCKED",
      transactionVersion: message.version,
      wireByteLength: wireBytes.length,
      wireSha256,
      feePayer: staticAccounts[0] ?? null,
      requiredSigners,
      staticAccountCount: staticAccounts.length,
      addressTableLookupCount,
      instructions,
      unresolvedProgramAddressIndices: [
        ...unresolved,
      ],
      blockingReasons: reasons,
      signingEnabled: false,
      transactionSubmitted: false,
      source: "SOLANA_UNSIGNED_WIRE_INSPECTION",
    }
  } catch {
    return blocked("PONDOX_WIRE_DECODE_FAILED")
  }
}