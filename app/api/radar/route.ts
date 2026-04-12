import { NextResponse } from "next/server"

const RADAR_DATA_BASE =
  process.env.NEXT_PUBLIC_RADAR_DATA_BASE ||
  "https://raw.githubusercontent.com/gdiazgranados/pond0x-launch-radar/radar-data/data"

function remoteJsonUrl(file: string) {
  const clean = file.replace(/^\/+/, "")
  return `${RADAR_DATA_BASE}/${clean}?t=${Date.now()}`
}

async function loadRemoteJson(file: string) {
  try {
    const res = await fetch(remoteJsonUrl(file), {
      cache: "no-store",
    })

    if (!res.ok) {
      throw new Error(`${file} failed (${res.status})`)
    }

    return await res.json()
  } catch (err) {
    console.error(`Error loading ${file}:`, err)
    return null
  }
}

function clampPercent(value: number) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100))
}

function normalizeScoreToPercent(rawScore: number) {
  const n = Number(rawScore || 0)
  if (!Number.isFinite(n) || n <= 0) return 0

  const normalized = Math.log10(n + 1) * 50
  return clampPercent(normalized)
}

function classifyIntensity(rawScore: number) {
  const n = Number(rawScore || 0)

  if (n >= 100) return "EXTREME"
  if (n >= 70) return "VERY HIGH"
  if (n >= 40) return "HIGH"
  if (n >= 15) return "MEDIUM"
  return "LOW"
}

export async function GET() {
  try {
    const [latest, history, heartbeat, sentinelState, sentinelEvents] =
      await Promise.all([
        loadRemoteJson("latest.json"),
        loadRemoteJson("history.json"),
        loadRemoteJson("heartbeat.json"),
        loadRemoteJson("sentinel-state.json"),
        loadRemoteJson("sentinel-events.json"),
      ])

    const normalizedLatest = latest
      ? {
          ...latest,
          rawScore: Number(latest.rawScore ?? latest.score ?? 0),
          scorePercent: normalizeScoreToPercent(
            Number(latest.rawScore ?? latest.score ?? 0)
          ),
          movementPercent: clampPercent(Number(latest.movementPct ?? 0)),
          addedPercent: clampPercent(Number(latest.addedPct ?? 0)),
          changedPercent: clampPercent(Number(latest.changedPct ?? 0)),
          activationProbability: clampPercent(
            Number(latest.activationProbability ?? 0)
          ),
          intensityClass: classifyIntensity(
            Number(latest.rawScore ?? latest.score ?? 0)
          ),
          overdrive: Number(latest.rawScore ?? latest.score ?? 0) > 100,
        }
      : null

    return NextResponse.json({
      latest: normalizedLatest,
      history,
      heartbeat,
      sentinelState,
      sentinelEvents,
      source: "remote-radar-data",
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error("Radar API error:", err)

    return NextResponse.json(
      {
        error: "Radar API failed",
        details: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    )
  }
}