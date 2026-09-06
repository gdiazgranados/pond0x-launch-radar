import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"
import { privateAuthConfigured } from "./src/auth/owner-policy"

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  response.headers.set("Cache-Control", "private, no-store")

  const hasAuthCookie = request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        cookie.name.includes("-auth-token")
    )

  if (!privateAuthConfigured() || !hasAuthCookie) return response

  const client = createServerClient(
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
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          response.headers.set("Cache-Control", "private, no-store")
        },
      },
    }
  )

  try {
    await client.auth.getUser()
  } catch {
    // Route-level authorization remains fail-closed.
  }

  return response
}

export const config = {
  matcher: ["/private/:path*", "/sign-in", "/auth/:path*"],
}
