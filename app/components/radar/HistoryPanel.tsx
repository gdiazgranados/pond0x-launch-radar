import { SectionTitle } from "./SectionTitle"
import {
  clampPercent,
  getLevelPalette,
  getLaunchProbability,
  probabilityClass,
} from "../../lib/radar"
import type { RadarData } from "../../types/radar"

function formatMexicoCityDate(value?: string | null) {
  if (!value) return "—"

  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return "—"

  return dt.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  })
}

export function HistoryPanel({
  history,
}: {
  history: RadarData[]
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
      <SectionTitle title="Historical Movement" subtitle="Recent radar activity over time" />

      <div className="mt-4 space-y-4">
        {history.length > 0 ? (
          history.map((item, index) => {
            const palette = getLevelPalette(item.level)
            const probability = getLaunchProbability(item)
            const movementPct = Number(item.movementPct ?? 0)
            const rawScore = Number(item.rawScore ?? item.score ?? 0)
            const scorePercent = Number(item.scorePercent ?? 0)

            return (
              <div
                key={`${item.id || "history"}-${item.generatedAt || index}-${index}`}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-400">{formatMexicoCityDate(item.generatedAt)}</span>

                  <span className={`rounded-full border px-2 py-0.5 ${palette.badge}`}>
                    {item.level || "LOW"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-white">
                    Score: <span className="font-semibold">{scorePercent}/100</span>
                    <span className="ml-2 text-xs text-slate-500">
                      raw: {rawScore}
                    </span>
                  </div>

                  <div
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${probabilityClass(
                      probability
                    )}`}
                  >
                    {probability}
                  </div>
                </div>

                {!!item.focusAreas?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.focusAreas.map((area, areaIndex) => (
                      <span
                        key={`${area}-${areaIndex}`}
                        className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                  <div
                    className={`h-2 rounded-full ${palette.bar}`}
                    style={{
                      width: `${clampPercent(movementPct)}%`,
                    }}
                  />
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-500">
            No historical data available.
          </div>
        )}
      </div>
    </div>
  )
}