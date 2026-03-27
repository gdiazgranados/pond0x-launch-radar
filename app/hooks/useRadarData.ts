"use client"

import { useCallback, useEffect, useState } from "react"
import type { RadarData, AlertItem, HeartbeatData } from "../types/radar"

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
}

function apiRadarUrl(cacheBust: number) {
  return `/api/radar?ts=${cacheBust}`
}

export function useRadarData() {
  const [data, setData] = useState<RadarData | null>(null)
  const [history, setHistory] = useState<RadarData[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [heartbeatData, setHeartbeatData] = useState<HeartbeatData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRemoteRadar = useCallback(async (signal?: AbortSignal) => {
    const cacheBust = Date.now()

    const res = await fetch(apiRadarUrl(cacheBust), {
      cache: "no-store",
      signal,
    })

    if (!res.ok) {
      throw new Error(`Radar API failed: ${res.status}`)
    }

    const json: RadarApiResponse = await res.json()

    const nextData =
      json?.data ??
      json?.latest ??
      json?.latestData ??
      null

    const nextHistory =
      Array.isArray(json?.history)
        ? json.history
        : Array.isArray(json?.historyData)
        ? json.historyData
        : []

    const nextHeartbeat =
      json?.heartbeatData ??
      json?.heartbeat ??
      null

    const nextAlerts =
      Array.isArray(json?.alerts)
        ? json.alerts
        : Array.isArray(json?.sentinelEvents)
        ? json.sentinelEvents
        : Array.isArray(json?.alertsHistory)
        ? json.alertsHistory
        : []

    setData(nextData)
    setHistory(nextHistory)
    setHeartbeatData(nextHeartbeat)
    setAlerts(nextAlerts)
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
        setLoading(false)
      }
    },
    [loadRemoteRadar]
  )

  useEffect(() => {
    const controller = new AbortController()
    let isMounted = true

    async function fetchData() {
      if (!isMounted) return
      await refresh(controller.signal)
    }

    fetchData()

    const fetchInterval = setInterval(() => {
      fetchData()
    }, 60_000)

    return () => {
      isMounted = false
      controller.abort()
      clearInterval(fetchInterval)
    }
  }, [refresh])

  return {
    data,
    history,
    alerts,
    loading,
    heartbeatData,
    error,
    refresh,
  }
}