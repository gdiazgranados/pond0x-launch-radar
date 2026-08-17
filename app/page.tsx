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
import { ChainIntelligencePanel } from "./components/radar/ChainIntelligencePanel"
import { evaluateAlpha } from "./lib/alpha"
import { AlphaPanel } from "./components/AlphaPanel"
import {
  clampPercent,
  getHeartbeatStatus,
  getLevelPalette,
  getSignalType,
  getLaunchProbability,
  probabilityClass,
  probabilityFromLevel,
  getTickerTone,
  buildNarrative,
  prioritizeLaunchSignals,
} from "./lib/radar"

type RadarPattern =
  | string
  | {
      tag?: string
      confidence?: string
      reasons?: string[]
    }

function formatSnapshotId(snapshotId?: string | null) {
  if (!snapshotId) return "..."

  const compactMatch = snapshotId.match(
    /^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})$/
  )

  if (compactMatch) {
    const [, datePart, hh, mm, ss] = compactMatch
    const utcIso = `${datePart}T${hh}:${mm}:${ss}Z`

    return (
      <div className="space-y-1">
        <div className="break-words">{formatDate(utcIso)}</div>
      </div>
    )
  }

  const fullMatch = snapshotId.match(
    /^(\d{4}-\d{2}-\d{2})_(\d{6})__(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/
  )

  if (fullMatch) {
    const [, , , iso] = fullMatch

    return (
      <div className="space-y-1">
        <div className="break-words">{formatDate(iso)}</div>
      </div>
    )
  }

  return <div className="break-all">{snapshotId}</div>
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
        <div className={`h-3 rounded-full ${barTone}`} style={{ width: `${clampPercent(value)}%` }} />
      </div>
    </div>
  )
}

function getEta(data: any) {
  const level = String(data?.level ?? "LOW").toUpperCase()
  const scorePercent = Number(data?.scorePercent ?? data?.score ?? 0)
  const movement = Number(data?.movementPercent ?? data?.movementPct ?? 0)
  const trendDirection = String(data?.trendDirection ?? "FLAT").toUpperCase()
  const trend = typeof data?.trend === "number" ? data.trend : 0

  if (level === "CRITICAL" && (trendDirection === "UP" || trend >= 8)) return "< 24h"
  if (scorePercent >= 85 && movement >= 25 && (trendDirection === "UP" || trend >= 8)) return "< 6h"
  if (scorePercent >= 75 && movement >= 20) return "< 24h"
  if (scorePercent >= 60) return "24h - 72h"
  return "monitoring"
}

function getPriorityMode(data: any) {
  const tags = data?.tags || []
  const level = String(data?.level || "LOW").toUpperCase()
  const activationProbability = Number(data?.activationProbability ?? 0)
  const isImminent = Boolean(data?.launchImminent) || tags.includes("LAUNCH_IMMINENT")
  const isPortalArmed = Boolean(data?.portalArmed) || tags.includes("PORTAL_ARMED")

  if (isImminent || level === "CRITICAL") {
    return {
      mode: "CRITICAL",
      mainBg: "bg-[#090203]",
      headerClass: "border-red-500/40 bg-red-950/20 shadow-[0_0_40px_rgba(255,0,0,0.12)]",
      bannerClass: "border-red-500/40 bg-red-900/25 text-red-200 shadow-[0_0_25px_rgba(255,0,0,0.12)]",
      title: "🚨 CRITICAL SIGNAL — ACTIVATION CONDITIONS MET",
    }
  }

  if (isPortalArmed) {
    return {
      mode: "PORTAL_ARMED",
      mainBg: "bg-[#120b05]",
      headerClass: "border-orange-500/30 bg-orange-900/10 shadow-[0_0_35px_rgba(255,140,0,0.10)]",
      bannerClass: "border-orange-500/30 bg-orange-900/20 text-orange-200 shadow-[0_0_20px_rgba(255,140,0,0.10)]",
      title: "🔥 PORTAL ARMED — HIGH-CONVICTION SETUP",
    }
  }

  if (level === "VERY HIGH" || activationProbability >= 70) {
    return {
      mode: "VERY_HIGH",
      mainBg: "bg-[#120b05]",
      headerClass: "border-orange-500/30 bg-orange-900/10 shadow-[0_0_35px_rgba(255,140,0,0.10)]",
      bannerClass: "border-orange-500/30 bg-orange-900/20 text-orange-200 shadow-[0_0_20px_rgba(255,140,0,0.10)]",
      title: "⚠️ VERY HIGH SIGNAL — ACTIVATION CONDITIONS BUILDING",
    }
  }

  if (level === "HIGH" || activationProbability >= 50) {
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

function getAlphaClassTone(alphaClass: string) {
  switch (alphaClass) {
    case "CRITICAL":
      return "text-red-300"
    case "ACTIONABLE":
      return "text-orange-300"
    case "SETUP":
      return "text-yellow-300"
    case "WATCH":
      return "text-cyan-300"
    default:
      return "text-slate-300"
  }
}

function getTriggerStateTone(triggerState: string) {
  switch (triggerState) {
    case "TRIGGERED":
      return "text-red-300"
    case "ARMED":
      return "text-orange-300"
    case "WATCHING":
      return "text-cyan-300"
    default:
      return "text-slate-300"
  }
}

export default function Home() {
  const {
    data,
    history,
    alerts,
    loading,
    heartbeatData,
    chainIntelligence,
    chainBaseline,
  } = useRadarData()
  const { latestEvent } = useSentinelData()
  const [now, setNow] = useState(Date.now())

  const cleanHistory = useMemo(() => {
    return Array.from(new Map(history.map((item) => [item.id, item])).values())
  }, [history])

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(clockInterval)
  }, [])

  const prioritizedData = useMemo(() => prioritizeLaunchSignals(data), [data])

  const current = prioritizedData ?? data

  const uiScore = useMemo(() => Number(current?.score ?? 0), [current])

  const rawScore = useMemo(() => Number(current?.rawScore ?? current?.score ?? 0), [current])

  const uiScorePercent = useMemo(() => Number(current?.scorePercent ?? 0), [current])

  const uiMovement = useMemo(
    () => Number(current?.movementPercent ?? current?.movementPct ?? 0),
    [current]
  )

  const priorityMode = getPriorityMode(current)
  const isElevated = priorityMode.mode !== "NORMAL"
  const isPriorityView =
    priorityMode.mode === "PORTAL_ARMED" ||
    priorityMode.mode === "VERY_HIGH" ||
    priorityMode.mode === "CRITICAL"

  const palette = useMemo(() => getLevelPalette(current?.level), [current?.level])

  const signalType = useMemo(() => getSignalType(current), [current])

  const launchProbability = useMemo(() => getLaunchProbability(current), [current])

  const activationProbability = useMemo(
    () => Number(current?.activationProbability ?? 0),
    [current]
  )

  const narrative = useMemo(() => buildNarrative(current), [current])

  const effectiveFreshnessDate = useMemo(() => {
    const hb = heartbeatData?.lastSuccessAt || heartbeatData?.lastRunAt
    const hist = cleanHistory?.[0]?.generatedAt

    const hbTs = hb ? new Date(hb).getTime() : 0
    const histTs = hist ? new Date(hist).getTime() : 0

    if (!hbTs && !histTs) return undefined
    return new Date(Math.max(hbTs, histTs)).toISOString()
  }, [heartbeatData?.lastSuccessAt, heartbeatData?.lastRunAt, cleanHistory])

  const heartbeat = getHeartbeatStatus(
    effectiveFreshnessDate,
    heartbeatData?.scheduleMinutes || 5
  )

  const radarTrust = useMemo(() => {
  const heartbeatState = heartbeat.label

  const webObservabilityState =
    current?.observability?.status || "UNKNOWN"

  const chainObservabilityState =
    chainIntelligence?.chainObservability?.status || "UNKNOWN"

  if (
    webObservabilityState === "BLIND_SPOT" ||
    chainObservabilityState === "BLIND_SPOT"
  ) {
    return {
      label: "UNTRUSTED",
      description: "Monitoring visibility is impaired.",
      detail:
        "Absence of signals cannot be trusted while any monitoring surface has a blind spot.",
      dot: "bg-red-500",
      text: "text-red-400",
      badge:
        "border-red-500/40 bg-red-500/10 text-red-300",
    }
  }

  if (heartbeatState === "STALE") {
    return {
      label: "STALE DATA",
      description: "Radar data is no longer fresh.",
      detail: "Wait for a successful monitoring sweep.",
      dot: "bg-red-500",
      text: "text-red-400",
      badge:
        "border-red-500/40 bg-red-500/10 text-red-300",
    }
  }

  if (heartbeatState === "LAGGING") {
    return {
      label: "LAGGING",
      description: "Monitoring is running behind schedule.",
      detail: "Interpret current signals with caution.",
      dot: "bg-amber-400",
      text: "text-amber-400",
      badge:
        "border-amber-500/40 bg-amber-500/10 text-amber-300",
    }
  }

  if (
    heartbeatState === "FRESH" &&
    (
      webObservabilityState === "DEGRADED" ||
      chainObservabilityState === "DEGRADED"
    )
  ) {
    return {
      label: "PARTIAL",
      description:
        "Radar is fresh but monitoring coverage is degraded.",
      detail:
        "Some web or on-chain visibility may be incomplete.",
      dot: "bg-amber-400",
      text: "text-amber-400",
      badge:
        "border-amber-500/40 bg-amber-500/10 text-amber-300",
    }
  }

  if (
    heartbeatState === "FRESH" &&
    webObservabilityState === "HEALTHY" &&
    chainObservabilityState === "HEALTHY"
  ) {
    return {
      label: "TRUSTED",
      description:
        "Radar data is fresh and both web and chain visibility are healthy.",
      detail:
        "Current signal absence can be interpreted normally.",
      dot: "bg-emerald-400",
      text: "text-emerald-400",
      badge:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    }
  }

  return {
    label: "UNKNOWN",
    description: "Radar trust cannot be established yet.",
    detail:
      "Waiting for complete web and on-chain monitoring telemetry.",
    dot: "bg-slate-500",
    text: "text-slate-400",
    badge:
      "border-slate-500/30 bg-slate-500/10 text-slate-300",
  }
}, [
  heartbeat.label,
  current?.observability?.status,
  chainIntelligence?.chainObservability?.status,
])

  const previousPollAt = useMemo(() => {
    if (!effectiveFreshnessDate) return null
    const dt = new Date(effectiveFreshnessDate)
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
  }, [effectiveFreshnessDate])

  const nextPollAt = useMemo(() => {
    const scheduleMinutes = Number(heartbeatData?.scheduleMinutes ?? 5)
    if (!effectiveFreshnessDate) return null

    const dt = new Date(effectiveFreshnessDate)
    if (Number.isNaN(dt.getTime())) return null

    return new Date(dt.getTime() + scheduleMinutes * 60 * 1000).toISOString()
  }, [effectiveFreshnessDate, heartbeatData?.scheduleMinutes])

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

  const recentHistory = useMemo(() => cleanHistory.slice(0, 12), [cleanHistory])
  const tapeHistory = useMemo(() => cleanHistory.slice(0, 5), [cleanHistory])
  const checkInHistory = useMemo(() => cleanHistory.slice(0, 8), [cleanHistory])

  const velocity = useMemo(() => {
    if (recentHistory.length < 2) return 0
    return Number(recentHistory[0]?.score ?? 0) - Number(recentHistory[1]?.score ?? 0)
  }, [recentHistory])

  const burstCount = useMemo(() => {
    const nowTs = Date.now()
    return cleanHistory.filter((item) => {
      const ts = new Date(item.generatedAt || 0).getTime()
      return Number.isFinite(ts) && nowTs - ts <= 5 * 60 * 1000
    }).length
  }, [cleanHistory])

  const confidenceScore = useMemo(() => {
    const score = uiScorePercent
    const movement = uiMovement
    const trend = Number(current?.trend ?? 0)

    const raw = score * 0.6 + movement * 0.2 + trend * 2
    return Math.max(0, Math.min(100, Math.round(raw)))
  }, [uiScorePercent, uiMovement, current])

  const alpha = useMemo(() => {
    return evaluateAlpha({
      score: uiScorePercent,
      movementPct: uiMovement,
      trend: Number(current?.trend ?? 0),
      tags: current?.tags ?? [],
      signals: current?.signals ?? [],
      activationProbability: Number(current?.activationProbability ?? 0),
    })
  }, [uiScorePercent, uiMovement, current, burstCount])

    const readinessState = useMemo(() => {
    const score = uiScorePercent
    const movement = uiMovement
    const trend = Number(current?.trend ?? 0)
    const tags = current?.tags || []
    const signals = current?.signals || []
    const portalArmed = Boolean(current?.portalArmed) || tags.includes("PORTAL_ARMED")
    const launchImminent = Boolean(current?.launchImminent) || tags.includes("LAUNCH_IMMINENT")

    const hasRewards =
      tags.includes("REWARDS") || signals.includes("reward") || signals.includes("claim")

    const hasWalletConnect =
      signals.includes("connect") &&
      (signals.includes("ethereum") || signals.includes("solana"))

    const confidence = Math.max(
      0,
      Math.min(100, Math.round(score * 0.6 + movement * 0.2 + trend * 2))
    )

    if (launchImminent) {
      return {
        label: "IMMINENT",
        tone: "text-red-300",
        badge: "border-red-500/30 bg-red-500/10 text-red-200",
        note: "activation conditions met",
      }
    }

    if (portalArmed) {
      return {
        label: "PORTAL ARMED",
        tone: "text-orange-300",
        badge: "border-orange-500/30 bg-orange-500/10 text-orange-200",
        note: "claim readiness + wallet/auth cluster detected",
      }
    }

    if (
      score >= 80 ||
      confidence >= 75 ||
      (hasRewards && hasWalletConnect && burstCount >= 2)
    ) {
      return {
        label: "ARMED",
        tone: "text-red-300",
        badge: "border-red-500/30 bg-red-500/10 text-red-200",
        note: "critical launch modules aligned",
      }
    }

    if (
      score >= 35 ||
      confidence >= 45 ||
      movement >= 10 ||
      trend >= 3 ||
      hasRewards ||
      hasWalletConnect
    ) {
      return {
        label: "BUILDING",
        tone: "text-yellow-300",
        badge: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
        note: "stacking pre-launch conditions",
      }
    }

    return {
      label: "STANDBY",
      tone: "text-emerald-300",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      note: "monitoring baseline activity",
    }
  }, [uiScorePercent, uiMovement, current, burstCount])

  const tickerItems = useMemo(() => {
    const latestItem = current
      ? [
          {
            id: `latest-${current.id ?? "current"}`,
            time: formatDate(current.generatedAt),
            level: current.level || "LOW",
            signalType: getSignalType(current),
            probability: getLaunchProbability(current),
            label: "LIVE",
          },
        ]
      : []

    const historyItems = tapeHistory.map((item) => ({
      id: `history-${item.id}-${item.generatedAt}`,
      time: formatDate(item.generatedAt),
      level: item.level || "LOW",
      signalType: getSignalType(item),
      probability: probabilityFromLevel(item.level),
      label: "HIST",
    }))

    const alertItems = alerts
      .slice(0, 5)
      .map((alert) => {
        const alertTimestamp = alert.sentAt || alert.generatedAt || null

        return {
          id: `alert-${alert.id || alertTimestamp}`,
          time: alertTimestamp ? formatDate(alertTimestamp) : "no-ts",
          level: alert.level || "LOW",
          signalType: getSignalType(alert),
          probability: probabilityFromLevel(alert.level),
          label: "ALERT",
        }
      })
      .filter((item) => item.time !== "no-ts")

    const merged = [...latestItem, ...alertItems, ...historyItems]

    const unique = Array.from(new Map(merged.map((item) => [item.id, item])).values())

    return unique.slice(0, 10)
  }, [current, tapeHistory, alerts])

  const breakdown = current?.breakdown

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020406] text-white">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
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
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 2xl:px-10">
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
                <span className="font-semibold">{narrative?.headline || priorityMode.title}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span>Score {uiScore}</span>
                <span>Intensity {uiScorePercent}/100</span>
                <span>Trend {current?.trendDirection ?? "FLAT"}</span>
                <span>ETA {getEta(current)}</span>
                {(narrative?.context || []).map((item, i) => (
                  <span key={i} className="opacity-80">
                    {item}
                  </span>
                ))}
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
                  {current?.level || "LOW"}
                </span>
                <TrendBadge trendDirection={current?.trendDirection} trend={current?.trend} />
                <span
                  className={`rounded-full border px-3 py-1 text-xs ${
                    priorityMode.mode === "CRITICAL"
                      ? "border-red-500/30 bg-red-500/10 text-red-200"
                      : "border-orange-500/30 bg-orange-500/10 text-orange-300"
                  }`}
                >
                  ETA {getEta(current)}
                </span>
              </div>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Compact cockpit for frontend movement, launch indicators, reward flows,
                wallet patterns, alert state, and activation probability across Pond0x surfaces.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Snapshot"
                  value={formatSnapshotId(current?.id)}
                  valueClassName="font-mono text-lg sm:text-xl text-white leading-tight break-all"
                />
                <MetricCard
                  label="Score"
                  value={uiScore}
                  subvalue={`intensity: ${uiScorePercent}/100`}
                  valueClassName={palette.text}
                />
                <MetricCard
                  label="Signal Type"
                  value={signalType}
                  valueClassName="text-cyan-300 text-[clamp(1.75rem,3vw,3rem)] leading-tight"
                />
                <MetricCard
                  label="Launch Probability"
                  value={
                    <div className="flex flex-col gap-2">
                      <span
                        className={`inline-flex w-fit rounded-full border px-3 py-1 text-base ${probabilityClass(
                          launchProbability
                        )}`}
                      >
                        {launchProbability}
                      </span>
                      <span className="text-xs text-slate-500">
                        level: {current?.level || "LOW"}
                      </span>
                    </div>
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
                    {current?.level || "LOW"}
                  </span>
                  <span>{Math.min(100, uiScorePercent)}/100 intensity</span>
                  <span className="text-xs opacity-70">score: {uiScore}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                  Observability
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${
                      current?.observability?.status === "HEALTHY"
                        ? "bg-emerald-400"
                        : current?.observability?.status === "DEGRADED"
                          ? "bg-amber-400"
                          : current?.observability?.status === "BLIND_SPOT"
                            ? "bg-red-500"
                            : "bg-slate-500"
                    }`}
                  />

                  <div
                    className={`text-2xl font-semibold ${
                      current?.observability?.status === "HEALTHY"
                        ? "text-emerald-400"
                        : current?.observability?.status === "DEGRADED"
                          ? "text-amber-400"
                          : current?.observability?.status === "BLIND_SPOT"
                            ? "text-red-400"
                            : "text-slate-400"
                    }`}
                 >
                    {current?.observability?.status || "UNKNOWN"}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>
                    <div className="text-slate-500">Navigation</div>
                    <div className="mt-1 text-slate-200">
                      {current?.observability?.navigationOk ? "OK" : "FAILED"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Document</div>
                    <div className="mt-1 text-slate-200">
                      {current?.observability?.documentCaptured ? "CAPTURED" : "MISSING"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">First-party</div>
                    <div className="mt-1 text-slate-200">
                      {current?.observability?.firstPartyResponseCount ?? 0} responses
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">First-party APIs</div>
                    <div className="mt-1 text-slate-200">
                      {current?.observability?.firstPartyApiCount ?? 0}
                    </div>
                  </div>
                </div>

                {current?.observability?.blindSpot && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    Monitoring visibility impaired. Absence of signals cannot be trusted.
                  </div>
               )}

               {current?.observability?.degraded &&
                 !current?.observability?.blindSpot && (
                   <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                     Monitoring coverage is degraded.
                   </div>
               )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                Radar Trust
              </div>

              <div className="mt-3 flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${radarTrust.dot}`}
                />

                <div
                  className={`text-2xl font-semibold ${radarTrust.text}`}
                >
                  {radarTrust.label}
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-300">
                {radarTrust.description}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {radarTrust.detail}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span
                  className={`rounded-full border px-2 py-0.5 ${heartbeat.badge}`}
                >
                  Heartbeat {heartbeat.label}
                </span>

                <span
                  className={`rounded-full border px-2 py-0.5 ${radarTrust.badge}`}
                >
                  Web {current?.observability?.status || "UNKNOWN"}
                </span>

                <span
                  className={`rounded-full border px-2 py-0.5 ${radarTrust.badge}`}
                >
                  Chain{" "}
                  {chainIntelligence?.chainObservability?.status || "UNKNOWN"}
                </span>
              </div>
            </div>
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.05] p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300">
                  Activation Probability
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <div className="text-2xl font-bold text-white">{activationProbability}%</div>
                  <div className="text-right text-xs text-slate-400">
                    probability model output
                  </div>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-orange-400"
                    style={{ width: `${clampPercent(activationProbability)}%` }}
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
            freshnessDate={effectiveFreshnessDate}
          />
          <CheckInTape
            items={checkInHistory.map((item) => ({
              id: `${item.id}-${item.generatedAt}`,
              time: formatDate(item.generatedAt),
              full: formatDate(item.generatedAt),
              status: item.observability?.status || "UNKNOWN",
            }))}
          />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {isPriorityView && (
            <div className="grid gap-5 xl:col-span-12 xl:grid-cols-12">
              <div className="rounded-3xl border border-orange-500/30 bg-orange-500/10 p-4 sm:p-5 xl:col-span-8">
                <SectionTitle title="Priority Readout" subtitle="Immediate signal interpretation" />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Insight
                    </div>
                    <div className="mt-2 text-lg font-bold text-white">
                      {current?.insight || "No insight"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Why it matters
                    </div>
                    <div className="mt-2 text-sm leading-6 text-white">
                      {current?.whyItMatters || "No escalation context available."}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-orange-500/20 bg-orange-500/[0.05] p-4 sm:p-5 xl:col-span-4">
                <SectionTitle
                  title="Pattern Highlights"
                  subtitle="Key signals driving activation"
                />

                <div className="flex flex-wrap gap-3">
                  {(current?.patterns || []).slice(0, 4).map((p: RadarPattern, i: number) => {
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

          <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5 xl:col-span-12">
            <SectionTitle
              title="Flight Instruments"
              subtitle="Core radar metrics"
              right={
                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                  LIVE SNAPSHOT
                </span>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Total Files" value={current?.totalFiles ?? 0} />
              <MetricCard
                label="Added"
                value={current?.added ?? 0}
                subvalue={`${current?.addedPercent ?? current?.addedPct ?? 0}% of surface`}
                valueClassName="text-cyan-300"
              />
              <MetricCard
                label="Changed"
                value={current?.changed ?? 0}
                subvalue={`${current?.changedPercent ?? current?.changedPct ?? 0}% of surface`}
                valueClassName="text-yellow-300"
              />
              <MetricCard
                label="Movement"
                value={`${uiMovement}%`}
                subvalue={`raw: ${current?.movementPct ?? 0}%`}
                valueClassName="text-emerald-300"
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Gauge label="Radar Score" value={uiScorePercent} />
              <Gauge label="Activation Probability" value={activationProbability} tone="orange" />
              <Gauge
                label="Changed %"
                value={Number(current?.changedPercent ?? current?.changedPct ?? 0)}
                tone="yellow"
              />
              <Gauge label="Movement %" value={uiMovement} tone="emerald" />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5 xl:col-span-12">
            <SectionTitle
              title="API Response Drift"
              subtitle="Structural changes detected in first-party API responses"
              right={
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    current?.discovery?.apiResponseDrift?.detected
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  {current?.discovery?.apiResponseDrift?.detected
                    ? "DRIFT DETECTED"
                    : "STABLE"}
                </span>
              }
            />

            {current?.discovery?.apiResponseDrift?.detected ? (
              <div className="space-y-3">
                {current.discovery.apiResponseDrift.changedRoutes?.map(
                  (drift, index) => (
                    <div
                      key={`${drift.route || "unknown"}-${index}`}
                      className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-mono text-sm text-amber-200">
                          {drift.route || "Unknown API route"}
                        </div>

                        <div className="text-xs text-slate-500">
                          size Δ {drift.sizeDelta ?? 0}
                        </div>
                      </div>

                      {!!drift.addedPaths?.length && (
                        <div className="mt-3">
                          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                            Added schema paths
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {drift.addedPaths.map((path) => (
                              <span
                                key={`added-${path}`}
                                className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-300"
                              >
                                + {path}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {!!drift.removedPaths?.length && (
                        <div className="mt-3">
                          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-red-400">
                            Removed schema paths
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {drift.removedPaths.map((path) => (
                              <span
                                key={`removed-${path}`}
                                className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 font-mono text-xs text-red-300"
                              >
                                − {path}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.03] p-4">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />

                  <div>
                    <div className="text-sm font-medium text-slate-200">
                      No structural API changes detected
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      First-party API response schemas match the previous monitoring baseline.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5 xl:col-span-12">
            <SectionTitle
              title="Evidence Correlation"
              subtitle="Fresh evidence correlated across independent monitoring domains"
              right={
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    current?.evidenceCorrelation?.classification === "STRONG"
                      ? "border-red-500/30 bg-red-500/10 text-red-300"
                      : current?.evidenceCorrelation?.classification === "MULTI_SURFACE"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        : current?.evidenceCorrelation?.classification === "ISOLATED"
                          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  {current?.evidenceCorrelation?.classification || "NONE"}
                </span>
              }
            />

            <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Evidence
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    {current?.evidenceCorrelation?.evidenceCount ?? 0}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Domains
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    {current?.evidenceCorrelation?.domainCount ?? 0}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["API", current?.evidenceCorrelation?.domains?.api],
                  ["Backend", current?.evidenceCorrelation?.domains?.backend],
                  ["Semantic", current?.evidenceCorrelation?.domains?.semantic],
                  ["Web Surface", current?.evidenceCorrelation?.domains?.webSurface],
                  ["On-chain", current?.evidenceCorrelation?.domains?.onchain],
                ].map(([label, active]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-white/10 bg-black/25 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">{String(label)}</span>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          active ? "bg-emerald-400" : "bg-slate-600"
                        }`}
                      />
                    </div>

                    <div
                      className={`mt-2 text-xs font-medium ${
                        active ? "text-emerald-300" : "text-slate-600"
                      }`}
                    >
                      {active ? "ACTIVE" : "OFF"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {!isPriorityView && (
            <div className="grid gap-5 xl:col-span-12 xl:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5">
                <SectionTitle title="Signals & Tags" subtitle="Semantic surface scan" />

                {current?.signals?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {current.signals.map((signal: string) => (
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

                  {!!current?.tags?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {current.tags.map((tag: string) => (
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
                    <div className="mt-2 text-sm text-slate-300">{formatDate(current?.generatedAt)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5">
                <SectionTitle
                  title="Executive Readout"
                  subtitle="Human-readable interpretation layer"
                  right={
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                      Confidence {confidenceScore}%
                    </span>
                  }
                />

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Summary
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{current?.summary || "..."}</p>
                </div>

                <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
                    AI Insight
                  </div>
                  <div className="mt-2 text-lg font-bold leading-7 text-white">
                    {current?.insight || "No insight"}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Reading
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-400">{current?.note || "..."}</p>
                </div>
              </div>
            </div>
          )}

          <div className="min-w-0 xl:col-span-12">
            <HistoryPanel history={recentHistory} />
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5 xl:col-span-12">
            <SectionTitle title="Operational Intelligence" subtitle="Live operational side instruments" />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Terminal Status
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{palette.label}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Readiness State
                </div>
                <div className={`mt-2 text-lg font-semibold ${readinessState.tone}`}>
                  {readinessState.label}
                </div>
                <div className="mt-1 text-xs text-slate-400">{readinessState.note}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Pattern Boost
                </div>
                <div className="mt-2 text-2xl font-semibold text-orange-300">
                  {breakdown?.patternBoost ?? 0}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Confidence
                </div>
                <div className="mt-2 text-2xl font-semibold text-emerald-300">{confidenceScore}%</div>
                <div className="mt-1 text-xs text-slate-400">weighted launch confidence</div>
              </div>

              <div className="sm:col-span-2 xl:col-span-2">
                <AlphaPanel alpha={alpha} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:col-span-2 xl:col-span-2">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Why This Matters
                </div>
                <div className="mt-2 text-sm leading-6 text-white">
                  {current?.whyItMatters || "No escalation context available yet."}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:col-span-12">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Velocity</div>
              <div className="mt-2 text-2xl font-semibold text-cyan-300">
                {velocity > 0 ? `+${velocity}` : velocity}
              </div>
              <div className="mt-1 text-xs text-slate-400">score change vs previous sweep</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Burst / 5m</div>
              <div className="mt-2 text-2xl font-semibold text-orange-300">{burstCount}</div>
              <div className="mt-1 text-xs text-slate-400">recent events in last 5 minutes</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Confidence</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-300">{confidenceScore}%</div>
              <div className="mt-1 text-xs text-slate-400">weighted launch confidence</div>
            </div>
          </div>

          <div className="min-w-0 xl:col-span-12">
            <TrendGraph values={recentHistory.map((h) => h.score)} />
          </div>

          <div className="min-w-0 xl:col-span-12">
            <RecentAlerts alerts={alerts} />
          </div>

          <div className="min-w-0 xl:col-span-12">
            <ChainIntelligencePanel
              chain={chainIntelligence}
              baseline={chainBaseline}
            />
          </div>

          <div className="min-w-0 xl:col-span-12">
            <SentinelPanel event={latestEvent} />
          </div>
        </section>
      </div>
    </main>
  )
}
