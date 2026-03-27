"use client"

import { useEffect, useState } from "react"

export function useRadarData() {
  const [data, setData] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [heartbeatData, setHeartbeatData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const res = await fetch(`/api/radar?ts=${Date.now()}`, {
          cache: "no-store",
        })

        if (!res.ok) {
          throw new Error(`Radar API failed: ${res.status}`)
        }

        const json = await res.json()

        if (!mounted) return

        setData(json.data ?? null)
        setHistory(Array.isArray(json.history) ? json.history : [])
        setHeartbeatData(json.heartbeatData ?? null)
        setAlerts(Array.isArray(json.sentinelEvents) ? json.sentinelEvents : [])
      } catch (error) {
        console.error("Failed to load radar data:", error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 60_000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return { data, history, alerts, loading, heartbeatData }
}