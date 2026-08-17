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
    <div className="rounded-2xl border border-white/10 bg-[#05070a] p-4 sm:p-5">
      <SectionTitle
        title="Check-in Tape"
        subtitle="Recent successful radar sweeps"
      />

      <div className="mt-3 max-h-[260px] overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {items.length > 0 ? (
            items.map((item, index) => {
              const itemPalette = getLevelPalette(item.level)

              return (
                <div
                  key={`${item.id}-${index}`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs transition-colors hover:border-white/20"
                  title={item.full}
                >
                  <span className="whitespace-nowrap text-slate-500">
                    {item.time}
                  </span>

                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${itemPalette.dot}`}
                    />
                    <span className="truncate text-slate-300">
                      ✓ sweep completed
                    </span>
                  </div>

                  <span
                    className={`whitespace-nowrap rounded-full border px-2 py-0.5 ${itemPalette.badge}`}
                  >
                    {item.level}
                  </span>
                </div>
              )
            })
          ) : (
            <div className="py-3 text-sm text-slate-500">
              No check-ins available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}