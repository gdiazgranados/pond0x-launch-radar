import { SectionTitle } from "./SectionTitle"

type HealthStage = {
  status?: string
  detail?: string
  checkedAt?: string
}

type SystemHealthPanelProps = {
  systemHealth?: {
    overall?: string
    checkedAt?: string
    stages?: Record<string, HealthStage>
    run?: {
      source?: string | null
      workflowRunNumber?: number | null
    }
  } | null
  telegramHealth?: {
    status?: string
    checkedAt?: string
    botReachable?: boolean
    chatReachable?: boolean
    lastSuccessfulAlertAt?: string | null
    lastSuccessfulChainAlertAt?: string | null
    lastError?: string | null
  } | null
}

function tone(status?: string) {
  const value = String(status || "UNKNOWN").toUpperCase()

  if (value === "HEALTHY") {
    return {
      dot: "bg-emerald-400",
      text: "text-emerald-300",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    }
  }

  if (value === "DEGRADED") {
    return {
      dot: "bg-amber-400",
      text: "text-amber-300",
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    }
  }

  if (value === "ERROR") {
    return {
      dot: "bg-red-500",
      text: "text-red-300",
      badge: "border-red-500/30 bg-red-500/10 text-red-300",
    }
  }

  return {
    dot: "bg-slate-500",
    text: "text-slate-300",
    badge: "border-white/10 bg-white/5 text-slate-300",
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  })
}

export function SystemHealthPanel({
  systemHealth,
  telegramHealth,
}: SystemHealthPanelProps) {
  const overall = systemHealth?.overall || "UNKNOWN"
  const overallTone = tone(overall)
  const stages = systemHealth?.stages || {}
  const orderedStages = ["trigger", "capture", "chain", "radar", "telegram", "publish"]

  return (
    <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
      <SectionTitle
        title="Radar Reliability"
        subtitle="End-to-end monitoring and alert-channel health"
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${overallTone.dot}`} />
        <div className={`text-2xl font-semibold ${overallTone.text}`}>{overall}</div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${overallTone.badge}`}>
          end-to-end status
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {orderedStages.map((name) => {
          const item = stages[name]
          const status = item?.status || "UNKNOWN"
          const stageTone = tone(status)

          return (
            <div key={name} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{name}</div>
                <span className={`h-2.5 w-2.5 rounded-full ${stageTone.dot}`} />
              </div>
              <div className={`mt-2 text-sm font-semibold ${stageTone.text}`}>{status}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{item?.detail || "No telemetry yet"}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Scheduler</div>
          <div className="mt-2 text-sm font-medium text-cyan-300">
            {systemHealth?.run?.source || "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Workflow run #{systemHealth?.run?.workflowRunNumber ?? "—"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Telegram</div>
            <span className={`h-2.5 w-2.5 rounded-full ${tone(telegramHealth?.status).dot}`} />
          </div>
          <div className={`mt-2 text-sm font-semibold ${tone(telegramHealth?.status).text}`}>
            {telegramHealth?.status || "UNKNOWN"}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div>Bot: {telegramHealth?.botReachable ? "REACHABLE" : "UNKNOWN"}</div>
            <div>Chat: {telegramHealth?.chatReachable ? "REACHABLE" : "UNKNOWN"}</div>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Last health check: {formatDate(telegramHealth?.checkedAt)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Last Radar alert: {formatDate(telegramHealth?.lastSuccessfulAlertAt)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Last chain alert: {formatDate(telegramHealth?.lastSuccessfulChainAlertAt)}
          </div>
          {telegramHealth?.lastError && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {telegramHealth.lastError}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
