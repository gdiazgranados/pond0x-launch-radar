"use server"

import { redirect } from "next/navigation"
import { authClient } from "../../src/auth/server"
import { privateAuthConfigured } from "../../src/auth/owner-policy"

export async function signIn(form: FormData) {
  if (!privateAuthConfigured()) {
    redirect("/sign-in?status=unavailable")
  }

  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase()

  // Do not disclose whether the submitted address matches the owner.
  if (
    email !==
    process.env.PRIVATE_OWNER_EMAIL!.trim().toLowerCase()
  ) {
    redirect("/sign-in?status=sent")
  }

  const origin = new URL(process.env.PRIVATE_AUTH_ORIGIN!)
  if (
    origin.protocol !== "https:" &&
    origin.hostname !== "localhost"
  ) {
    redirect("/sign-in?status=unavailable")
  }

  const client = await authClient()
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: new URL("/auth/callback", origin).href,
    },
  })

  redirect(
    error
      ? "/sign-in?status=unavailable"
      : "/sign-in?status=sent"
  )
}

export async function signOut() {
  if (privateAuthConfigured()) {
    const client = await authClient()
    await client.auth.signOut({ scope: "local" })
  }
  redirect("/")
}
