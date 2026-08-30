import Link from "next/link"
import type { EvidenceLedger } from "../../types/evidence"

export function EvidencePanel({ ledger }: { ledger: EvidenceLedger | null }) {
  return <section className="mt-5 rounded-2xl border border-cyan-500/20 bg-[#05070a] p-5">
    <h2 className="text-lg font-semibold text-white">Evidence &amp; Telegram</h2>
    <p className="mt-2 text-sm text-slate-400">Shared event record · Observation only · No messages sent by this strategy</p>
    {!ledger ? <p className="mt-4 text-slate-400">Awaiting the first published evidence sweep. Missing data does not mean no activity.</p> : <>
      <p className="mt-2 text-xs text-slate-500">Evaluated: {ledger.generatedAt} · Historical snapshot, not a live feed</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 p-3 text-sm text-cyan-200">On-chain: {ledger.context.chainStatus}</div>
        <div className="rounded-xl border border-white/10 p-3 text-sm text-cyan-200">Web/API: {ledger.context.webStatus}</div>
        <div className="rounded-xl border border-white/10 p-3 text-sm text-slate-300">Claims available: NOT CONFIRMED</div>
      </div>
      {ledger.issues.length > 0 && <p className="mt-3 text-sm text-amber-300">Coverage: {ledger.issues.join(" · ")}</p>}
      <p className="mt-4 text-sm text-slate-400">Recent evidence events — eligibility is a simulation, not delivery confirmation.</p>
      {ledger.events.length === 0 && <p className="mt-3 text-sm text-slate-500">No new evidence events recorded.</p>}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{ledger.events.slice(0, 8).map(event =>
        <Link key={event.id} href={`/events/${event.id}`} className="rounded-xl border border-white/10 p-4 hover:border-cyan-500/50 focus-visible:outline-2 focus-visible:outline-cyan-400">
          <div className="text-sm font-semibold text-white">{event.kind.replaceAll("_", " ")}</div>
          <div className="mt-2 text-xs text-slate-400">{event.interval.startAt} — {event.interval.endAt}</div>
          <div className="mt-2 text-sm text-cyan-200">{event.decision.eligible ? "Would notify" : "Observation only"} · Not sent</div>
          <p className="mt-2 text-sm text-slate-400">{event.decision.reason}</p>
          <span className="mt-3 inline-block text-sm text-cyan-300">View evidence and message preview →</span>
        </Link>)}</div>
    </>}
  </section>
}
