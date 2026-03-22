"use client"

import { useEffect, useMemo, useState } from "react"

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

function formatDate(dateString?: string) {
  if (!dateString) return "..."
  try {
    return new Date(dateString).toLocaleString()
  } catch {
    return dateString
  }
}

function shortTime(dateString?: string) {
  if (!dateString) return "..."
  try {
    return new Date(dateString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateString
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

export default function Home() {
  const [data, setData] = useState<RadarData | null>(null)
  const [history, setHistory] = useState<RadarData[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadRadar() {
      try {
        const [latestRes, historyRes, alertsRes] = await Promise.all([
          fetch("/data/latest.json", { cache: "no-store" }),
          fetch("/data/history.json", { cache: "no-store" }),
          fetch("/data/alerts-history.json", { cache: "no-store" }),
        ])

        const latestJson = await latestRes.json()
        const historyJson = await historyRes.json()
        const alertsJson = await alertsRes.json()

        setData(latestJson)
        setHistory(Array.isArray(historyJson) ? historyJson : [])
        setAlerts(Array.isArray(alertsJson) ? alertsJson : [])
      } catch (error) {
        console.error("Error loading radar data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadRadar()
  }, [])

  const levelStyles = useMemo(() => {
    return {
      LOW: "bg-slate-600/80 text-slate-100 border-slate-500/40",
      MEDIUM: "bg-yellow-500/80 text-slate-950 border-yellow-400/50",
      HIGH: "bg-orange-500/80 text-slate-950 border-orange-400/50",
      "VERY HIGH": "bg-red-600/90 text-white border-red-400/50",
    } as Record<string, string>
  }, [])

  const scoreBarClass = useMemo(() => {
    if (!data) return "bg-cyan-400"
    if (data.level === "VERY HIGH") return "bg-red-500"
    if (data.level === "HIGH") return "bg-orange-400"
    if (data.level === "MEDIUM") return "bg-yellow-400"
    return "bg-cyan-400"
  }, [data])

  const chartData = useMemo(() => {
    const items = [...history].slice(0, 5).reverse()

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

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <h1 className="text-4xl font-bold tracking-tight">🚀 Pond0x Launch Radar</h1>
          <div className="mt-8 animate-pulse space-y-4">
            <div className="h-6 w-72 rounded bg-white/10" />
            <div className="h-6 w-40 rounded bg-white/10" />
            <div className="h-6 w-56 rounded bg-white/10" />
            <div className="h-6 w-60 rounded bg-white/10" />
            <div className="h-4 w-full rounded bg-white/10" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            🚀 Pond0x Launch Radar
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-400 sm:text-base">
            Frontend change radar for detecting launch signals, activation clues, and unusual
            UI movement across Pond0x surfaces.
          </p>
        </header>

        {data?.alert && (
          <div className="mb-8 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-300 shadow-lg shadow-red-950/20">
            <div className="text-sm font-medium uppercase tracking-wide">Alert</div>
            <div className="mt-1 text-lg font-semibold">{data.alert}</div>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-black/40">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm text-slate-400">Snapshot</div>
                <div className="mt-2 text-xl font-semibold break-all">{data?.id || "..."}</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm text-slate-400">Score</div>
                <div className="mt-2 text-3xl font-bold">{data?.score ?? 0}</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm text-slate-400">Total archivos</div>
                <div className="mt-2 text-2xl font-semibold">{data?.totalFiles ?? 0}</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm text-slate-400">Archivos nuevos</div>
                <div className="mt-2 text-2xl font-semibold">
                  {data?.added ?? 0}
                  <span className="ml-2 text-sm text-cyan-300">({data?.addedPct ?? 0}%)</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm text-slate-400">Archivos modificados</div>
                <div className="mt-2 text-2xl font-semibold">
                  {data?.changed ?? 0}
                  <span className="ml-2 text-sm text-yellow-300">
                    ({data?.changedPct ?? 0}%)
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm text-slate-400">Movimiento total</div>
                <div className="mt-2 text-2xl font-semibold">
                  {data?.movementCount ?? 0}
                  <span className="ml-2 text-sm text-emerald-300">
                    ({data?.movementPct ?? 0}%)
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <span
                className={`inline-flex rounded-md border px-4 py-2 text-sm font-semibold ${
                  levelStyles[data?.level || "LOW"] || "bg-slate-700 text-white border-slate-500/40"
                }`}
              >
                {data?.level || "LOW"}
              </span>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                  <span>Radar intensity</span>
                  <span>{data?.score ?? 0}/100</span>
                </div>

                <div className="h-4 w-full rounded-full bg-white/10">
                  <div
                    className={`h-4 rounded-full transition-all duration-700 ${scoreBarClass}`}
                    style={{ width: `${data?.score ?? 0}%` }}
                  />
                </div>

                <div className="mt-6 grid gap-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                      <span>Added %</span>
                      <span>{data?.addedPct ?? 0}%</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-white/10">
                      <div
                        className="h-3 rounded-full bg-cyan-400 transition-all duration-700"
                        style={{ width: `${data?.addedPct ?? 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                      <span>Changed %</span>
                      <span>{data?.changedPct ?? 0}%</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-white/10">
                      <div
                        className="h-3 rounded-full bg-yellow-400 transition-all duration-700"
                        style={{ width: `${data?.changedPct ?? 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                      <span>Total movement %</span>
                      <span>{data?.movementPct ?? 0}%</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-white/10">
                      <div
                        className="h-3 rounded-full bg-emerald-400 transition-all duration-700"
                        style={{ width: `${data?.movementPct ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-bold">Signals</h2>

              {data?.signals?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.signals.map((signal) => (
                    <span
                      key={signal}
                      className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-slate-500">No signal keywords detected.</p>
              )}
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-bold">Resumen ejecutivo</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">{data?.summary || "..."}</p>

              <div className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                <div className="text-sm font-medium text-cyan-300">AI Insight</div>
                <div className="mt-2 font-semibold text-white">
                  {data?.insight || "No insight"}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Confidence: {data?.confidence ? `${Math.round(data.confidence * 100)}%` : "0%"}
                </div>

                {!!data?.tags?.length && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <h3 className="mt-6 text-xl font-semibold text-white">Lectura</h3>
              <p className="mt-3 text-base leading-7 text-slate-400">{data?.note || "..."}</p>
            </div>

            <div className="mt-8 text-sm text-slate-500">
              Generado: {formatDate(data?.generatedAt)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">History</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                últimos 5
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {history.length > 0 ? (
                history.slice(0, 5).map((item) => (
                  <div
                    key={`${item.id}-${item.generatedAt}`}
                    className="rounded-xl border border-white/10 bg-black/40 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-white break-all">{item.id}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDate(item.generatedAt)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-white/5 px-2 py-1 text-sm font-semibold text-cyan-300">
                          {item.score}
                        </span>
                        <span
                          className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                            levelStyles[item.level] ||
                            "bg-slate-700 text-white border-slate-500/40"
                          }`}
                        >
                          {item.level}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-white/10">
                        <div
                          className={`h-2 rounded-full ${
                            item.level === "VERY HIGH"
                              ? "bg-red-500"
                              : item.level === "HIGH"
                              ? "bg-orange-400"
                              : item.level === "MEDIUM"
                              ? "bg-yellow-400"
                              : "bg-cyan-400"
                          }`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-400">
                      <div>
                        Nuevos: {item.added}{" "}
                        <span className="text-cyan-300">({item.addedPct ?? 0}%)</span>
                      </div>
                      <div>
                        Modificados: {item.changed}{" "}
                        <span className="text-yellow-300">({item.changedPct ?? 0}%)</span>
                      </div>
                      <div className="col-span-2">
                        Movimiento: {item.movementCount ?? item.added + item.changed}{" "}
                        <span className="text-emerald-300">({item.movementPct ?? 0}%)</span>
                      </div>
                    </div>

                    {!!item.signals?.length && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.signals.slice(0, 6).map((signal) => (
                          <span
                            key={`${item.id}-${signal}`}
                            className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/30 p-5 text-sm text-slate-500">
                  No history available yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <div className="text-sm text-slate-400">Current status</div>
            <div className="mt-3 text-lg font-semibold text-white">
              {data?.level === "VERY HIGH"
                ? "Immediate attention recommended"
                : data?.level === "HIGH"
                ? "Strong movement detected"
                : data?.level === "MEDIUM"
                ? "Visible dev activity"
                : "Quiet surface for now"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <div className="text-sm text-slate-400">Signal count</div>
            <div className="mt-3 text-3xl font-bold text-cyan-300">
              {data?.signals?.length ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <div className="text-sm text-slate-400">Trend</div>
            <div className="mt-3 text-2xl font-bold text-white">
              {data?.trendDirection === "UP"
                ? `↑ +${data?.trend ?? 0}%`
                : data?.trendDirection === "DOWN"
                ? `↓ ${data?.trend ?? 0}%`
                : `${data?.trend ?? 0}%`}
            </div>
            <div className="mt-1 text-xs text-slate-500">vs previous run</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <div className="text-sm text-slate-400">Generated</div>
            <div className="mt-3 text-sm font-medium text-white">
              {formatDate(data?.generatedAt)}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Trend Graph</h2>
              <p className="mt-1 text-sm text-slate-400">
                Score vs movement percentage across the latest runs
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
                Score
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Movement %
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4">
            {chartData.length > 0 ? (
              <>
                <div className="relative h-56 w-full">
                  <svg
                    viewBox="0 0 100 50"
                    preserveAspectRatio="none"
                    className="h-full w-full overflow-visible"
                  >
                    <line x1="0" y1="40" x2="100" y2="40" stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
                    <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
                    <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
                    <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
                    <line x1="0" y1="0" x2="100" y2="0" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />

                    {scorePoints && (
                      <polyline
                        fill="none"
                        stroke="rgb(34, 211, 238)"
                        strokeWidth="1.4"
                        points={scorePoints}
                      />
                    )}

                    {movementPoints && (
                      <polyline
                        fill="none"
                        stroke="rgb(52, 211, 153)"
                        strokeWidth="1.4"
                        points={movementPoints}
                      />
                    )}

                    {chartData.map((point, index) => {
                      const x = chartData.length === 1 ? 50 : (index / (chartData.length - 1)) * 100
                      const scoreY = 40 - (point.score / 100) * 40
                      const movementY = 40 - (point.movement / 100) * 40

                      return (
                        <g key={`${point.label}-${index}`}>
                          <circle cx={x} cy={scoreY} r="1.4" fill="rgb(34, 211, 238)" />
                          <circle cx={x} cy={movementY} r="1.4" fill="rgb(52, 211, 153)" />
                        </g>
                      )
                    })}
                  </svg>
                </div>

                <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs text-slate-500">
                  {chartData.map((point, index) => (
                    <div key={`${point.label}-${index}`} className="truncate">
                      {point.label}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/30 p-5 text-sm text-slate-500">
                No chart data available yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold text-white">🚨 Recent Alerts</h2>

          {alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/30 p-5 text-sm text-slate-500">
              No alerts yet.
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert, i) => (
                <div
                  key={`${alert.id}-${alert.sentAt}-${i}`}
                  className="rounded-xl border border-white/10 bg-zinc-950 p-4"
                >
                  <div className="flex flex-wrap justify-between gap-3 text-sm">
                    <span
                      className={`rounded-md border px-2 py-1 font-bold ${
                        levelStyles[alert.level] ||
                        "bg-slate-700 text-white border-slate-500/40"
                      }`}
                    >
                      {alert.level}
                    </span>
                    <span className="text-slate-400">{formatDate(alert.sentAt)}</span>
                  </div>

                  <div className="mt-2 text-xs text-slate-400">
                    Score: {alert.score} | Movement: {alert.movementPct}% | Trend:{" "}
                    {alert.trendDirection === "UP"
                      ? `↑ +${alert.trend}%`
                      : alert.trendDirection === "DOWN"
                      ? `↓ ${alert.trend}%`
                      : `${alert.trend}%`}
                  </div>

                  <div className="mt-3 text-sm text-slate-300">{alert.summary}</div>

                  <div className="mt-3 text-xs text-slate-500">
                    Signals: {alert.signals?.join(", ") || "none"}
                  </div>

                  {!!alert.tags?.length && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {alert.tags.map((tag, tagIndex) => (
                        <span
                          key={`${tag}-${tagIndex}`}
                          className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}