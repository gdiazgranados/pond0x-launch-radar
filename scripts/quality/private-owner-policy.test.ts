import test from "node:test"
import assert from "node:assert/strict"
import {
  isPrivateOwner,
  type VerifiedUser,
} from "../../src/auth/owner-policy"

const email = "owner@example.test"
const owner: VerifiedUser = {
  id: "owner-id",
  email,
  email_confirmed_at: "2026-09-05T00:00:00Z",
}

test("only the confirmed allowlisted owner is authorized", () => {
  assert.equal(isPrivateOwner(owner, email, owner.id), true)

  const rejected: Array<VerifiedUser | null> = [
    null,
    { ...owner, id: "other" },
    { ...owner, email: "other@example.test" },
    { ...owner, email_confirmed_at: undefined },
    { ...owner, is_anonymous: true },
  ]

  for (const user of rejected) {
    assert.equal(isPrivateOwner(user, email, owner.id), false)
  }

  assert.equal(isPrivateOwner(owner, undefined, owner.id), false)
  assert.equal(isPrivateOwner(owner, email, undefined), false)
})

test("user-controlled metadata cannot substitute owner identity", () => {
  const forged = {
    id: "other",
    email: "other@example.test",
    email_confirmed_at: "2026-09-05T00:00:00Z",
    user_metadata: { email },
    app_metadata: { owner: true },
  }

  assert.equal(
    isPrivateOwner(forged, email, owner.id),
    false
  )
})
