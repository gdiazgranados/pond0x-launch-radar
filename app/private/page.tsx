import { redirect } from "next/navigation"
import { privateOwnerAccess } from "../../src/auth/server"

export const dynamic = "force-dynamic"

export default async function PrivateWorkspacePage() {
  if (!(await privateOwnerAccess())) redirect("/sign-in")

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16 text-zinc-100">
      <a className="text-sm text-cyan-300" href="/">
        ← Public Radar
      </a>
      <p className="mt-8 text-xs uppercase tracking-[0.2em] text-fuchsia-300">
        Owner-only · no-store
      </p>
      <h1 className="mt-3 text-3xl font-semibold">
        Private Intelligence
      </h1>
      <p className="mt-4 max-w-2xl text-zinc-400">
        Authentication foundation is active. Alpha Engine and Shadow
        Portfolio persistence are intentionally not connected yet.
      </p>
    </main>
  )
}
