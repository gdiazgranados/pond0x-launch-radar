import { SectionTitle } from "./SectionTitle"
import { getLevelPalette } from "../../lib/radar"

type CheckInItem = {
  id: string
  time: string
  full: string
  level: string
}

export function CheckInTape({
  items,
}: {
  items: CheckInItem[]
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
      <SectionTitle
        title="Check-in Tape"
        subtitle="Recent successful radar sweeps"
      />

      <div className="overflow-x-auto">
        <div className="flex min-w-max items-center gap-3 whitespace-nowrap">
          {items.length > 0 ? (
            items.map((item, index) => {
              const itemPalette = getLevelPalette(item.level)

              return (
                <div
                  key={`${item.id}-${index}`}
                  className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs"
                  title={item.full}
                >
                  <span className="text-slate-500">{item.time}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${itemPalette.dot}`} />
                  <span className="text-white">✓ sweep completed</span>
                  <span className={`rounded-full border px-2 py-0.5 ${itemPalette.badge}`}>
                    {item.level}
                  </span>
                </div>
              )
            })
          ) : (
            <div className="text-sm text-slate-500">
              No check-ins available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}