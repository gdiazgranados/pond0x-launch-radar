import type { ReactNode } from "react"

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4 border-b border-white/10 pb-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          {title}
        </div>

        {subtitle ? <div className="mt-1 text-sm text-slate-400">{subtitle}</div> : null}
      </div>

      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}