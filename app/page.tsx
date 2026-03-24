"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRadarData } from "./hooks/useRadarData"

  function remoteJsonUrl(filename: string, cacheBust: number) {
  return `/data/${filename}?t=${cacheBust}`
}

type RadarData = {
  id: string
  totalFiles: number
  added: number
  changed: number
  movementCount: number
  movementPct: number
  addedPct: number
  changedPct: number
  signals: string[]
  score: number
  level: "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" | string
  insight?: string
  confidence?: number
  tags?: string[]
  alert?: string | null
  summary: string
  note: string
  trend?: number
  trendDirection?: "UP" | "DOWN" | "FLAT" | string
  generatedAt: string
}

type AlertItem = {
  id: string
  level: string
  score: number
  movementPct: number
  trend: number
  trendDirection: string
  signals: string[]
  tags: string[]
  insight: string
  summary: string
  sentAt: string
}

type HeartbeatData = {
  source: string
  lastRunAt: string | null
  lastSuccessAt: string | null
  status: "unknown" | "running" | "success" | "failed" | string
  scheduleMinutes: number
}

function formatDate(date?: string) {
  if (!date) return "—"
  return new Date(date).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  })
}

function shortTime(date?: string) {
  if (!date) return "—"
  return new Date(date).toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City",
  })
}

function minutesSince(dateString?: string) {
  if (!dateString) return null

  const ts = new Date(dateString).getTime()
  if (Number.isNaN(ts)) return null

  const diffMs = Date.now() - ts
  return Math.max(0, Math.floor(diffMs / 60000))
}

function formatRelativeMinutes(dateString?: string) {
  const mins = minutesSince(dateString)
  if (mins === null) return "unknown"

  if (mins < 1) return "just now"
  if (mins === 1) return "1 min ago"
  if (mins < 60) return `${mins} min ago`

  const hours = Math.floor(mins / 60)
  const remaining = mins % 60

  if (remaining === 0) {
    return hours === 1 ? "1h ago" : `${hours}h ago`
  }

  return `${hours}h ${remaining}m ago`
}

function getHeartbeatStatus(dateString?: string, scheduleMinutes = 60) {
  const mins = minutesSince(dateString)

  if (mins === null) {
    return {
      label: "UNKNOWN",
      tone: "text-slate-300",
      badge: "border-slate-500/30 bg-slate-500/10 text-slate-200",
      dot: "bg-slate-400",
    }
  }

  const schedule = Number(scheduleMinutes || 60)

  if (mins <= schedule) {
    return {
      label: "FRESH",
      tone: "text-emerald-300",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      dot: "bg-emerald-400",
    }
  }

  if (mins <= schedule * 2) {
    return {
      label: "LAGGING",
      tone: "text-yellow-300",
      badge: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
      dot: "bg-yellow-400",
    }
  }

  return {
    label: "STALE",
    tone: "text-red-300",
    badge: "border-red-500/30 bg-red-500/10 text-red-200",
    dot: "bg-red-400",
  }
}

function buildLinePoints(
  values: number[],
  width: number,
  height: number,
  maxValue: number
) {
  if (!values.length) return ""

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - (value / Math.max(maxValue, 1)) * height
      return `${x},${y}`
    })
    .join(" ")
}

function getLevelPalette(level?: string) {
  switch (level) {
    case "VERY HIGH":
      return {
        badge: "border-red-500/40 bg-red-500/10 text-red-200",
        text: "text-red-300",
        bar: "bg-red-500",
        dot: "bg-red-400",
        label: "ACTIVATION",
      }
    case "HIGH":
      return {
        badge: "border-orange-500/40 bg-orange-500/10 text-orange-200",
        text: "text-orange-300",
        bar: "bg-orange-400",
        dot: "bg-orange-400",
        label: "HEATING",
      }
    case "MEDIUM":
      return {
        badge: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
        text: "text-yellow-300",
        bar: "bg-yellow-400",
        dot: "bg-yellow-400",
        label: "BUILDUP",
      }
    default:
      return {
        badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        text: "text-emerald-300",
        bar: "bg-emerald-400",
        dot: "bg-emerald-400",
        label: "QUIET",
      }
  }
}

function getSignalType(data?: RadarData | AlertItem | null) {
  if (!data) return "UNKNOWN"

  const tags = data.tags || []
  const signals = data.signals || []

  if (tags.includes("REWARDS") || signals.includes("claim") || signals.includes("reward")) {
    return "REWARDS"
  }

  if (
    signals.includes("connect") &&
    (signals.includes("ethereum") || signals.includes("solana"))
  ) {
    return "CHAIN"
  }

  if (tags.includes("AUTH") || signals.includes("verify") || signals.includes("account")) {
    return "AUTH"
  }

  if (tags.includes("SYSTEM") || signals.includes("portal")) {
    return "SYSTEM"
  }

  return "UNKNOWN"
}

function getLaunchProbability(data?: RadarData | null) {
  if (!data) return "LOW"

  const signalType = getSignalType(data)
  const trend = data.trend ?? 0
  const score = data.score ?? 0
  const movementPct = data.movementPct ?? 0

  if (data.level === "VERY HIGH") return "VERY HIGH"
  if (data.level === "HIGH" || score >= 60 || (movementPct >= 30 && trend >= 5)) return "HIGH"

  if (
    data.level === "MEDIUM" ||
    trend >= 3 ||
    movementPct >= 10 ||
    signalType === "AUTH" ||
    signalType === "CHAIN" ||
    signalType === "REWARDS"
  ) {
    return "MEDIUM"
  }

  return "LOW"
}

function probabilityClass(probability: string) {
  switch (probability) {
    case "VERY HIGH":
      return "border-red-500/40 bg-red-500/10 text-red-200"
    case "HIGH":
      return "border-orange-500/40 bg-orange-500/10 text-orange-200"
    case "MEDIUM":
      return "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
  }
}

function probabilityFromLevel(level?: string) {
  if (level === "VERY HIGH") return "VERY HIGH"
  if (level === "HIGH") return "HIGH"
  if (level === "MEDIUM") return "MEDIUM"
  return "LOW"
}

function clampPercent(value?: number) {
  const n = Number(value ?? 0)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function getTickerTone(level?: string) {
  switch (level) {
    case "VERY HIGH":
      return "text-red-300"
    case "HIGH":
      return "text-orange-300"
    case "MEDIUM":
      return "text-yellow-300"
    default:
      return "text-emerald-300"
  }
}

function SectionTitle({
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
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          {title}
        </div>
        {subtitle ? <div className="mt-1 text-sm text-slate-400">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  )
}

function MetricCard({
  label,
  value,
  subvalue,
  valueClassName = "text-white",
}: {
  label: string
  value: ReactNode
  subvalue?: ReactNode
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#06080b] p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className={`mt-3 text-3xl font-semibold leading-none ${valueClassName}`}>{value}</div>
      {subvalue ? <div className="mt-2 text-xs text-slate-500">{subvalue}</div> : null}
    </div>
  )
}

export default function Home() {
  const { data, history, alerts, loading, heartbeatData, error, refresh } = useRadarData()
const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      clearInterval(clockInterval)
    }
  }, [])

  const previousPollAt = useMemo(() => {
    const lastSuccess = heartbeatData?.lastSuccessAt
    if (!lastSuccess) return null

    const dt = new Date(lastSuccess)
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
  }, [heartbeatData?.lastSuccessAt])

  const nextPollAt = useMemo(() => {
    const lastRun = heartbeatData?.lastRunAt
    const scheduleMinutes = Number(heartbeatData?.scheduleMinutes ?? 5)

    if (!lastRun) return null

    const dt = new Date(lastRun)
    if (Number.isNaN(dt.getTime())) return null

    return new Date(dt.getTime() + scheduleMinutes * 60 * 1000).toISOString()
  }, [heartbeatData?.lastRunAt, heartbeatData?.scheduleMinutes])

    const nextSweepCountdown = useMemo(() => {
    if (!nextPollAt) return null

    const target = new Date(nextPollAt).getTime()
    if (Number.isNaN(target)) return null

    const diff = target - now

    if (diff <= 0) return "running..."

    const totalSeconds = Math.floor(diff / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}m ${seconds}s`
  }, [nextPollAt, now])

  const palette = useMemo(() => getLevelPalette(data?.level), [data])

  const chartData = useMemo(() => {
    const items = [...history].slice(0, 8).reverse()

    return items.map((item) => ({
      label: shortTime(item.generatedAt),
      score: item.score ?? 0,
      movement: item.movementPct ?? 0,
    }))
  }, [history])

  const scorePoints = useMemo(() => {
    return buildLinePoints(
      chartData.map((d) => d.score),
      100,
      40,
      100
    )
  }, [chartData])

  const movementPoints = useMemo(() => {
    return buildLinePoints(
      chartData.map((d) => d.movement),
      100,
      40,
      100
    )
  }, [chartData])

  const signalType = useMemo(() => getSignalType(data), [data])
  const launchProbability = useMemo(() => getLaunchProbability(data), [data])
  const heartbeat = getHeartbeatStatus(
    heartbeatData?.lastSuccessAt || heartbeatData?.lastRunAt || undefined,
    heartbeatData?.scheduleMinutes || 5
  )

  const recentCheckIns = useMemo(() => {
    const items = history.slice(0, 8).map((item) => ({
      id: `${item.id}-${item.generatedAt}`,
      time: shortTime(item.generatedAt),
      full: formatDate(item.generatedAt),
      level: item.level || "LOW",
    }))

    if (data?.generatedAt) {
      return [
        {
          id: `live-${data.id}`,
          time: shortTime(data.generatedAt),
          full: formatDate(data.generatedAt),
          level: data.level || "LOW",
        },
        ...items,
      ].slice(0, 8)
    }

    return items
  }, [data, history])

  const tickerItems = useMemo(() => {
    const latestItem = data
      ? [
          {
            id: `latest-${data.id}`,
            time: shortTime(data.generatedAt),
            level: data.level || "LOW",
            signalType: getSignalType(data),
            probability: getLaunchProbability(data),
            label: "LIVE",
          },
        ]
      : []

    const historyItems = history.slice(0, 5).map((item) => ({
      id: `history-${item.id}-${item.generatedAt}`,
      time: shortTime(item.generatedAt),
      level: item.level || "LOW",
      signalType: getSignalType(item),
      probability: probabilityFromLevel(item.level),
      label: "HIST",
    }))

    const alertItems = alerts.slice(0, 5).map((alert, index) => ({
      id: `alert-${alert.id}-${alert.sentAt}-${index}`,
      time: shortTime(alert.sentAt),
      level: alert.level || "LOW",
      signalType: getSignalType(alert),
      probability: probabilityFromLevel(alert.level),
      label: "ALERT",
    }))

    return [...latestItem, ...alertItems, ...historyItems].slice(0, 10)
  }, [data, history, alerts])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020406] text-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-10 w-96 rounded bg-white/10" />
            <div className="h-28 w-full rounded bg-white/5" />
            <div className="h-80 w-full rounded bg-white/5" />
            <div className="h-56 w-full rounded bg-white/5" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020406] text-white">
      <div className="mx-auto max-w-7xl px-5 py-6">
        <header className="mb-6 border-b border-white/10 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-400">
                Pond0x Signal Terminal
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Pond0x Launch Radar
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Live monitoring terminal for frontend movement, launch indicators, reward flows,
                wallet connection patterns, and activation probability across Pond0x surfaces.
              </p>
            </div>

            <div className="min-w-[250px] rounded-2xl border border-white/10 bg-[#06080b] p-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                Terminal State
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${palette.dot}`} />
                <div className={`text-2xl font-semibold ${palette.text}`}>{palette.label}</div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                <span className={`rounded-full border px-2 py-0.5 text-xs ${palette.badge}`}>
                  {data?.level || "LOW"}
                </span>
                <span>{data?.score ?? 0}/100 intensity</span>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-[#06080b] px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Signal Tape
              </div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-600">
                Bloomberg-style live feed
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-3 whitespace-nowrap">
                {tickerItems.length > 0 ? (
                  tickerItems.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs"
                    >
                      <span className="text-slate-500">{item.time}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        {item.label}
                      </span>
                      <span className={`font-semibold ${getTickerTone(item.level)}`}>
                        {item.level}
                      </span>
                      <span className="text-cyan-300">{item.signalType}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-white">{item.probability}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No tape items yet.</div>
                )}
              </div>
            </div>
          </div>
        </header>

        <section className="mb-5 grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
            <SectionTitle
              title="Radar Heartbeat"
              subtitle="Monitoring freshness and expected sweep timing"
            />

            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${heartbeat.dot}`} />
              <div className={`text-2xl font-semibold ${heartbeat.tone}`}>{heartbeat.label}</div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${heartbeat.badge}`}>
                {heartbeat.label === "FRESH"
                  ? "within schedule"
                  : heartbeat.label === "LAGGING"
                  ? "delayed sweep"
                  : heartbeat.label === "STALE"
                  ? "active monitor"
                  : "no signal"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">

              {/* 1️⃣ NEXT */}
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Next expected sweep
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {nextPollAt
                    ? new Date(nextPollAt).toLocaleString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })
                    : "—"}
                </div>
                <div
                  className={`mt-2 text-xs ${
                    nextSweepCountdown === "running..."
                      ? "text-yellow-400 animate-pulse"
                      : "text-slate-500"
         }`}
       >
         Next sweep in: {nextSweepCountdown ?? "—"}
       </div>
              </div>

  {/* 2️⃣ LAST */}
  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
      Last successful check
    </div>
    <div className="mt-2 text-sm font-medium text-white">
      {previousPollAt
        ? new Date(previousPollAt).toLocaleString("es-MX", {
            timeZone: "America/Mexico_City",
          })
        : "—"}
    </div>
  </div>

  {/* 3️⃣ FRESHNESS */}
  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
      Freshness
    </div>
    <div className="mt-2 text-sm font-medium text-white">
      {formatRelativeMinutes(
        heartbeatData?.lastSuccessAt || heartbeatData?.lastRunAt || undefined
      )}
    </div>
  </div>

    {/* 4️⃣ SOURCE */}
  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
      Source
    </div>
    <div className="mt-2 text-sm font-medium text-cyan-300">
      {heartbeatData?.source || "github-actions"}
    </div>
  </div>

</div>
</div>

<div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
            <SectionTitle
              title="Check-in Tape"
              subtitle="Recent successful radar sweeps"
            />

            <div className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-3 whitespace-nowrap">
                {recentCheckIns.length > 0 ? (
                  recentCheckIns.map((item, index) => {
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
                  <div className="text-sm text-slate-500">No check-ins available yet.</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.28fr_0.72fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
              <SectionTitle
                title="Signal Overview"
                subtitle="Primary operational metrics"
                right={
                  <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                    LIVE SNAPSHOT
                  </span>
                }
              />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Snapshot"
                  value={data?.id || "..."}
                  valueClassName="break-all text-lg text-white"
                />
                <MetricCard
                  label="Score"
                  value={data?.score ?? 0}
                  valueClassName={palette.text}
                />
                <MetricCard
                  label="Signal Type"
                  value={signalType}
                  valueClassName="text-cyan-300"
                />
                <MetricCard
                  label="Launch Probability"
                  value={
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-base ${probabilityClass(
                        launchProbability
                      )}`}
                    >
                      {launchProbability}
                    </span>
                  }
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <MetricCard label="Total Files" value={data?.totalFiles ?? 0} />
                <MetricCard
                  label="Added"
                  value={data?.added ?? 0}
                  subvalue={`${data?.addedPct ?? 0}% of surface`}
                  valueClassName="text-cyan-300"
                />
                <MetricCard
                  label="Changed"
                  value={data?.changed ?? 0}
                  subvalue={`${data?.changedPct ?? 0}% of surface`}
                  valueClassName="text-yellow-300"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
              <SectionTitle
                title="Intensity Matrix"
                subtitle="Score and movement breakdown"
                right={<div className="text-xs text-slate-500">{data?.score ?? 0}/100</div>}
              />

              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                    <span>Radar Score</span>
                    <span>{data?.score ?? 0}%</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-white/10">
                    <div
                      className={`h-3 rounded-full ${palette.bar}`}
                      style={{ width: `${clampPercent(data?.score)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                    <span>Added %</span>
                    <span>{data?.addedPct ?? 0}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-2.5 rounded-full bg-cyan-400"
                      style={{ width: `${clampPercent(data?.addedPct)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                    <span>Changed %</span>
                    <span>{data?.changedPct ?? 0}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-2.5 rounded-full bg-yellow-400"
                      style={{ width: `${clampPercent(data?.changedPct)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                    <span>Total Movement %</span>
                    <span>{data?.movementPct ?? 0}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-2.5 rounded-full bg-emerald-400"
                      style={{ width: `${clampPercent(data?.movementPct)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
                <SectionTitle title="Signals & Tags" subtitle="Semantic surface scan" />

                {data?.signals?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {data.signals.map((signal) => (
                      <span
                        key={signal}
                        className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-500">
                    No signals detected.
                  </div>
                )}

                <div className="mt-5">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Tags
                  </div>
                  {!!data?.tags?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {data.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No tags assigned.</div>
                  )}
                </div>

                <div className="mt-6 grid gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Signal Type
                    </div>
                    <div className="mt-2 text-xl font-semibold text-cyan-300">{signalType}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Generated
                    </div>
                    <div className="mt-2 text-sm text-slate-300">
                      {formatDate(data?.generatedAt)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
                <SectionTitle
                  title="Executive Readout"
                  subtitle="Human-readable interpretation layer"
                  right={
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                      Confidence{" "}
                      {data?.confidence ? `${Math.round(data.confidence * 100)}%` : "0%"}
                    </span>
                  }
                />

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Summary
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{data?.summary || "..."}</p>
                </div>

                <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
                    AI Insight
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {data?.insight || "No insight"}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Reading
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-400">{data?.note || "..."}</p>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-white/10 bg-[#05070a] p-5">
            <SectionTitle
              title="History"
              subtitle="Recent terminal states"
              right={
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                  last {Math.min(history.length, 8)}
                </span>
              }
            />

            <div className="space-y-3">
              {history.length > 0 ? (
                history.slice(0, 8).map((item) => {
                  const itemPalette = getLevelPalette(item.level)
                  const itemSignalType = getSignalType(item)
                  const itemProbability =
                    item.level === "VERY HIGH"
                      ? "VERY HIGH"
                      : item.level === "HIGH"
                      ? "HIGH"
                      : item.level === "MEDIUM"
                      ? "MEDIUM"
                      : "LOW"

                  return (
                    <div
                      key={`${item.id}-${item.generatedAt}`}
                      className="rounded-xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="break-all text-sm font-medium text-white">{item.id}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatDate(item.generatedAt)}
                          </div>
                        </div>

                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${itemPalette.badge}`}>
                          {item.level}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                        <div>
                          Signal: <span className="text-cyan-300">{itemSignalType}</span>
                        </div>
                        <div>
                          Launch:{" "}
                          <span className={`rounded-full border px-2 py-0.5 ${probabilityClass(itemProbability)}`}>
                            {itemProbability}
                          </span>
                        </div>
                        <div>
                          Score: <span className="text-white">{item.score}</span>
                        </div>
                        <div>
                          Movement: <span className="text-emerald-300">{item.movementPct ?? 0}%</span>
                        </div>
                      </div>

                      <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                        <div
                          className={`h-2 rounded-full ${itemPalette.bar}`}
                          style={{ width: `${clampPercent(item.score)}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-500">
                  No history available yet.
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Terminal Status"
            value={
              data?.level === "VERY HIGH"
                ? "Immediate attention"
                : data?.level === "HIGH"
                ? "Strong movement"
                : data?.level === "MEDIUM"
                ? "Visible buildup"
                : "Quiet surface"
            }
            valueClassName="text-lg text-white"
          />
          <MetricCard
            label="Signal Count"
            value={data?.signals?.length ?? 0}
            valueClassName="text-cyan-300"
          />
          <MetricCard
            label="Trend"
            value={
              data?.trendDirection === "UP"
                ? `↑ +${data?.trend ?? 0}%`
                : data?.trendDirection === "DOWN"
                ? `↓ ${data?.trend ?? 0}%`
                : `${data?.trend ?? 0}%`
            }
          />
          <MetricCard
            label="Generated"
            value={formatDate(data?.generatedAt)}
            valueClassName="text-sm leading-snug text-white"
          />
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#05070a] p-5">
          <SectionTitle
            title="Trend Graph"
            subtitle="Score vs movement across latest runs"
            right={
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  Score
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  Movement %
                </div>
              </div>
            }
          />

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            {chartData.length > 0 ? (
              <>
                <div className="relative h-64 w-full">
                  <svg
                    viewBox="0 0 100 50"
                    preserveAspectRatio="none"
                    className="h-full w-full overflow-visible"
                  >
                    <line x1="0" y1="40" x2="100" y2="40" stroke="rgba(255,255,255,0.16)" strokeWidth="0.6" />
                    <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.07)" strokeWidth="0.4" />
                    <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(255,255,255,0.07)" strokeWidth="0.4" />
                    <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.07)" strokeWidth="0.4" />
                    <line x1="0" y1="0" x2="100" y2="0" stroke="rgba(255,255,255,0.07)" strokeWidth="0.4" />

                    {scorePoints ? (
                      <polyline
                        fill="none"
                        stroke="rgb(34, 211, 238)"
                        strokeWidth="1.7"
                        points={scorePoints}
                      />
                    ) : null}

                    {movementPoints ? (
                      <polyline
                        fill="none"
                        stroke="rgb(52, 211, 153)"
                        strokeWidth="1.7"
                        points={movementPoints}
                      />
                    ) : null}

                    {chartData.map((point, index) => {
                      const x = chartData.length === 1 ? 50 : (index / (chartData.length - 1)) * 100
                      const scoreY = 40 - (point.score / 100) * 40
                      const movementY = 40 - (point.movement / 100) * 40

                      return (
                        <g key={`${point.label}-${index}`}>
                          <circle cx={x} cy={scoreY} r="1.5" fill="rgb(34, 211, 238)" />
                          <circle cx={x} cy={movementY} r="1.5" fill="rgb(52, 211, 153)" />
                        </g>
                      )
                    })}
                  </svg>
                </div>

                <div
                  className={`mt-4 grid gap-2 text-center text-xs text-slate-500 ${
                    chartData.length <= 4 ? "grid-cols-4" : "grid-cols-8"
                  }`}
                >
                  {chartData.map((point, index) => (
                    <div key={`${point.label}-${index}`} className="truncate">
                      {point.label}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-500">
                No chart data available yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#05070a] p-5">
          <SectionTitle
            title="Recent Alerts"
            subtitle="Latest delivered alert events"
            right={
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                {alerts.length} total
              </span>
            }
          />

          {alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-500">
              No alerts yet.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {alerts.slice(0, 6).map((alert, i) => {
                const alertPalette = getLevelPalette(alert.level)
                const alertSignalType = getSignalType(alert)
                const alertProbability =
                  alert.level === "VERY HIGH"
                    ? "VERY HIGH"
                    : alert.level === "HIGH"
                    ? "HIGH"
                    : alert.level === "MEDIUM"
                    ? "MEDIUM"
                    : "LOW"

                return (
                  <div
                    key={`${alert.id}-${alert.sentAt}-${i}`}
                    className="rounded-xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${alertPalette.dot}`} />
                          <span className="text-sm font-medium text-white">{alert.summary}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{formatDate(alert.sentAt)}</div>
                      </div>

                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${alertPalette.badge}`}>
                        {alert.level}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div>
                        Signal: <span className="text-cyan-300">{alertSignalType}</span>
                      </div>
                      <div>
                        Launch:{" "}
                        <span className={`rounded-full border px-2 py-0.5 ${probabilityClass(alertProbability)}`}>
                          {alertProbability}
                        </span>
                      </div>
                      <div>
                        Score: <span className="text-white">{alert.score}</span>
                      </div>
                      <div>
                        Movement: <span className="text-emerald-300">{alert.movementPct}%</span>
                      </div>
                    </div>

                    <div className="mt-4 text-sm text-slate-400">{alert.insight}</div>

                    {!!alert.signals?.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {alert.signals.map((signal, signalIndex) => (
                          <span
                            key={`${signal}-${signalIndex}`}
                            className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-300"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}