import { IndicatorHelp } from "./IndicatorHelp"

type MiningWindow = {
  transfers?: number
  uniqueRecipients?: number
  wpondDistributed?: number
}

type MiningEntity = {
  address: string
  role?: string
  status?: string
}

export type MiningIntelligence = {
  freshness?: { status?: string; ageMinutes?: number | null; hasRecentActivity?: boolean }
  windows?: Record<string, MiningWindow>
  lifetime?: {
    candidateRecipients?: number
    candidateTransfers?: number
    repeatRecipientPct?: number
    repeatTransferPct?: number
  }
  concentration?: { top5SharePct?: number; concentrationClass?: string }
  amountProfile?: { p25?: number | null; median?: number | null; p75?: number | null }
  entities?: MiningEntity[]
  coverage?: {
    sampleLimited?: boolean
    analyzedTransferSample?: number
    sourceStatus?: string
    lifetimeSampleLimited?: boolean
    lifetimeTransferSample?: number
    minimumReliableLifetimeSample?: number
  }
}

function fmt(value: unknown, digits = 1) {
  if (value === null || value === undefined || value === "") return "—"
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { maximumFractionDigits: digits })
    : "—"
}

function compactAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-6)}` : "—"
}

function freshnessTone(status?: string) {
  switch (status) {
    case "LIVE": return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    case "COOLING": return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
    case "STALE": return "border-amber-500/30 bg-amber-500/10 text-amber-300"
    case "INACTIVE": return "border-white/10 bg-white/5 text-slate-300"
    default: return "border-white/10 bg-white/5 text-slate-300"
  }
}

function entityTone(status?: string) {
  if (status === "CONFIRMED_OBSERVED") return "text-emerald-300"
  if (status === "AMBIGUOUS") return "text-amber-300"
  return "text-cyan-300"
}

export function MiningIntelligencePanel({ mining }: { mining?: MiningIntelligence | null }) {
  if (!mining) return null

  const freshness = mining.freshness || {}
  const windows = mining.windows || {}
  const lifetime = mining.lifetime || {}
  const concentration = mining.concentration || {}
  const profile = mining.amountProfile || {}
  const entities = Array.isArray(mining.entities) ? mining.entities : []
  const coverage = mining.coverage || {}
  const sourceHealthy = coverage.sourceStatus === "HEALTHY"
  const lifetimeSampleLimited = coverage.lifetimeSampleLimited === true

  return (
    <section className="mb-5 rounded-3xl border border-emerald-500/20 bg-emerald-950/[0.08] p-4 shadow-[0_0_30px_rgba(16,185,129,0.05)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-400">
            Mining Intelligence
          </div>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
            Observed wPOND Claim Activity <IndicatorHelp label="Observed wPOND Claim Activity" />
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Independent analysis of Radar-observed transfers. Candidate claims remain observational and do not change Radar Score or launch alerts.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className={`rounded-full border px-3 py-1 font-semibold ${freshnessTone(freshness.status)}`}>
            ACTIVITY: {freshness.status || "UNKNOWN"}
          </span>
          <span className={`rounded-full border px-3 py-1 font-semibold ${sourceHealthy ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
            SOURCE: {coverage.sourceStatus || "UNKNOWN"}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            SCORE-NEUTRAL
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        {[
          ["1h Candidates", windows["1h"]?.transfers, "", `${fmt(windows["1h"]?.wpondDistributed)} wPOND`],
          ["6h Candidates", windows["6h"]?.transfers, "", `${fmt(windows["6h"]?.uniqueRecipients, 0)} wallets`],
          ["24h Candidates", windows["24h"]?.transfers, "", `${fmt(windows["24h"]?.wpondDistributed)} wPOND`],
          ["Activity Age", freshness.ageMinutes, " min", "since last candidate"],
          ["Lifetime Recipients", lifetime.candidateRecipients, "", `${fmt(lifetime.candidateTransfers, 0)} transfers`],
          ["Repeat Share", lifetime.repeatTransferPct, "%", `${fmt(lifetime.repeatRecipientPct)}% recipients`],
          ["Top 5 Share", concentration.top5SharePct, "%", lifetimeSampleLimited ? "LIMITED SAMPLE" : `${concentration.concentrationClass || "—"} concentration`],
          ["Observed Median", profile.median, "", `P25 ${fmt(profile.p25)} · P75 ${fmt(profile.p75)}`],
        ].map(([label, value, suffix, note]) => (
          <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{fmt(value)}{suffix}</div>
            <div className="text-[11px] text-slate-500">{note}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Entity registry
          </div>
          <div className="mt-3 space-y-3">
            {entities.map((entity: MiningEntity) => (
              <div key={entity.address} className="flex flex-col gap-1 border-b border-white/5 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <a
                    href={`https://solscan.io/account/${entity.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-cyan-300 hover:underline"
                    title={entity.address}
                  >
                    {compactAddress(entity.address)} ↗
                  </a>
                  <div className="mt-1 text-[11px] text-slate-500">{String(entity.role || "UNKNOWN").replaceAll("_", " ")}</div>
                </div>
                <div className={`text-[10px] font-semibold ${entityTone(entity.status)}`}>
                  {String(entity.status || "UNKNOWN").replaceAll("_", " ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-400">
          <div className="font-semibold uppercase tracking-wider text-slate-300">Interpretation guardrails</div>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Transfer sizes use observed quantiles; no borrowed fixed “claim band” is assumed.</li>
            <li>The Raydium pool/relay address remains ambiguous until instruction-level authority is proven.</li>
            <li>The 1or…WWL vanity pattern is a relationship candidate, not an ownership claim.</li>
            <li>Mining activity is evidence of distribution activity, not proof of product activation or launch timing.</li>
          </ul>
        </div>
      </div>

      <div className={`mt-3 rounded-xl border p-3 text-[11px] ${coverage.sampleLimited || lifetimeSampleLimited ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-200" : "border-white/10 bg-black/20 text-slate-500"}`}>
        {coverage.sampleLimited
          ? `Recent calculations use a bounded sample of ${fmt(coverage.analyzedTransferSample, 0)} transfers; lifetime ledger totals remain authoritative.`
          : lifetimeSampleLimited
            ? `Lifetime concentration and repeat-share statistics use only ${fmt(coverage.lifetimeTransferSample, 0)} observed transfers. Treat them as preliminary until at least ${fmt(coverage.minimumReliableLifetimeSample, 0)} transfers are available.`
            : "Mining activity coverage is derived from the current Radar chain sample and persistent recipient ledger."}
      </div>
    </section>
  )
}
