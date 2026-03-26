import type { ReactNode } from "react"

export function MetricCard({
  label,
  value,
  subvalue,
  valueClassName,
}: {
  label: string
  value: ReactNode
  subvalue?: string
  valueClassName?: string
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-[#06080b] p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </div>
      <div
        className={`mt-3 min-w-0 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl ${valueClassName || ""}`}
      >
        {value}
      </div>
      {subvalue ? (
        <div className="mt-2 text-xs leading-5 text-slate-500">{subvalue}</div>
      ) : null}
    </div>
  )
}