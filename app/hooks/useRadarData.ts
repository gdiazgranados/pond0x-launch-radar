"use client"

import { useCallback, useEffect, useState } from "react"
import type { RadarData, AlertItem, HeartbeatData } from "../types/radar"

function remoteJsonUrl(filename: string, cacheBust: number) {
  return `/data/${filename}?t=${cacheBust}`
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

    const [latestRes, historyRes, alertsRes, heartbeatRes] = await Promise.all([
      fetch(remoteJsonUrl("latest.json", cacheBust), { cache: "no-store", signal }),
      fetch(remoteJsonUrl("history.json", cacheBust), { cache: "no-store", signal }),
      fetch(remoteJsonUrl("alerts-history.json", cacheBust), { cache: "no-store", signal }),
      fetch(remoteJsonUrl("heartbeat.json", cacheBust), { cache: "no-store", signal }),
    ])

    if (!latestRes.ok || !historyRes.ok || !alertsRes.ok || !heartbeatRes.ok) {
      throw new Error("Failed to load one or more remote radar resources")
    }

    const [latestJson, historyJson, alertsJson, heartbeatJson] = await Promise.all([
      latestRes.json(),
      historyRes.json(),
      alertsRes.json(),
      heartbeatRes.json(),
    ])

    setData(latestJson)
    setHistory(Array.isArray(historyJson) ? historyJson : [])
    setAlerts(Array.isArray(alertsJson) ? alertsJson : [])
    setHeartbeatData({ ...heartbeatJson })
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