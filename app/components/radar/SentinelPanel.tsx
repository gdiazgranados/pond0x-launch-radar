import { SectionTitle } from "./SectionTitle"
import { formatDate } from "../../lib/date"
import type { SentinelEvent } from "../../types/radar"

export function SentinelPanel({
  event,
}: {
  event: SentinelEvent | null
}) {
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-[#05070a] p-5">
      <SectionTitle
        title="Sentinel Intelligence"
        subtitle="Early surface-change detection before deep radar confirmation"
      />

      {!event ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-500">
          No sentinel events available yet.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
                  Trigger Reason
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {event.triggerReason || "No trigger reason"}
                </div>
              </div>

              <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {event.changed ? "TRIGGERED" : "WATCHING"}
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              {event.checkedAt ? formatDate(event.checkedAt) : "—"}
            </div>
          </div>

          {!!event.changedSurfaces?.length ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Changed Surfaces
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {event.changedSurfaces.map((surface, index) => (
                  <span
                    key={`${surface.label}-${surface.url}-${index}`}
                    className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-xs text-orange-300"
                  >
                    {surface.label} ({surface.currentStatus})
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {!!event.keywordTriggers?.length ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Keyword Triggers
              </div>

              <div className="mt-3 space-y-2">
                {event.keywordTriggers.map((trigger, index) => (
                  <div
                    key={`${trigger.label}-${trigger.url}-${index}`}
                    className="text-sm text-slate-300"
                  >
                    <span className="font-semibold text-white">{trigger.label}:</span>{" "}
                    {trigger.keywords?.length ? trigger.keywords.join(", ") : "—"}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Max Priority
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{event.maxPriority ?? 0}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Threshold Flags
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {event.threshold?.hasCandidateActivation && (
                  <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300">
                    candidate
                  </span>
                )}

                {event.threshold?.hasKeywordTrigger && (
                  <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300">
                    keywords
                  </span>
                )}

                {(event.threshold?.highPrioritySurfaceChanged || event.threshold?.hasMultiSurfaceChange) && (
                  <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-300">
                    priority
                  </span>
                )}

                {(event.threshold?.multipleSurfaceChange || event.threshold?.hasMultiSurfaceChange) && (
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                    multi-surface
                  </span>
                )}

                {!event.threshold?.hasCandidateActivation &&
                  !event.threshold?.hasKeywordTrigger &&
                  !event.threshold?.highPrioritySurfaceChanged &&
                  !event.threshold?.multipleSurfaceChange &&
                  !event.threshold?.hasMultiSurfaceChange && (
                    <span className="text-xs text-slate-500">No threshold flags active.</span>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}