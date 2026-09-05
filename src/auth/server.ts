import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { cache } from "react"
import { isPrivateOwner, privateAuthConfigured } from "./owner-policy"

export async function authClient() {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
      cookies: {
        getAll: () => store.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) =>
              store.set(name, value, options)
            )
          } catch {
            // Server Components cannot write cookies; proxy refreshes them.
          }
        },
      },
    }
  )
}

export const privateOwnerAccess = cache(async () => {
  if (!privateAuthConfigured()) return false

  const store = await cookies()
  const hasAuthCookie = store
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        cookie.name.includes("-auth-token")
    )
  if (!hasAuthCookie) return false

  try {
    const client = await authClient()
    const { data, error } = await client.auth.getUser()
    return (
      !error &&
      isPrivateOwner(
        data.user,
        process.env.PRIVATE_OWNER_EMAIL,
        process.env.PRIVATE_OWNER_USER_ID
      )
    )
  } catch {
    return false
  }
})
