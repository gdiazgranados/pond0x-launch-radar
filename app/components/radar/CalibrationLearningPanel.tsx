import type { RadarData } from "../../types/radar"
import { SectionTitle } from "./SectionTitle"

function metric(value: unknown, suffix = "") {
  if (value === null || value === undefined) return "—"
  return `${value}${suffix}`
}

function readinessTone(ready?: boolean) {
  return ready
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
}

export function CalibrationLearningPanel({ data }: { data?: RadarData | null }) {
  const report = (data as any)?.thresholdDriftReport || null
  if (!report) return null

  const readiness = report?.readiness || {}
  const profiles = report?.profiles || {}
  const exact = Number(report?.exactSweepCount || 0)
  const minExact = Number(readiness?.minExactSweepsForTuning || 72)
  const covered = Number(report?.groundTruth?.coveredByExactArchive || 0)
  const minCovered = Number(readiness?.minCoveredEventsForTuning || 3)
  const exactProgress = Math.max(0, Math.min(100, Math.round((exact / Math.max(1, minExact)) * 100)))
  const truthProgress = Math.max(0, Math.min(100, Math.round((covered / Math.max(1, minCovered)) * 100)))
  const ready = readiness?.readyForThresholdReview === true

  const cards = ["SENSITIVE", "DEFAULT", "CONSERVATIVE"].map((name) => ({
    name,
    ...(profiles?.[name] || {}),
  }))

  return (
    <div className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.03] p-4 sm:p-5 xl:col-span-12">
      <SectionTitle
        title="Decision Engine Calibration"
        subtitle="Exact-sweep learning, threshold drift comparison, and readiness for future tuning"
        right={
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${readinessTone(ready)}`}>
            {ready ? "READY FOR REVIEW" : "LEARNING"}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Exact Evidence</div>
          <div className="mt-2 text-3xl font-semibold text-violet-300">{exact} / {minExact}</div>
          <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-violet-400" style={{ width: `${exactProgress}%` }} /></div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Ground Truth Covered</div>
          <div className="mt-2 text-3xl font-semibold text-cyan-300">{covered} / {minCovered}</div>
          <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-cyan-400" style={{ width: `${truthProgress}%` }} /></div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Threshold Changes</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-300">LOCKED</div>
          <div className="mt-1 text-xs text-slate-500">No automatic tuning</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Recommendation</div>
          <div className="mt-2 break-words text-sm font-semibold text-amber-300">{String(report?.recommendation || "ACCUMULATE_EXACT_SWEEPS").replaceAll("_", " ")}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {cards.map((profile) => {
          const m = profile?.metrics || {}
          const isDefault = profile.name === "DEFAULT"
          return (
            <div key={profile.name} className={`rounded-2xl border p-4 ${isDefault ? "border-violet-500/30 bg-violet-500/[0.05]" : "border-white/10 bg-black/20"}`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`text-sm font-semibold ${isDefault ? "text-violet-300" : "text-slate-200"}`}>{profile.name}</div>
                {isDefault && <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">LIVE BASELINE</span>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-slate-500">Signals</div><div className="mt-1 text-lg font-semibold text-white">{metric(m?.signalCount)}</div></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-slate-500">False Signals</div><div className="mt-1 text-lg font-semibold text-white">{metric(m?.falseSignalCount)}</div></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-slate-500">Precision</div><div className="mt-1 text-lg font-semibold text-white">{metric(m?.precision, "%")}</div></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-slate-500">Recall</div><div className="mt-1 text-lg font-semibold text-white">{metric(m?.recall, "%")}</div></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-slate-500">False Signal Rate</div><div className="mt-1 text-lg font-semibold text-white">{metric(m?.falseSignalRate, "%")}</div></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-slate-500">Median Lead</div><div className="mt-1 text-lg font-semibold text-white">{m?.medianLeadMinutes == null ? "—" : `${m.medianLeadMinutes}m`}</div></div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-400">
        Learning mode uses only exact archived sweeps. Compatibility-reconstructed history is excluded from tuning metrics, and thresholds remain unchanged until minimum evidence coverage is reached.
      </div>
    </div>
  )
}
