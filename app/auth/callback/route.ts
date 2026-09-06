import { NextRequest, NextResponse } from "next/server"
import { authClient } from "../../../src/auth/server"
import {
  isPrivateOwner,
  privateAuthConfigured,
} from "../../../src/auth/owner-policy"

export async function GET(request: NextRequest) {
  let destination = "/sign-in?status=unavailable"
  const code = request.nextUrl.searchParams.get("code")

  if (
    privateAuthConfigured() &&
    code &&
    code.length < 4096
  ) {
    const client = await authClient()
    const { error } =
      await client.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data, error: userError } =
        await client.auth.getUser()

      if (
        !userError &&
        isPrivateOwner(
          data.user,
          process.env.PRIVATE_OWNER_EMAIL,
          process.env.PRIVATE_OWNER_USER_ID
        )
      ) {
        destination = "/private"
      } else {
        await client.auth.signOut({ scope: "local" })
      }
    }
  }

  // Never accept a user-controlled redirect destination.
  const response = NextResponse.redirect(
    new URL(destination, request.url)
  )
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
