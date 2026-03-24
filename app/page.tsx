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

export default function Home() {
  const { data, history, alerts, loading, heartbeatData } = useRadarData()
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

          <HistoryPanel history={history} />

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

        <TrendGraph values={history.map((h) => h.score)} />

        <RecentAlerts alerts={alerts} />
      </div>
    </main>
  )
}