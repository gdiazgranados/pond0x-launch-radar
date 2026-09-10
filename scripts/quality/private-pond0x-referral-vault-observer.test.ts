import test from "node:test"
import assert from "node:assert/strict"
import {
  analyzePond0xVaultTransaction,
  buildPond0xReferralVaultSnapshot,
  PONDOX_REFERRAL_ACCOUNT,
  PONDOX_REFERRAL_PROGRAM,
  PONDOX_WPOND_VAULT,
  PONDOX_WSOL_VAULT,
  type Pond0xParsedTransaction,
} from "../../src/private-alpha/pond0x-referral-vault-observer"
import {
  WPOND_MINT,
  WRAPPED_SOL_MINT,
} from "../../src/private-alpha/wpond-quote-observer"

function tokenBalance(
  accountIndex: number,
  mint: string,
  amount: string,
  decimals: number
) {
  return {
    accountIndex,
    mint,
    owner: "token-owner",
    uiTokenAmount: { amount, decimals },
  }
}

test("measures an exact WSOL referral deposit share", () => {
  const transaction: Pond0xParsedTransaction = {
    slot: 445_964_317,
    blockTime: 1_789_068_737,
    transaction: {
      message: {
        accountKeys: [
          {
            pubkey: "user-authority",
            signer: true,
          },
          "user-source",
          PONDOX_WSOL_VAULT,
          "pool-one",
          "pool-two",
        ],
        instructions: [],
      },
    },
    meta: {
      err: null,
      fee: 9_197,
      computeUnitsConsumed: 135_357,
      preTokenBalances: [
        tokenBalance(
          2,
          WRAPPED_SOL_MINT,
          "53738531713",
          9
        ),
        tokenBalance(3, WRAPPED_SOL_MINT, "1000", 9),
        tokenBalance(4, WRAPPED_SOL_MINT, "2000", 9),
      ],
      postTokenBalances: [
        tokenBalance(
          2,
          WRAPPED_SOL_MINT,
          "53738542379",
          9
        ),
        tokenBalance(
          3,
          WRAPPED_SOL_MINT,
          "940890",
          9
        ),
        tokenBalance(
          4,
          WRAPPED_SOL_MINT,
          "162554",
          9
        ),
      ],
      innerInstructions: [{
        instructions: [{
          program: "spl-token",
          parsed: {
            type: "transfer",
            info: {
              source: "user-source",
              destination: PONDOX_WSOL_VAULT,
              authority: "user-authority",
              amount: "10666",
            },
          },
        }],
      }],
    },
  }

  const flow = analyzePond0xVaultTransaction({
    signature: "deposit-signature",
    vaultTokenAccount: PONDOX_WSOL_VAULT,
    expectedMint: WRAPPED_SOL_MINT,
    transaction,
  })

  assert.ok(flow)
  assert.equal(flow.direction, "DEPOSIT")
  assert.equal(flow.deltaRaw, "10666")
  assert.equal(flow.amountRaw, "10666")
  assert.ok(
    Math.abs(
      (flow.estimatedDepositShareBps ?? 0) - 95.994
    ) < 0.001
  )
  assert.equal(
    flow.estimateBasis,
    "SAME_MINT_POSITIVE_DELTAS"
  )
  assert.deepEqual(flow.signers, ["user-authority"])
  assert.deepEqual(flow.sources, ["user-source"])
  assert.deepEqual(
    flow.destinations,
    [PONDOX_WSOL_VAULT]
  )
})

test("identifies a withdrawal destination without inventing bps", () => {
  const destination = "withdrawal-destination"
  const transaction: Pond0xParsedTransaction = {
    transaction: {
      message: {
        accountKeys: [
          {
            pubkey: "vault-authority",
            signer: true,
          },
          PONDOX_WSOL_VAULT,
          destination,
        ],
        instructions: [{
          program: "spl-token",
          parsed: {
            type: "transfer",
            info: {
              source: PONDOX_WSOL_VAULT,
              destination,
              authority: "vault-authority",
              amount: "3000",
            },
          },
        }],
      },
    },
    meta: {
      err: null,
      preTokenBalances: [
        tokenBalance(1, WRAPPED_SOL_MINT, "10000", 9),
        tokenBalance(2, WRAPPED_SOL_MINT, "0", 9),
      ],
      postTokenBalances: [
        tokenBalance(1, WRAPPED_SOL_MINT, "7000", 9),
        tokenBalance(2, WRAPPED_SOL_MINT, "3000", 9),
      ],
    },
  }

  const flow = analyzePond0xVaultTransaction({
    signature: "withdrawal-signature",
    vaultTokenAccount: PONDOX_WSOL_VAULT,
    expectedMint: WRAPPED_SOL_MINT,
    transaction,
  })

  assert.ok(flow)
  assert.equal(flow.direction, "WITHDRAWAL")
  assert.equal(flow.deltaRaw, "-3000")
  assert.equal(flow.estimatedDepositShareBps, null)
  assert.deepEqual(flow.destinations, [destination])
})

test("summarizes withdrawals from pinned Pond0x vaults", () => {
  const deposit = analyzePond0xVaultTransaction({
    signature: "deposit",
    vaultTokenAccount: PONDOX_WSOL_VAULT,
    expectedMint: WRAPPED_SOL_MINT,
    transaction: {
      transaction: {
        message: {
          accountKeys: [
            PONDOX_WSOL_VAULT,
            "deposit-source",
          ],
          instructions: [{
            parsed: {
              type: "transfer",
              info: {
                source: "deposit-source",
                destination: PONDOX_WSOL_VAULT,
              },
            },
          }],
        },
      },
      meta: {
        err: null,
        preTokenBalances: [
          tokenBalance(0, WRAPPED_SOL_MINT, "10", 9),
        ],
        postTokenBalances: [
          tokenBalance(0, WRAPPED_SOL_MINT, "11", 9),
        ],
      },
    },
  })
  const withdrawalDestination = "beneficiary-token-account"
  const withdrawal = analyzePond0xVaultTransaction({
    signature: "withdrawal",
    vaultTokenAccount: PONDOX_WPOND_VAULT,
    expectedMint: WPOND_MINT,
    transaction: {
      transaction: {
        message: {
          accountKeys: [
            PONDOX_WPOND_VAULT,
            withdrawalDestination,
          ],
          instructions: [{
            parsed: {
              type: "transfer",
              info: {
                source: PONDOX_WPOND_VAULT,
                destination: withdrawalDestination,
              },
            },
          }],
        },
      },
      meta: {
        err: null,
        preTokenBalances: [
          tokenBalance(0, WPOND_MINT, "20", 3),
          tokenBalance(1, WPOND_MINT, "0", 3),
        ],
        postTokenBalances: [
          tokenBalance(0, WPOND_MINT, "15", 3),
          tokenBalance(1, WPOND_MINT, "5", 3),
        ],
      },
    },
  })

  assert.ok(deposit)
  assert.ok(withdrawal)

  const snapshot = buildPond0xReferralVaultSnapshot({
    observedAt: "2026-09-10T20:00:00.000Z",
    referralAccount: PONDOX_REFERRAL_ACCOUNT,
    referralProgram: PONDOX_REFERRAL_PROGRAM,
    referralExecutable: false,
    balances: [{
      tokenAccount: PONDOX_WSOL_VAULT,
      mint: WRAPPED_SOL_MINT,
      owner: PONDOX_REFERRAL_ACCOUNT,
      rawAmount: "53738478383",
      decimals: 9,
    }, {
      tokenAccount: PONDOX_WPOND_VAULT,
      mint: WPOND_MINT,
      owner: PONDOX_REFERRAL_ACCOUNT,
      rawAmount: "235531219126",
      decimals: 3,
    }],
    flows: [deposit, withdrawal],
  })

  assert.equal(snapshot.depositCount, 1)
  assert.equal(snapshot.withdrawalCount, 1)
  assert.equal(snapshot.unchangedCount, 0)
  assert.deepEqual(
    snapshot.withdrawalDestinations,
    [withdrawalDestination]
  )
  assert.equal(snapshot.walletConnected, false)
  assert.equal(snapshot.transactionRequested, false)
})

test("fails closed when a vault identity changes", () => {
  assert.throws(
    () => buildPond0xReferralVaultSnapshot({
      observedAt: "2026-09-10T20:00:00.000Z",
      referralAccount: PONDOX_REFERRAL_ACCOUNT,
      referralProgram: PONDOX_REFERRAL_PROGRAM,
      referralExecutable: false,
      balances: [{
        tokenAccount: "replacement-vault",
        mint: WRAPPED_SOL_MINT,
        owner: PONDOX_REFERRAL_ACCOUNT,
        rawAmount: "1",
        decimals: 9,
      }, {
        tokenAccount: PONDOX_WPOND_VAULT,
        mint: WPOND_MINT,
        owner: PONDOX_REFERRAL_ACCOUNT,
        rawAmount: "1",
        decimals: 3,
      }],
      flows: [],
    }),
    /identity changed/
  )
})
