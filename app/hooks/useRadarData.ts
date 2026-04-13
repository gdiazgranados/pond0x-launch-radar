"use client"

import { useCallback, useEffect, useState } from "react"
import type {
  RadarData,
  AlertItem,
  HeartbeatData,
  RadarApiSyncMeta,
} from "../types/radar"

type RadarApiResponse = {
  data?: RadarData | null
  latest?: RadarData | null
  latestData?: RadarData | null
  history?: RadarData[]
  historyData?: RadarData[]
  alerts?: AlertItem[]
  sentinelEvents?: AlertItem[]
  alertsHistory?: AlertItem[]
  heartbeatData?: HeartbeatData | null
  heartbeat?: HeartbeatData | null
  meta?: RadarApiSyncMeta
}

function apiRadarUrl(cacheBust: number) {
  return `/api/radar?ts=${cacheBust}`
}

function getSafeTime(value?: string | null) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function normalizeRadarItem(item: RadarData): RadarData {
  return {
    ...item,
    id: item.id || "unknown-snapshot",
    totalFiles: Number(item.totalFiles ?? 0),
    added: Number(item.added ?? 0),
    changed: Number(item.changed ?? 0),
    movementCount: Number(item.movementCount ?? 0),

    movementPct: Number(item.movementPct ?? 0),
    movementPercent: Number(item.movementPercent ?? item.movementPct ?? 0),

    addedPct: Number(item.addedPct ?? 0),
    addedPercent: Number(item.addedPercent ?? item.addedPct ?? 0),

    changedPct: Number(item.changedPct ?? 0),
    changedPercent: Number(item.changedPercent ?? item.changedPct ?? 0),

    patternScore: Number(item.patternScore ?? 0),
    activationProbability: Number(item.activationProbability ?? 0),

    score: Number(item.score ?? 0),
    scorePercent: Number(item.scorePercent ?? 0),
    rawScore: Number(item.rawScore ?? item.score ?? 0),

    rarityScore: Number(item.rarityScore ?? 0),
    confidence: Number(item.confidence ?? 0),

    intensityClass: item.intensityClass || undefined,
    overdrive: Boolean(item.overdrive),

    signals: Array.isArray(item.signals) ? item.signals : [],
    patterns: Array.isArray(item.patterns) ? item.patterns : [],
    focusAreas: Array.isArray(item.focusAreas) ? item.focusAreas : [],
    sensitiveHits: Array.isArray(item.sensitiveHits) ? item.sensitiveHits : [],
    changeTypes: Array.isArray(item.changeTypes) ? item.changeTypes : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    changedFiles: Array.isArray(item.changedFiles) ? item.changedFiles : [],
    generatedAt: item.generatedAt || "",
    insight: item.insight || "",
    summary: item.summary || "",
    note: item.note || "",
    significance: item.significance || "",
    level: item.level || "LOW",
  }
}

function normalizeAlertItem(item: AlertItem): AlertItem {
  return {
    ...item,
    id: item.id || undefined,
    sentAt: item.sentAt || undefined,
    generatedAt: item.generatedAt || undefined,

    score: Number(item.score ?? 0),
    rawScore: Number(item.rawScore ?? item.score ?? 0),
    scorePercent: Number(item.scorePercent ?? item.score ?? 0),

    trend: Number(item.trend ?? 0),

    movementPct: Number(item.movementPct ?? 0),
    movementPercent: Number(item.movementPercent ?? item.movementPct ?? 0),

    level: item.level || "LOW",
    tags: Array.isArray(item.tags) ? item.tags : [],
    patterns: Array.isArray(item.patterns) ? item.patterns : [],
    summary: item.summary || "",
    insight: item.insight || "",
    focusAreas: Array.isArray(item.focusAreas) ? item.focusAreas : [],
    signals: Array.isArray(item.signals) ? item.signals : [],
  }
}

function normalizeHeartbeatData(item: HeartbeatData | null): HeartbeatData | null {
  if (!item) return null

  return {
    source: item.source || "github-actions",
    lastRunAt: item.lastRunAt || null,
    lastSuccessAt: item.lastSuccessAt || null,
    status: item.status || "unknown",
    scheduleMinutes: Number(item.scheduleMinutes ?? 60),
  }
}

function sortRadarHistory(items: RadarData[]) {
  return [...items].sort((a, b) => getSafeTime(b.generatedAt) - getSafeTime(a.generatedAt))
}

function sortAlerts(items: AlertItem[]) {
  return [...items].sort((a, b) => {
    const aTs = getSafeTime(a.sentAt || a.generatedAt)
    const bTs = getSafeTime(b.sentAt || b.generatedAt)
    return bTs - aTs
  })
}

export function useRadarData() {
  const [data, setData] = useState<RadarData | null>(null)
  const [history, setHistory] = useState<RadarData[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [heartbeatData, setHeartbeatData] = useState<HeartbeatData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<RadarApiSyncMeta | null>(null)

  const loadRemoteRadar = useCallback(async (signal?: AbortSignal) => {
    const cacheBust = Math.floor(Date.now() / 10000)

    const res = await fetch(apiRadarUrl(cacheBust), {
      cache: "no-store",
      signal,
    })

    if (!res.ok) {
      throw new Error(`Radar API failed: ${res.status}`)
    }

    const json: RadarApiResponse = await res.json()

    const rawData = json?.data ?? json?.latest ?? json?.latestData ?? null

    const rawHistory = Array.isArray(json?.history)
      ? json.history
      : Array.isArray(json?.historyData)
        ? json.historyData
        : []

    const rawHeartbeat = json?.heartbeatData ?? json?.heartbeat ?? null

    const rawAlerts = Array.isArray(json?.alerts)
      ? json.alerts
      : Array.isArray(json?.sentinelEvents)
        ? json.sentinelEvents
        : Array.isArray(json?.alertsHistory)
          ? json.alertsHistory
          : []

    const normalizedData = rawData ?? null

    const normalizedHistory = sortRadarHistory(
      rawHistory.filter((item): item is RadarData => !!item)
    )

    const normalizedAlerts = sortAlerts(
      rawAlerts.filter((item): item is AlertItem => !!item).map(normalizeAlertItem)
    )

    const normalizedHeartbeat = normalizeHeartbeatData(rawHeartbeat)

    setData(normalizedData)
    setHistory(normalizedHistory)
    setHeartbeatData(normalizedHeartbeat)
    setAlerts(normalizedAlerts)
    setMeta(json?.meta || null)
  }, [])

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setError(null)
        await loadRemoteRadar(signal)
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Error loading radar data:", error)
          setError("No se pudieron cargar los datos del radar")
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [loadRemoteRadar]
  )

  useEffect(() => {
    let isMounted = true

    async function fetchData(signal?: AbortSignal) {
      if (!isMounted) return
      await refresh(signal)
    }

    const initialController = new AbortController()
    fetchData(initialController.signal)

    const fetchInterval = setInterval(() => {
      if (document.visibilityState !== "visible") return

      const intervalController = new AbortController()
      fetchData(intervalController.signal)
    }, 60_000)

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        const controller = new AbortController()
        fetchData(controller.signal)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      isMounted = false
      initialController.abort()
      clearInterval(fetchInterval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [refresh])

  return {
    data,
    history,
    alerts,
    loading,
    heartbeatData,
    error,
    meta,
    refresh,
  }
}