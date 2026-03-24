import { SectionTitle } from "./SectionTitle"
import { buildLinePoints } from "../../lib/radar"

export function TrendGraph({
  values,
}: {
  values: number[]
}) {
  const width = 600
  const height = 120
  const maxValue = Math.max(...values, 1)

  const points = buildLinePoints(values, width, height, maxValue)

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-[#05070a] p-5">
      <SectionTitle
        title="Trend Graph"
        subtitle="Movement score evolution"
      />

      {values.length > 0 ? (
        <div className="overflow-x-auto">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
          >
            <polyline
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              points={points}
            />
          </svg>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-500">
          No chart data available yet.
        </div>
      )}
    </section>
  )
}