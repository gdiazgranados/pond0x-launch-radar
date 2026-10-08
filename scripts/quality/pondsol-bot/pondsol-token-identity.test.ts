import test from "node:test"
import assert from "node:assert/strict"

import {
  PONDSOL_TOKEN_IDENTITY,
  verifyPondSolIdentity,
  type PondSolMintObservation,
} from "../../../src/private-alpha/pondsol-bot/pondsol-token-identity"

const valid: PondSolMintObservation = {
  mint: PONDSOL_TOKEN_IDENTITY.mint,
  ownerProgram: PONDSOL_TOKEN_IDENTITY.tokenProgram,
  decimals: 9,
  accountType: "mint",
  finalizedSlot: 454644484,
}

test("accepts matching finalized mint observation", () => {
  const result = verifyPondSolIdentity(valid)
  assert.equal(result.verified, true)
  assert.deepEqual(result.reasons, [])
})

test("rejects missing observation", () => {
  const result = verifyPondSolIdentity(null)
  assert.equal(result.verified, false)
  assert.deepEqual(result.reasons, ["MISSING_MINT_OBSERVATION"])
})

test("rejects wrong mint", () => {
  const result = verifyPondSolIdentity({
    ...valid,
    mint: "wrong-mint",
  })
  assert.deepEqual(result.reasons, ["MINT_IDENTITY_MISMATCH"])
})

test("rejects wrong decimals", () => {
  const result = verifyPondSolIdentity({
    ...valid,
    decimals: 6,
  })
  assert.deepEqual(result.reasons, ["MINT_IDENTITY_MISMATCH"])
})

test("rejects wrong token program", () => {
  const result = verifyPondSolIdentity({
    ...valid,
    ownerProgram: "wrong-program",
  })
  assert.deepEqual(result.reasons, ["MINT_IDENTITY_MISMATCH"])
})

test("rejects non-mint account", () => {
  const result = verifyPondSolIdentity({
    ...valid,
    accountType: "account",
  })
  assert.deepEqual(result.reasons, ["MINT_IDENTITY_MISMATCH"])
})

test("rejects invalid finalized slot", () => {
  const result = verifyPondSolIdentity({
    ...valid,
    finalizedSlot: 0,
  })
  assert.deepEqual(result.reasons, ["INVALID_FINALIZED_SLOT"])
})