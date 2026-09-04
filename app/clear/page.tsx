"use client"

import EcosystemNavigation from "../../components/ecosystem-navigation"
import { useRadarData } from "../hooks/useRadarData"

function fmt(value: unknown, digits = 6) {
  if (value === null || value === undefined || value === "") return "—"
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { maximumFractionDigits: digits })
    : "—"
}

function shortAddress(address?: string) {
  return address ? `${address.slice(0, 7)}…${address.slice(-7)}` : "—"
}

function stateTone(state?: string) {
  switch (state) {
    case "VERIFIED":
    case "QUOTE_AVAILABLE":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    case "OBSERVED":
    case "LIMITED":
    case "HISTORICAL_QUOTE":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200"
    case "NO_QUOTE":
    case "UNPROVEN":
      return "border-white/10 bg-white/5 text-slate-400"
    default:
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-200"
  }
}

function stateLabel(state?: string) {
  return String(state || "NOT_TESTED").replaceAll("_", " ")
}

function FlowNode({ title, detail, tone = "cyan" }: { title: string; detail: string; tone?: "cyan" | "violet" | "emerald" }) {
  const colors = tone === "violet"
    ? "border-violet-500/30 bg-violet-500/10 text-violet-200"
    : tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
  return (
    <div className={`min-w-0 flex-1 rounded-2xl border p-4 ${colors}`}>
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-1 text-xs text-slate-400">{detail}</div>
    </div>
  )
}

export default function ClearPage() {
  const { clearIntelligence: clear, loading } = useRadarData()
  const capabilities = Array.isArray(clear?.capabilities) ? clear.capabilities : []
  const evidence = Array.isArray(clear?.evidence) ? clear.evidence : []
  const paper = clear?.tokens?.paper || {}
  const ccpu = clear?.tokens?.ccpu || {}
  const accounting = clear?.accounting || {}
  const routes = clear?.routes || {}
  const portal = routes.portalObservation || {}
  const recentIssuance = Array.isArray(clear?.activity?.issuanceEvents) && clear.activity.issuanceEvents.length > 0

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020406] text-white">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-violet-500/20 bg-gradient-to-br from-[#090712] via-[#05070b] to-[#031014] p-5 shadow-[0_0_45px_rgba(139,92,246,0.08)] sm:p-7">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-violet-300">Pond0x Signal Terminal</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Clear Intelligence</h1>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200">
              {stateLabel(clear?.status || "INITIALIZING")}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">SCORE-NEUTRAL</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Independent observation of PAPER, CCPU, tracked Clear accounts, route quotes and the activation path described by Clear USD Factory. Evidence here does not change Pond0x launch scores.
          </p>
          <EcosystemNavigation current="clear" site="radar" />
        </header>

        {loading && !clear ? (
          <div className="mt-5 h-72 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
        ) : (
          <>
            <section className="mt-5 rounded-3xl border border-cyan-500/20 bg-cyan-950/[0.08] p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Observed issuance evidence</div>
                  <h2 className="mt-1 text-2xl font-semibold">{recentIssuance ? "Recent PAPER issuance detected" : "PAPER issuance mechanism observed"}</h2>
                </div>
                <div className="text-xs text-slate-500">Last observation: {clear?.generatedAt ? new Date(clear.generatedAt).toLocaleString() : "—"}</div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Portal quote observed</div>
                <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <FlowNode title="SOL" detail={portal.input || "User input"} />
                  <div className="text-center text-xl text-slate-600">→</div>
                  <FlowNode title="USDC" detail="Routing asset" tone="violet" />
                  <div className="text-center text-xl text-slate-600">→</div>
                  <FlowNode title="PAPER" detail={portal.output || "User receives PAPER"} tone="emerald" />
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-violet-300">Observed transaction pattern</div>
                <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <FlowNode title="USDC" detail="Transfer to tracked Clear account" />
                  <div className="text-center text-xl text-slate-600">→</div>
                  <FlowNode title="CCPU" detail="Intermediate token — role inferred" tone="violet" />
                  <div className="text-center text-xl text-slate-600">→</div>
                  <FlowNode title="PAPER" detail="Mint observed with PRNT interaction" tone="emerald" />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">The portal does not expose CCPU in this flow. Its intermediary role is inferred from matched on-chain movements and has not been confirmed as official utility.</p>
              </div>
            </section>

            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["PAPER Supply", fmt(paper.supply), shortAddress(paper.mint)],
                ["CCPU Supply", fmt(ccpu.supply), shortAddress(ccpu.mint)],
                ["Tracked CCPU Account", fmt(ccpu.reserveBalance), "observed balance; reserve role unproven"],
                ["Recent Issuance (24h)", recentIssuance ? clear.activity.issuanceEvents.length : 0, recentIssuance ? "on-chain events detected" : "no recent event detected"],
                ["Tracked Vault USDC", fmt(accounting.vaultUsdc, 2), `backing: ${accounting.backingStatus || "UNPROVEN"}`],
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
                  <div className="mt-2 break-words text-xl font-semibold text-white">{value}</div>
                  <div className="mt-1 break-words font-mono text-xs leading-5 text-slate-500">{note}</div>
                </div>
              ))}
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-300">Clear USD Factory path</div>
                <h2 className="mt-1 text-xl font-semibold">Where the process stands</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {capabilities.map((capability: any) => (
                    <div key={capability.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <span className="text-sm text-slate-300">{capability.label}</span>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${stateTone(capability.state)}`}>{stateLabel(capability.state)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-400">Route watch</div>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Portal: SOL → USDC → PAPER", routes.portalPaper],
                      ["USDC → PAPER", routes.usdcToPaper],
                      ["PAPER → USDC", routes.paperToUsdc],
                      ["USDC → CCPU", routes.usdcToCcpu],
                      ["CCPU → USDC", routes.ccpuToUsdc],
                    ].map(([label, state]) => (
                      <div key={label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                        <span className="text-sm text-slate-300">{label}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stateTone(String(state))}`}>{stateLabel(String(state))}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 border-t border-white/5 pt-4 text-xs leading-5 text-slate-500">QUOTE AVAILABLE means a current aggregator quote returned output. HISTORICAL QUOTE is prior portal evidence. NO QUOTE means a completed probe returned no output. NOT TESTED means the probe could not establish a result.</p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-400">Evidence ledger</div>
                  <div className="mt-4 space-y-3">
                    {evidence.map((item: any) => (
                      <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-white/10 bg-black/20 p-3 hover:border-cyan-500/30">
                        <div className="text-xs font-semibold text-emerald-300">{item.type}</div>
                        <div className="mt-1 text-sm text-slate-200">{item.label} ↗</div>
                        <div className="mt-1 text-[11px] text-slate-600">{item.source}</div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-5 rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-5 text-sm leading-6 text-slate-400">
              <div className="font-semibold text-amber-200">Interpretation guardrails</div>
              <p className="mt-2">A portal quote proves only that a quote was displayed at a particular moment; it does not prove completed execution or secondary-market liquidity. Tracked balances do not prove backing or redemption. Clear exit queues currently describe LRT withdrawals and must not be treated as PAPER exits. Stronger activation evidence would be a verified PAPER repayment or redemption, an LRT-collateralized borrow, or sustained executable secondary liquidity.</p>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
