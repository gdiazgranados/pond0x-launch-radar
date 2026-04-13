"use client"

import { useCallback, useEffect, useState } from "react"
import type { SentinelEvent } from "../types/radar"

function apiRadarUrl(cacheBust: number) {
  return `/api/radar?ts=${cacheBust}`
}

function getSafeTime(value?: string | null) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function normalizeSentinelEvent(event: SentinelEvent): SentinelEvent {
  return {
    ...event,
    id: event.id || undefined,
    checkedAt: event.checkedAt || undefined,
    triggeredAt: event.triggeredAt || undefined,
    generatedAt: event.generatedAt || undefined,
    sentAt: event.sentAt || undefined,
    surface: event.surface || undefined,
    surfaces: Array.isArray(event.surfaces) ? event.surfaces : [],
    changedSurfaces: Array.isArray(event.changedSurfaces) ? event.changedSurfaces : [],
    keywordTriggers: Array.isArray(event.keywordTriggers) ? event.keywordTriggers : [],
    maxPriority: Number(event.maxPriority ?? 0),
    threshold: event.threshold || {},
    status: Number(event.status ?? 0),
    finalUrl: event.finalUrl || undefined,
    changed: Boolean(event.changed),
    triggerReason: event.triggerReason || "",
    triggerThreshold: event.triggerThreshold || "",
    summary: event.summary || "",
    level: event.level || "LOW",
    signalType: event.signalType || "SCANNING",
    probability: event.probability || "STANDBY",
    reason: event.reason || "",
  }
}

function sortSentinelEvents(items: SentinelEvent[]) {
  return [...items].sort((a, b) => {
    const aTs = getSafeTime(a.checkedAt || a.generatedAt || a.sentAt || a.triggeredAt)
    const bTs = getSafeTime(b.checkedAt || b.generatedAt || b.sentAt || b.triggeredAt)
    return bTs - aTs
  })
}

export function useSentinelData() {
  const [events, setEvents] = useState<SentinelEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSentinel = useCallback(async (signal?: AbortSignal) => {
    try {
      const cacheBust = Math.floor(Date.now() / 10000)
      const res = await fetch(apiRadarUrl(cacheBust), {
        cache: "no-store",
        signal,
      })

      if (!res.ok) {
        throw new Error(`Failed to load sentinel-events.json (${res.status})`)
      }

      const json = await res.json()

      const rawEvents: SentinelEvent[] = Array.isArray(json?.sentinelEvents)
        ? json.sentinelEvents
        : []

      const normalizedEvents = sortSentinelEvents(
        rawEvents.filter(Boolean).map(normalizeSentinelEvent)
      )

      setEvents(normalizedEvents)
      setError(null)
    } catch (err) {
      if (signal?.aborted) return
      console.error("Error loading sentinel data:", err)
      setError(err instanceof Error ? err.message : "Unknown sentinel error")
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function fetchData(signal?: AbortSignal) {
      if (!isMounted) return
      await loadSentinel(signal)
    }

    const initialController = new AbortController()
    fetchData(initialController.signal)

    const fetchInterval = setInterval(() => {
      const intervalController = new AbortController()
      fetchData(intervalController.signal)
    }, 60_000)

    return () => {
      isMounted = false
      initialController.abort()
      clearInterval(fetchInterval)
    }
  }, [loadSentinel])

  return {
    events,
    latestEvent: events[0] || null,
    loading,
    error,
  }
}