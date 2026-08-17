import { SectionTitle } from "./SectionTitle"

type CheckInStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "BLIND_SPOT"
  | "UNKNOWN"

type CheckInItem = {
  id: string
  time: string
  full: string
  status: CheckInStatus | string
}

function getStatusPalette(status: string) {
  switch (status) {
    case "HEALTHY":
      return {
        dot: "bg-emerald-400",
        badge:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      }

    case "DEGRADED":
      return {
        dot: "bg-amber-400",
        badge:
          "border-amber-500/40 bg-amber-500/10 text-amber-300",
      }

    case "BLIND_SPOT":
      return {
        dot: "bg-red-500",
        badge:
          "border-red-500/40 bg-red-500/10 text-red-300",
      }

    default:
      return {
        dot: "bg-slate-500",
        badge:
          "border-slate-500/30 bg-slate-500/10 text-slate-400",
      }
  }
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
        subtitle="Recent monitoring sweeps"
      />

      <div className="mt-3 max-h-[260px] overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {items.length > 0 ? (
            items.map((item, index) => {
              const statusPalette = getStatusPalette(item.status)

              return (
                <div
                  key={`${item.id}-${index}`}
                  className="grid grid-cols-[minmax(0,auto)_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs transition-colors hover:border-white/20"
                  title={item.full}
                >
                  <span className="whitespace-nowrap text-slate-500">
                    {item.time}
                  </span>

                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${statusPalette.dot}`}
                    />

                    <span className="truncate text-slate-300">
                      ✓ sweep completed
                    </span>
                  </div>

                  <span
                    className={`whitespace-nowrap rounded-full border px-2 py-0.5 ${statusPalette.badge}`}
                  >
                    {item.status}
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