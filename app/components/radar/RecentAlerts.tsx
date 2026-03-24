import { SectionTitle } from "./SectionTitle"
import {
  getLevelPalette,
  getSignalType,
  probabilityClass,
} from "../../lib/radar"
import { formatDate } from "../../lib/date"
import type { AlertItem } from "../../types/radar"

export function RecentAlerts({
  alerts,
}: {
  alerts: AlertItem[]
}) {
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-[#05070a] p-5">
      <SectionTitle
        title="Recent Alerts"
        subtitle="Latest delivered alert events"
        right={
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
            {alerts.length} total
          </span>
        }
      />

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-500">
          No alerts yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {alerts.slice(0, 6).map((alert, i) => {
            const alertPalette = getLevelPalette(alert.level)
            const alertSignalType = getSignalType(alert)
            const alertProbability =
              alert.level === "VERY HIGH"
                ? "VERY HIGH"
                : alert.level === "HIGH"
                ? "HIGH"
                : alert.level === "MEDIUM"
                ? "MEDIUM"
                : "LOW"

            return (
              <div
                key={`${alert.id}-${alert.sentAt}-${i}`}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${alertPalette.dot}`} />
                      <span className="text-sm font-medium text-white">{alert.summary}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{formatDate(alert.sentAt)}</div>
                  </div>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${alertPalette.badge}`}
                  >
                    {alert.level}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>
                    Signal: <span className="text-cyan-300">{alertSignalType}</span>
                  </div>
                  <div>
                    Launch:{" "}
                    <span
                      className={`rounded-full border px-2 py-0.5 ${probabilityClass(alertProbability)}`}
                    >
                      {alertProbability}
                    </span>
                  </div>
                  <div>
                    Score: <span className="text-white">{alert.score}</span>
                  </div>
                  <div>
                    Movement: <span className="text-emerald-300">{alert.movementPct}%</span>
                  </div>
                </div>

                <div className="mt-4 text-sm text-slate-400">{alert.insight}</div>

                {!!alert.signals?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {alert.signals.map((signal, signalIndex) => (
                      <span
                        key={`${signal}-${signalIndex}`}
                        className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-300"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}