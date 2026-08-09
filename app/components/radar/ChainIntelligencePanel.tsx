function fmt(v: any, digits = 1) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
}
function when(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}
function matchTone(v: number) {
  if (v >= 80) return 'text-emerald-300'
  if (v >= 65) return 'text-yellow-300'
  if (v >= 45) return 'text-orange-300'
  return 'text-slate-300'
}
export function ChainIntelligencePanel({ chain, baseline }: { chain?: any; baseline?: any }) {
  if (!chain) return null
  const a = chain.cycleAnalytics || {}
  const p = chain.predictor || {}
  const m = chain.patternMatch || {}
  const w = chain.windows?.['5m'] || {}
  const match = Number(m.historicalPatternMatchPct || 0)
  return (
    <section className="mb-5 rounded-3xl border border-cyan-500/20 bg-cyan-950/10 p-5 shadow-[0_0_30px_rgba(34,211,238,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-400">On-chain Intelligence</div><h2 className="mt-1 text-xl font-semibold">wPOND Distribution Cycle Predictor</h2></div>
        <div className="flex gap-2 text-xs"><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">{chain.activityState || 'UNKNOWN'}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">v{chain.version || '—'}</span></div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Pattern match</div><div className={`mt-1 text-2xl font-semibold ${matchTone(match)}`}>{fmt(m.historicalPatternMatchPct)}%</div><div className="mt-1 text-xs text-slate-500">{m.status || 'NO_BASELINE'} · {m.confidence || 'LOW'} confidence</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Funding cadence</div><div className="mt-1 text-2xl font-semibold text-cyan-300">{a.cadenceConfidence || 'LOW'}</div><div className="mt-1 text-xs text-slate-500">median {fmt(a.medianFundingCadenceSeconds)}s</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Claim after funding</div><div className="mt-1 text-2xl font-semibold text-yellow-300">{fmt(a.claimAfterFundingProbabilityPct)}%</div><div className="mt-1 text-xs text-slate-500">observed historical correlation</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Automation confidence</div><div className="mt-1 text-2xl font-semibold text-emerald-300">{fmt(a.automationConfidence,0)}/100</div><div className="mt-1 text-xs text-slate-500">{a.cycleSignal || 'NO_STABLE_CYCLE'}</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Predictor</div><div className="mt-1 text-2xl font-semibold text-orange-300">{p.status || '—'}</div><div className="mt-1 text-xs text-slate-500">±{fmt(p.fundingWindowHalfWidthSeconds,0)}s window</div></div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-slate-500">Next statistical funding window</div><div className="mt-1 font-mono text-sm text-white">{when(p.nextFundingExpectedAt)}</div><div className="mt-2 text-xs text-slate-500">Claim window after funding: {p.expectedClaimWindowSeconds ? `${p.expectedClaimWindowSeconds.start}s → ${p.expectedClaimWindowSeconds.end}s` : '—'}</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-slate-500">Pattern components</div><div className="mt-1 text-sm text-white">Cadence similarity {fmt(m.components?.cadenceSimilarityPct)}%</div><div className="mt-2 text-xs text-slate-500">Delay similarity {fmt(m.components?.claimDelaySimilarityPct)}% · proximity {fmt(m.components?.predictorProximityPct)}%</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-slate-500">Last 5 minutes</div><div className="mt-1 text-lg">{fmt(w.rewards,0)} rewards · {fmt(w.wpondDistributed)} wPOND</div><div className="mt-2 text-xs text-slate-500">{fmt(w.uniqueRecipients,0)} unique recipients · chain score {fmt(chain.chainConfirmationScore,0)}/100</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-slate-500">Historical baseline</div><div className="mt-1 text-lg">{baseline ? `${fmt(baseline.cyclesAnalyzed,0)} cycles` : 'Not built yet'}</div><div className="mt-2 text-xs text-slate-500">{baseline ? `${fmt(baseline.correlatedCycles,0)} correlated · ${fmt(baseline.correlationRatePct)}%` : 'Run the historical backfill workflow once.'}</div></div>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-400">
        <span className="font-semibold text-slate-300">Interpretation:</span> {m.interpretation || 'Waiting for enough historical data.'}
        {m.liveEvidence === false ? <span className="ml-1 text-slate-500">No fresh on-chain trigger is active.</span> : null}
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">Pattern Match measures similarity to observed historical cycles; it is not a probability of a claim or launch. Funding timing does not prove a claim or launch is imminent, and distribution amounts are not assumed to be funded 1:1 by the preceding swap.</p>
    </section>
  )
}
