function fmt(v: any, digits = 1) {
  const n = Number(v)
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: digits })
    : "—"
}

function when(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString()
}

function matchTone(v: number) {
  if (v >= 80) return "text-emerald-300"
  if (v >= 65) return "text-yellow-300"
  if (v >= 45) return "text-orange-300"
  return "text-slate-300"
}

function getWindowState(p: any) {
  const expectedAt = p?.nextFundingExpectedAt
  const halfWidthSeconds = Number(p?.fundingWindowHalfWidthSeconds || 0)

  if (!expectedAt) {
    return {
      label: "NO WINDOW",
      tone: "text-slate-300",
      badge: "border-white/10 bg-white/5 text-slate-300",
      note: "waiting for enough cadence data",
    }
  }

  const target = new Date(expectedAt).getTime()
  if (!Number.isFinite(target)) {
    return {
      label: "NO WINDOW",
      tone: "text-slate-300",
      badge: "border-white/10 bg-white/5 text-slate-300",
      note: "invalid predicted window",
    }
  }

  const now = Date.now()
  const halfWidthMs = Math.max(0, halfWidthSeconds) * 1000
  const start = target - halfWidthMs
  const end = target + halfWidthMs

  if (now >= start && now <= end) {
    return {
      label: "WINDOW ACTIVE",
      tone: "text-red-300",
      badge: "border-red-500/30 bg-red-500/10 text-red-200",
      note: `inside ±${fmt(halfWidthSeconds, 0)}s funding window`,
    }
  }

  if (now < start) {
    const seconds = Math.max(0, Math.round((start - now) / 1000))
    return {
      label: "UPCOMING",
      tone: "text-orange-300",
      badge: "border-orange-500/30 bg-orange-500/10 text-orange-200",
      note: `window opens in ~${fmt(seconds, 0)}s`,
    }
  }

  return {
    label: "WINDOW PASSED",
    tone: "text-slate-300",
    badge: "border-white/10 bg-white/5 text-slate-300",
    note: "predicted funding window has elapsed",
  }
}

export function ChainIntelligencePanel({
  chain,
  baseline,
}: {
  chain?: any
  baseline?: any
}) {
  if (!chain) return null

  const a = chain.cycleAnalytics || {}
  const p = chain.predictor || {}
  const m = chain.patternMatch || {}
  const w = chain.windows?.["5m"] || {}
  const match = Number(m.historicalPatternMatchPct || 0)

  const freshTrigger =
    chain.fundingDetected === true ||
    Number(w.rewards || 0) > 0 ||
    p.status === "IN_FUNDING_WINDOW"

  const windowState = getWindowState(p)

  return (
    <section className="mb-5 rounded-3xl border border-cyan-500/20 bg-cyan-950/10 p-4 shadow-[0_0_30px_rgba(34,211,238,0.06)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-400">
            On-chain Intelligence
          </div>

          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
            wPOND Distribution Cycle Predictor
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">
            ON-CHAIN: {chain.activityState || "UNKNOWN"}
          </span>

          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            v{chain.version || "—"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Pattern Match
          </div>
          <div className={`mt-1 text-2xl font-semibold ${matchTone(match)}`}>
            {fmt(m.historicalPatternMatchPct)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {String(m.status || "NO_BASELINE").replaceAll("_", " ")} ·{" "}
            {m.confidence || "LOW"} confidence
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Funding Cadence
          </div>
          <div className="mt-1 text-2xl font-semibold text-cyan-300">
            {a.cadenceConfidence || "LOW"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            median {fmt(a.medianFundingCadenceSeconds)}s
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Claim After Funding
          </div>
          <div className="mt-1 text-2xl font-semibold text-yellow-300">
            {fmt(a.claimAfterFundingProbabilityPct)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            observed historical correlation
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Automation Confidence
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-300">
            {fmt(a.automationConfidence, 0)}/100
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {a.cycleSignal || "NO_STABLE_CYCLE"}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Predictor
          </div>
          <div className="mt-1 text-2xl font-semibold text-orange-300">
            {p.status || "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            ±{fmt(p.fundingWindowHalfWidthSeconds, 0)}s window
          </div>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            freshTrigger
              ? "border-red-500/30 bg-red-500/[0.08]"
              : "border-white/10 bg-black/20"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Fresh Trigger
          </div>
          <div
            className={`mt-1 text-2xl font-semibold ${
              freshTrigger ? "text-red-300" : "text-slate-300"
            }`}
          >
            {freshTrigger ? "DETECTED" : "NONE"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {freshTrigger
              ? "new on-chain evidence is active"
              : "no fresh on-chain evidence"}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div
          className={`rounded-2xl border p-4 ${
            windowState.label === "WINDOW ACTIVE"
              ? "border-red-500/30 bg-red-500/[0.08] shadow-[0_0_20px_rgba(239,68,68,0.08)]"
              : windowState.label === "UPCOMING"
                ? "border-orange-500/20 bg-orange-500/[0.05]"
                : "border-white/10 bg-black/20"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-xs text-slate-500">
              Statistical funding window
            </div>

            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${windowState.badge}`}
            >
              {windowState.label}
            </span>
          </div>

          <div className="mt-2 font-mono text-sm text-white">
            {when(p.nextFundingExpectedAt)}
          </div>

          <div className={`mt-2 text-xs ${windowState.tone}`}>
            {windowState.note}
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Claim window after funding:{" "}
            {p.expectedClaimWindowSeconds
              ? `${p.expectedClaimWindowSeconds.start}s → ${p.expectedClaimWindowSeconds.end}s`
              : "—"}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-slate-500">Pattern Components</div>
          <div className="mt-1 text-sm text-white">
            Cadence similarity {fmt(m.components?.cadenceSimilarityPct)}%
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Delay similarity {fmt(
              m.components?.rewardTransferDelaySimilarityPct ??
              m.components?.claimDelaySimilarityPct
)            }% ·
            proximity {fmt(m.components?.predictorProximityPct)}%
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-slate-500">Last 5 Minutes</div>
          <div className="mt-1 text-lg">
            {fmt(w.rewards, 0)} reward transfers · {fmt(w.wpondDistributed)} wPOND
         </div>
         <div className="mt-2 text-xs text-slate-500">
           Chain score {fmt(chain.chainConfirmationScore, 0)}/100
         </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-slate-500">Historical Baseline</div>
          <div className="mt-1 text-lg">
            {baseline ? `${fmt(baseline.cyclesAnalyzed, 0)} cycles` : "Not built yet"}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {baseline
              ? `${fmt(baseline.correlatedCycles, 0)} correlated · ${fmt(
                  baseline.correlationRatePct
                )}%`
              : "Run the historical backfill workflow once."}
          </div>
        </div>
      </div>

      <div
        className={`mt-3 rounded-2xl border p-4 text-xs leading-5 ${
          freshTrigger
            ? "border-red-500/20 bg-red-500/[0.05] text-slate-300"
            : "border-white/10 bg-black/20 text-slate-400"
        }`}
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="font-semibold text-slate-200">Interpretation:</span>{" "}
            {m.interpretation || "Waiting for enough historical data."}
          </div>

          <div className="shrink-0">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                freshTrigger
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              FRESH TRIGGER: {freshTrigger ? "DETECTED" : "NONE"}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Pattern Match measures similarity to observed historical cycles; it is
        not a probability of a claim or launch. Funding timing does not prove a
        claim or launch is imminent, and distribution amounts are not assumed
        to be funded 1:1 by the preceding swap.
      </p>
    </section>
  )
}
