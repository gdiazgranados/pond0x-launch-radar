import type { AlphaAssessment } from "../lib/alpha"

function getAlphaClassTone(alphaClass: string) {
  switch (alphaClass) {
    case "CRITICAL":
      return "text-red-300"
    case "ACTIONABLE":
      return "text-orange-300"
    case "SETUP":
      return "text-yellow-300"
    case "WATCH":
      return "text-cyan-300"
    default:
      return "text-slate-300"
  }
}

function getTriggerStateTone(triggerState: string) {
  switch (triggerState) {
    case "TRIGGERED":
      return "text-red-300"
    case "ARMED":
      return "text-orange-300"
    case "WATCHING":
      return "text-cyan-300"
    default:
      return "text-slate-300"
  }
}

export function AlphaPanel({ alpha }: { alpha: AlphaAssessment }) {
  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
          Alpha Score
        </div>
        <div className="mt-2 text-2xl font-semibold text-fuchsia-300">
          {alpha.alphaScore}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          engine-weighted opportunity score
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
          Alpha Class
        </div>
        <div className={`mt-2 text-lg font-semibold ${getAlphaClassTone(alpha.alphaClass)}`}>
          {alpha.alphaClass}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          opportunity classification layer
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
          Trigger State
        </div>
        <div className={`mt-2 text-lg font-semibold ${getTriggerStateTone(alpha.triggerState)}`}>
          {alpha.triggerState}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          decision engine state
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
          Suggested Action
        </div>
        <div className="mt-2 text-sm leading-6 text-white">
          {alpha.suggestedAction}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
          Alpha Reasons
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {alpha.reasons.slice(0, 4).map((reason, index) => (
            <span
              key={`${reason}-${index}`}
              className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-300"
            >
              {reason}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}