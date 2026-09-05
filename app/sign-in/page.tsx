import Link from "next/link"
import { privateOwnerAccess } from "../../src/auth/server"
import { privateAuthConfigured } from "../../src/auth/owner-policy"
import { signIn, signOut } from "./actions"

export const dynamic = "force-dynamic"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const authorized = await privateOwnerAccess()
  const { status } = await searchParams

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16 text-zinc-100">
      <Link className="text-sm text-cyan-300" href="/">
        ← Public Radar
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">
        Private Intelligence
      </h1>

      {authorized ? (
        <section className="mt-8 space-y-4">
          <p>
            Your verified owner account can access private research.
          </p>
          <p>
            <a className="text-cyan-300" href="/private">
              Open private workspace
            </a>
          </p>
          <form action={signOut}>
            <button className="rounded border border-zinc-600 px-4 py-2">
              Sign out
            </button>
          </form>
        </section>
      ) : (
        <section className="mt-8 space-y-4">
          <p>
            Public observations remain available without signing in.
            Alpha rules and Shadow Portfolio data are owner-only.
          </p>

          {privateAuthConfigured() ? (
            <form action={signIn} className="space-y-3">
              <label className="block" htmlFor="email">
                Email address
              </label>
              <input
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
              <button className="rounded border border-cyan-700 px-4 py-2">
                Send sign-in link
              </button>
            </form>
          ) : (
            <p>Private sign-in is not configured yet.</p>
          )}

          {status === "sent" && (
            <p role="status">
              If this address is authorized, check your inbox and open
              the link in this browser.
            </p>
          )}
          {status === "unavailable" && (
            <p role="alert">
              Sign-in could not be completed. Check configuration and
              try again later.
            </p>
          )}
        </section>
      )}
    </main>
  )
}
