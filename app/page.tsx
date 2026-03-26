"use client"

import { useEffect, useMemo, useState } from "react"
import { useRadarData } from "./hooks/useRadarData"
import { formatDate, shortTime } from "./lib/date"
import { SectionTitle } from "./components/radar/SectionTitle"
import { MetricCard } from "./components/radar/MetricCard"
import { HeartbeatPanel } from "./components/radar/HeartbeatPanel"
import { CheckInTape } from "./components/radar/CheckInTape"
import { HistoryPanel } from "./components/radar/HistoryPanel"
import { RecentAlerts } from "./components/radar/RecentAlerts"
import { TrendGraph } from "./components/radar/TrendGraph"
import { useSentinelData } from "./hooks/useSentinelData"
import { SentinelPanel } from "./components/radar/SentinelPanel"
import {
  clampPercent,
  getHeartbeatStatus,
  getLevelPalette,
  getSignalType,
  getLaunchProbability,
  probabilityClass,
  probabilityFromLevel,
  getTickerTone,
} from "./lib/radar"

type RadarPattern =
  | string
  | {
      tag?: string
      confidence?: string
      reasons?: string[]
    }

function asPatternLabel(pattern: RadarPattern) {
  return typeof pattern === "string" ? pattern : pattern?.tag || "UNKNOWN"
}

function asPatternReasons(pattern: RadarPattern) {
  return typeof pattern === "string" ? [] : pattern?.reasons || []
}

function TrendBadge({
  trendDirection,
  trend,
}: {
  trendDirection?: string
  trend?: number
}) {
  const direction = trendDirection || "FLAT"
  const value = typeof trend === "number" ? trend : 0

  const tone =
    direction === "UP"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : direction === "DOWN"
      ? "border-red-500/30 bg-red-500/10 text-red-300"
      : "border-white/10 bg-white/5 text-slate-300"

  const arrow = direction === "UP" ? "↑" : direction === "DOWN" ? "↓" : "→"

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${tone}`}>
      <span>{arrow}</span>
      <span>{direction}</span>
      <span className="text-xs opacity-80">
        {value > 0 ? "+" : ""}
        {value}
      </span>
    </span>
  )
}

function Gauge({
  label,
  value,
  tone = "cyan",
}: {
  label: string
  value: number
  tone?: "cyan" | "yellow" | "emerald" | "orange"
}) {
  const barTone =
    tone === "yellow"
      ? "bg-yellow-400"
      : tone === "emerald"
      ? "bg-emerald-400"
      : tone === "orange"
      ? "bg-orange-400"
      : "bg-cyan-400"

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-500">
        <span>{label}</span>
        <span className="text-slate-300">{value}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-white/10">
        <div
          className={`h-3 rounded-full ${barTone}`}
          style={{ width: `${clampPercent(value)}%` }}
        />
      </div>
    </div>
  )
}

function getEta(data: any) {
  const score = Number(data?.score || 0)
  const movement = Number(data?.movementPct || 0)
  const trend = data?.trendDirection

  if (score >= 85 && movement >= 25 && trend === "UP") return "< 6h"
  if (score >= 75 && movement >= 20) return "< 24h"
  if (score >= 60) return "24h – 72h"
  return "monitoring"
}
function getTopPatternTags(patterns: any[] = []) {
  return patterns.slice(0, 3).map((p) =>
    typeof p === "string" ? p : p?.tag || "UNKNOWN"
  )
}

function getPriorityMode(data: any) {
  const tags = data?.tags || []
  const level = data?.level || "LOW"

  if (tags.includes("LAUNCH_IMMINENT")) {
    return {
      mode: "CRITICAL",
      mainBg: "bg-red-950",
      headerClass: "border-red-500/40 bg-red-900/20 shadow-[0_0_40px_rgba(255,0,0,0.15)]",
      bannerClass: "border-red-500/40 bg-red-900/30 text-red-200 shadow-[0_0_25px_rgba(255,0,0,0.15)]",
      title: "🚨 CRITICAL SIGNAL — PRE-LAUNCH CONDITIONS DETECTED",
    }
  }

  if (level === "VERY HIGH") {
    return {
      mode: "VERY_HIGH",
      mainBg: "bg-[#120b05]",
      headerClass: "border-orange-500/30 bg-orange-900/10 shadow-[0_0_35px_rgba(255,140,0,0.10)]",
      bannerClass: "border-orange-500/30 bg-orange-900/20 text-orange-200 shadow-[0_0_20px_rgba(255,140,0,0.10)]",
      title: "⚠️ VERY HIGH SIGNAL — ACTIVATION CONDITIONS BUILDING",
    }
  }

  if (level === "HIGH") {
    return {
      mode: "HIGH",
      mainBg: "bg-[#111008]",
      headerClass: "border-yellow-500/20 bg-yellow-900/10 shadow-[0_0_30px_rgba(255,215,0,0.08)]",
      bannerClass: "border-yellow-500/25 bg-yellow-900/15 text-yellow-200 shadow-[0_0_16px_rgba(255,215,0,0.08)]",
      title: "📡 HIGH SIGNAL — ELEVATED MOVEMENT DETECTED",
    }
  }

  return {
    mode: "NORMAL",
    mainBg: "bg-[#020406]",
    headerClass: "border-white/10 bg-gradient-to-b from-[#071019] to-[#04070b]",
    bannerClass: "border-white/10 bg-white/5 text-slate-200",
    title: "",
  }
}

export default function Home() {
  const { data, history, alerts, loading, heartbeatData } = useRadarData()

  const priorityMode = getPriorityMode(data)
  const isElevated = priorityMode.mode !== "NORMAL"

  const isPriorityView =
    priorityMode.mode === "VERY_HIGH" || priorityMode.mode === "CRITICAL"

  const { latestEvent } = useSentinelData()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(clockInterval)
  }, [])

  const palette = useMemo(() => getLevelPalette(data?.level), [data?.level])
  const signalType = useMemo(() => getSignalType(data), [data?.level, data?.signals, data?.tags, data?.score])
  const launchProbability = useMemo(() => getLaunchProbability(data), [data?.activationProbability, data?.level, data?.score])

  const heartbeat = getHeartbeatStatus(
    heartbeatData?.lastSuccessAt || heartbeatData?.lastRunAt || undefined,
    heartbeatData?.scheduleMinutes || 5
  )

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
    if (diff <= 0) return "overdue"

    const totalSeconds = Math.floor(diff / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}m ${seconds}s`
  }, [nextPollAt, now])

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
      id: `alert-${alert.id || index}-${alert.sentAt}-${index}`,
      time: shortTime(alert.sentAt),
      level: alert.level || "LOW",
      signalType: getSignalType(alert),
      probability: probabilityFromLevel(alert.level),
      label: "ALERT",
    }))

    return [...latestItem, ...alertItems, ...historyItems].slice(0, 10)
  }, [data, history, alerts])

  const breakdown = data?.breakdown
  const patterns = Array.isArray(data?.patterns) ? data.patterns : []
  const frontendHits = breakdown?.frontend?.hits ?? []
  const behaviorHits = breakdown?.behavior?.hits ?? []

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020406] text-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="animate-pulse space-y-4">
            <div className="h-10 w-72 rounded bg-white/10" />
            <div className="h-24 w-full rounded bg-white/5" />
            <div className="h-72 w-full rounded bg-white/5" />
            <div className="h-56 w-full rounded bg-white/5" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main
      className={`min-h-screen overflow-x-hidden text-white transition-colors duration-500 ${priorityMode.mainBg}`}
    >
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 xl:px-8">
        {isElevated && (
          <div
            className={`mb-4 rounded-2xl border px-4 py-3 transition-all duration-500 ${
              priorityMode.mode === "CRITICAL" ? "animate-pulse" : ""
            } ${priorityMode.bannerClass}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  {priorityMode.mode === "CRITICAL"
                    ? "🚨"
                    : priorityMode.mode === "VERY_HIGH"
                    ? "⚠️"
                    : "📡"}
                </span>
                <span className="font-semibold">
                  {priorityMode.title}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span>Score {data?.score}</span>
                <span>Trend {data?.trendDirection}</span>
                <span>ETA {getEta(data)}</span>
               <span>
                  {(getTopPatternTags(data?.patterns) || []).join(", ")}
                </span>
              </div>

            </div>
          </div>
        )}
        <header
          className={`mb-5 rounded-3xl border p-5 transition-all duration-500 ${priorityMode.headerClass}`}
        >
          <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-400">
                Pond0x Signal Terminal
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Pond0x Launch Radar
                </h1>
                <span
                  className={`rounded-full border px-3 py-1 text-xs ${
                    palette.badge
                  } ${priorityMode.mode === "CRITICAL" ? "animate-pulse" : ""}`}
                >
                  {data?.level || "LOW"}
                </span>
                <TrendBadge
                  trendDirection={data?.trendDirection}
                  trend={data?.trend}
                />
                <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-300">
                  ETA {getEta(data)}
                </span>
              </div>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Compact cockpit for frontend movement, launch indicators, reward flows,
                wallet patterns, alert state, and activation probability across Pond0x surfaces.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Snapshot"
                  value={data?.id || "..."}
                  valueClassName="break-all text-lg sm:text-xl text-white leading-tight"
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
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                  Terminal State
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${palette.dot}`} />
                  <div className={`text-2xl font-semibold ${palette.text}`}>{palette.label}</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${palette.badge}`}>
                    {data?.level || "LOW"}
                  </span>
                  <span>{data?.score ?? 0}/100 intensity</span>
                </div>
              </div>

              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.05] p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300">
                  Activation Probability
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <div className="text-2xl font-bold text-white">
                    {data?.activationProbability ?? 0}%
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    pattern-driven signal confidence
                  </div>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-orange-400"
                    style={{ width: `${clampPercent(data?.activationProbability ?? 0)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Signal Tape
              </div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-600">
                compact live feed
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {tickerItems.length > 0 ? (
                tickerItems.map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#05080c] px-3 py-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-500">{item.time}</div>
                      <div className={`mt-1 font-semibold ${getTickerTone(item.level)}`}>
                        {item.level}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 text-right">
                      <div className="truncate text-cyan-300">{item.signalType}</div>
                      <div className="mt-1 text-slate-400">{item.probability}</div>
                    </div>

                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {item.label}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No tape items yet.</div>
              )}
            </div>
          </div>
        </header>

        <section className="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <HeartbeatPanel
            heartbeat={heartbeat}
            nextPollAt={nextPollAt}
            previousPollAt={previousPollAt}
            nextSweepCountdown={nextSweepCountdown}
            source={heartbeatData?.source}
            freshnessDate={heartbeatData?.lastSuccessAt || heartbeatData?.lastRunAt || undefined}
          />
          <CheckInTape items={recentCheckIns} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          {isPriorityView && (
            <div className="space-y-5 mb-5">
    
              {/* 🔥 Priority Readout */}
              <div className="rounded-3xl border border-orange-500/30 bg-orange-500/10 p-5">
                <SectionTitle
                  title="Priority Readout"
                  subtitle="Immediate signal interpretation"
                />

                <div className="grid gap-4 lg:grid-cols-2">
        
                  {/* Insight */}
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Insight
                    </div>
                    <div className="mt-2 text-lg font-bold text-white">
                      {data?.insight || "No insight"}
                    </div>
                  </div>

                  {/* Why it matters */}
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Why it matters
                    </div>
                    <div className="mt-2 text-sm text-white">
                      {data?.whyItMatters || "No escalation context available."}
                    </div>
                  </div>

                </div>
              </div>

              {/* 🔥 Pattern Highlights */}
              <div className="rounded-3xl border border-orange-500/20 bg-orange-500/[0.05] p-5">
                <SectionTitle
                  title="Pattern Highlights"
                  subtitle="Key signals driving activation"
                />

                <div className="flex flex-wrap gap-3">
                  {(data?.patterns || []).slice(0, 4).map((p: any, i: number) => {
                    const label = typeof p === "string" ? p : p?.tag || "UNKNOWN"
                    return (
                      <span
                        key={i}
                        className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm text-orange-300"
                      >
                        {label}
                      </span>
                    )
                  })}
                </div>
              </div>

            </div>
          )}

          <div className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-[#05070a] p-5">
              <SectionTitle
                title="Flight Instruments"
                subtitle="Core radar metrics"
                right={
                  <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                    LIVE SNAPSHOT
                  </span>
                }
              />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                <MetricCard
                  label="Movement"
                  value={`${data?.movementPct ?? 0}%`}
                  valueClassName="text-emerald-300"
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Gauge label="Radar Score" value={Number(data?.score ?? 0)} tone="cyan" />
                <Gauge
                  label="Activation Probability"
                  value={Number(data?.activationProbability ?? 0)}
                  tone="orange"
                />
                <Gauge label="Changed %" value={Number(data?.changedPct ?? 0)} tone="yellow" />
                <Gauge label="Movement %" value={Number(data?.movementPct ?? 0)} tone="emerald" />
              </div>
            </div>

            {!isPriorityView && (
              <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-3xl border border-white/10 bg-[#05070a] p-5">
                  <SectionTitle title="Signals & Tags" subtitle="Semantic surface scan" />

                  {data?.signals?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {data.signals.map((signal: string) => (
                        <span
                          key={signal}
                          className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-500">
                      No signals detected.
                    </div>
                  )}

                  <div className="mt-5">
                   <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Tags
                    </div>

                    {!!data?.tags?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {data.tags.map((tag: string) => (
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

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                        Signal Type
                      </div>
                      <div className="mt-2 text-lg font-semibold text-cyan-300">{signalType}</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                        Generated
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        {formatDate(data?.generatedAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-[#05070a] p-5">
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

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Summary
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-300">
                      {data?.summary || "..."}
                    </p>
                  </div>

                  <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
                      AI Insight
                    </div>
                    <div className="mt-2 text-lg font-bold leading-7 text-white">
                      {data?.insight || "No insight"}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Reading
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-400">{data?.note || "..."}</p>
                  </div>
                </div>
              </div>
            )}

            <HistoryPanel history={history} />
          </div>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-[#05070a] p-5">
              <SectionTitle title="Right Console" subtitle="Operational side instruments" />

              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Terminal Status
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {data?.level === "VERY HIGH"
                      ? "Immediate attention"
                      : data?.level === "HIGH"
                      ? "Strong movement"
                      : data?.level === "MEDIUM"
                      ? "Visible buildup"
                      : "Quiet surface"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Why This Matters
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white">
                    {data?.whyItMatters || "No escalation context available yet."}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Pattern Boost
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-orange-300">
                    {breakdown?.patternBoost ?? 0}
                  </div>
                </div>
              </div>
            </div>

            <TrendGraph values={history.map((h) => h.score)} />
            <RecentAlerts alerts={alerts} />
            <SentinelPanel event={latestEvent} />
          </aside>
        </section>
      </div>
    </main>
  )
}