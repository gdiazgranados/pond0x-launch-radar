import { SectionTitle } from "./SectionTitle"
import { formatRelativeMinutes } from "../../lib/date"

type HeartbeatTone = {
  label: string
  tone: string
  badge: string
  dot: string
}

export function HeartbeatPanel({
  heartbeat,
  nextPollAt,
  previousPollAt,
  nextSweepCountdown,
  source,
  freshnessDate,
}: {
  heartbeat: HeartbeatTone
  nextPollAt: string | null
  previousPollAt: string | null
  nextSweepCountdown: string | null
  source?: string | null
  freshnessDate?: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
      <SectionTitle
        title="Radar Heartbeat"
        subtitle="Monitoring freshness and expected sweep timing"
      />

      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${heartbeat.dot}`} />
        <div className={`text-2xl font-semibold ${heartbeat.tone}`}>{heartbeat.label}</div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${heartbeat.badge}`}
        >
          {heartbeat.label === "FRESH"
            ? "within schedule"
            : heartbeat.label === "LAGGING"
            ? "delayed sweep"
            : heartbeat.label === "STALE"
            ? "active monitor"
            : "no signal"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Next expected sweep
          </div>
          <div className="mt-2 text-sm font-medium text-white">
            {nextPollAt
              ? new Date(nextPollAt).toLocaleString("es-MX", {
                  timeZone: "America/Mexico_City",
                })
              : "—"}
          </div>
          <div
            className={`mt-2 text-xs ${
              nextSweepCountdown === "overdue"
                ? "text-yellow-400 animate-pulse"
                : "text-slate-500"
            }`}
          >
            {nextSweepCountdown === "overdue"
              ? "Next sweep overdue"
              : `Next sweep in: ${nextSweepCountdown ?? "—"}`}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Last success
          </div>
          <div className="mt-2 text-sm font-medium text-white">
            {previousPollAt
              ? new Date(previousPollAt).toLocaleString("es-MX", {
                  timeZone: "America/Mexico_City",
                })
              : "—"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Freshness
          </div>
          <div className="mt-2 text-sm font-medium text-white">
            {formatRelativeMinutes(freshnessDate)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Source</div>
          <div className="mt-2 text-sm font-medium text-cyan-300">
            {source || "github-actions"}
          </div>
        </div>
      </div>
    </div>
  )
}