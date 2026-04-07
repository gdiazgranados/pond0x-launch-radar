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

    return NextResponse.json({
      latest,
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