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
    <div className="rounded-xl border border-white/10 bg-[#06080b] p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </div>
      <div className={`mt-3 text-3xl font-semibold leading-none ${valueClassName}`}>
        {value}
      </div>
      {subvalue ? (
        <div className="mt-2 text-xs text-slate-500">{subvalue}</div>
      ) : null}
    </div>
  )
}