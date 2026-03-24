import { SectionTitle } from "./SectionTitle"
import {
  clampPercent,
  getLevelPalette,
  getLaunchProbability,
  probabilityClass,
} from "../../lib/radar"

import type { RadarData } from "../../types/radar"

export function HistoryPanel({
  history,
}: {
  history: RadarData[]
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
      <SectionTitle
        title="Historical Movement"
        subtitle="Recent radar activity over time"
      />

      <div className="mt-4 space-y-4">
        {history.length > 0 ? (
          history.map((item, index) => {
            const palette = getLevelPalette(item.level)
            const probability = getLaunchProbability(item)

            return (
              <div
                key={`${item.id}-${index}`}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {new Date(item.generatedAt).toLocaleString("es-MX", {
                      timeZone: "America/Mexico_City",
                    })}
                  </span>

                  <span className={`rounded-full border px-2 py-0.5 ${palette.badge}`}>
                    {item.level}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm text-white">
                    Score: <span className="font-semibold">{item.score}</span>
                  </div>

                  <div
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${probabilityClass(
                      probability
                    )}`}
                  >
                    {probability}
                  </div>
                </div>

                <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                  <div
                    className={`h-2 rounded-full ${palette.bar}`}
                    style={{
                      width: `${clampPercent(item.movementPct)}%`,
                    }}
                  />
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-sm text-slate-500">
            No historical data available.
          </div>
        )}
      </div>
    </div>
  )
}