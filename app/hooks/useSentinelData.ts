"use client"

import { useCallback, useEffect, useState } from "react"
import type { SentinelEvent } from "../types/radar"

function remoteJsonUrl(filename: string, cacheBust: number) {
  return `/data/${filename}?t=${cacheBust}`
}

export function useSentinelData() {
  const [events, setEvents] = useState<SentinelEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSentinel = useCallback(async (signal?: AbortSignal) => {
    try {
      const cacheBust = Date.now()
      const res = await fetch(remoteJsonUrl("sentinel-events.json", cacheBust), {
        cache: "no-store",
        signal,
      })

      if (!res.ok) {
        throw new Error(`Failed to load sentinel-events.json (${res.status})`)
      }

      const json = await res.json()
      setEvents(Array.isArray(json) ? json : [])
      setError(null)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : "Unknown sentinel error")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadSentinel(controller.signal)
    return () => controller.abort()
  }, [loadSentinel])

  return {
    events,
    latestEvent: events[0] || null,
    loading,
    error,
  }
}