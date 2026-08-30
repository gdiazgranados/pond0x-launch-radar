import Link from "next/link"
import { notFound } from "next/navigation"
import type { EvidenceEvent } from "../../types/evidence"

export const dynamic = "force-dynamic"

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[a-f0-9]{24}$/.test(id)) notFound()
  const base = process.env.NEXT_PUBLIC_RADAR_DATA_BASE || "https://raw.githubusercontent.com/gdiazgranados/pond0x-launch-radar/radar-data/data"
  const response = await fetch(`${base}/evidence-events/${id}.json`, { cache: "no-store" })
  if (response.status === 404) notFound()
  if (!response.ok) throw new Error("Evidence archive temporarily unavailable")
  const event: EvidenceEvent = await response.json()
  if (event.id !== id || event.delivery.status !== "OBSERVATION_ONLY") throw new Error("Unsupported evidence record")
  return <main className="min-h-screen bg-[#020406] px-5 py-10 text-slate-200">
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="text-cyan-300">← Pond0x Radar</Link>
      <h1 className="mt-6 text-2xl font-semibold text-white">{event.kind.replaceAll("_", " ")}</h1>
      <p className="mt-2 text-sm text-slate-400">Event {event.id} · {event.observedAt}</p>
      <p className="mt-4 text-amber-200">Observation only — not sent to Telegram.</p>
      <p className="mt-2">{event.decision.eligible ? "Would notify" : "Below notification threshold"}: {event.decision.reason}</p>
      <p className="mt-2 text-sm text-slate-400">This record describes its original interval. It does not assert current claim availability.</p>
      <h2 className="mt-8 text-lg font-semibold">Message preview</h2>
      <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-white/5 p-5 text-sm">{event.message}</pre>
      <h2 className="mt-8 text-lg font-semibold">Supporting evidence</h2>
      {event.evidence.transfers?.map(transfer => <article key={transfer.id} className="mt-3 rounded-xl border border-white/10 p-4 text-sm">
        <p className="text-cyan-200">{transfer.kind} · {transfer.occurredAt}</p>
        <p className="mt-2 break-all">From: {transfer.from}</p><p className="break-all">To: {transfer.to}</p>
        <p className="mt-2 break-all">Amount: {transfer.amount} · Mint: {transfer.mint}</p>
        <a className="mt-3 inline-block break-all text-cyan-300" href={`https://solscan.io/tx/${encodeURIComponent(transfer.signature)}`} target="_blank" rel="noopener noreferrer">Transaction: {transfer.signature}</a>
      </article>)}
      {event.evidence.changes?.map((change, index) => <article key={`${change.target}-${index}`} className="mt-3 rounded-xl border border-white/10 p-4 text-sm">
        <p className="break-all">{change.kind}: {change.target}</p><p>{String(change.before)} → {String(change.after)}</p>
      </article>)}
      {event.evidence.issues?.map(issue => <p key={issue} className="mt-3 text-amber-200">{issue}</p>)}
    </div>
  </main>
}
