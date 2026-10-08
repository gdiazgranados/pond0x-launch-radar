export const PONDSOL_TOKEN_IDENTITY = Object.freeze({
  chain: "SOLANA",
  mint: "Ep83qXdvJbofEgpPqphGRq4eMnpjBVUGPYz32QyrWaaC",
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  decimals: 9,
} as const)

export type PondSolMintObservation = {
  mint: string
  ownerProgram: string
  decimals: number
  accountType: string
  finalizedSlot: number
}

export type PondSolIdentityResult = {
  verified: boolean
  reasons: string[]
}

export function verifyPondSolIdentity(
  observation: PondSolMintObservation | null
): PondSolIdentityResult {
  const reject = (reason: string): PondSolIdentityResult => ({
    verified: false,
    reasons: [reason],
  })

  if (!observation || typeof observation !== "object") {
    return reject("MISSING_MINT_OBSERVATION")
  }

  if (
    observation.mint !== PONDSOL_TOKEN_IDENTITY.mint ||
    observation.ownerProgram !== PONDSOL_TOKEN_IDENTITY.tokenProgram ||
    observation.decimals !== PONDSOL_TOKEN_IDENTITY.decimals ||
    observation.accountType !== "mint"
  ) {
    return reject("MINT_IDENTITY_MISMATCH")
  }

  if (
    !Number.isSafeInteger(observation.finalizedSlot) ||
    observation.finalizedSlot <= 0
  ) {
    return reject("INVALID_FINALIZED_SLOT")
  }

  return { verified: true, reasons: [] }
}