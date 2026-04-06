import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

const OWNER = "gdiazgranados"
const REPO = "pond0x-launch-radar"
const BRANCH = "radar-data"

function getSafeTime(value?: string | null) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

async function fetchGitHubFile(filePath: string) {
  const token = process.env.GITHUB_TOKEN
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${filePath}`

  const res = await fetch(url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${res.status}`)
  }

  return res.json()
}

async function readLocalJson(filePath: string) {
  const absolutePath = path.join(process.cwd(), filePath)
  const raw = await fs.readFile(absolutePath, "utf-8")
  return JSON.parse(raw)
}

async function readLocalJsonWithFallback(primaryPath: string, fallbackPath: string) {
  try {
    return await readLocalJson(primaryPath)
  } catch {
    return readLocalJson(fallbackPath)
  }
}

async function loadJson(devPrimaryPath: string, devFallbackPath: string, prodPath: string) {
  if (process.env.NODE_ENV === "development") {
    return readLocalJsonWithFallback(devPrimaryPath, devFallbackPath)
  }
  return fetchGitHubFile(prodPath)
}

function normalizeLatest(json: any) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null
  return json
}

function normalizeHistory(json: any) {
  const raw = Array.isArray(json)
    ? json
    : Array.isArray(json?.history)
      ? json.history
      : Array.isArray(json?.historyData)
        ? json.historyData
        : []

  return [...raw].sort((a, b) => getSafeTime(b?.generatedAt) - getSafeTime(a?.generatedAt))
}

function normalizeHeartbeat(json: any) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null

  const heartbeat = json?.heartbeatData ?? json?.heartbeat ?? json

  return {
    source: heartbeat?.source || "github-actions",
    lastRunAt: heartbeat?.lastRunAt || null,
    lastSuccessAt: heartbeat?.lastSuccessAt || null,
    status: heartbeat?.status || "unknown",
    scheduleMinutes: Number(heartbeat?.scheduleMinutes ?? 60),
  }
}

function normalizeSentinelEvents(json: any) {
  const raw = Array.isArray(json)
    ? json
    : Array.isArray(json?.sentinelEvents)
      ? json.sentinelEvents
      : []

  return [...raw].sort((a, b) => {
    const aTs = getSafeTime(a?.checkedAt || a?.generatedAt || a?.sentAt || a?.triggeredAt)
    const bTs = getSafeTime(b?.checkedAt || b?.generatedAt || b?.sentAt || b?.triggeredAt)
    return bTs - aTs
  })
}

function buildSyncMeta({
  latest,
  history,
  heartbeat,
  sentinelEvents,
}: {
  latest: any
  history: any[]
  heartbeat: any
  sentinelEvents: any[]
}) {
  const latestGeneratedAt = latest?.generatedAt || null
  const historyLatestAt = history?.[0]?.generatedAt || null
  const heartbeatAt = heartbeat?.lastSuccessAt || heartbeat?.lastRunAt || null
  const sentinelLatestAt =
    sentinelEvents?.[0]?.checkedAt ||
    sentinelEvents?.[0]?.generatedAt ||
    sentinelEvents?.[0]?.sentAt ||
    sentinelEvents?.[0]?.triggeredAt ||
    null

  const timestamps = [
    getSafeTime(latestGeneratedAt),
    getSafeTime(historyLatestAt),
    getSafeTime(heartbeatAt),
    getSafeTime(sentinelLatestAt),
  ].filter((ts) => ts > 0)

  const maxTs = timestamps.length ? Math.max(...timestamps) : 0
  const minTs = timestamps.length ? Math.min(...timestamps) : 0
  const driftMs = timestamps.length ? maxTs - minTs : 0

  return {
    latestGeneratedAt,
    historyLatestAt,
    heartbeatAt,
    sentinelLatestAt,
    isSynchronized: driftMs <= 5 * 60 * 1000,
    driftMs,
  }
}

export async function GET() {
  try {
    const [latestRaw, historyRaw, heartbeatRaw, sentinelStateRaw, sentinelEventsRaw] =
      await Promise.all([
        loadJson(
          "public/data/latest.json",
          "watcher/output/latest.json",
          "public/data/latest.json"
        ),
        loadJson(
          "public/data/history.json",
          "watcher/output/history.json",
          "public/data/history.json"
        ),
        loadJson(
          "public/data/heartbeat.json",
          "public/data/heartbeat.json",
          "public/data/heartbeat.json"
        ),
        loadJson(
          "public/data/sentinel-state.json",
          "watcher/output/sentinel-state.json",
          "public/data/sentinel-state.json"
        ),
        loadJson(
          "public/data/sentinel-events.json",
          "watcher/output/sentinel-events.json",
          "public/data/sentinel-events.json"
        ),
      ])

    const latest = normalizeLatest(latestRaw)
    const history = normalizeHistory(historyRaw)
    const heartbeatData = normalizeHeartbeat(heartbeatRaw)
    const sentinelEvents = normalizeSentinelEvents(sentinelEventsRaw)
    const sentinelState =
      sentinelStateRaw && typeof sentinelStateRaw === "object" && !Array.isArray(sentinelStateRaw)
        ? sentinelStateRaw
        : null

    const meta = buildSyncMeta({
      latest,
      history,
      heartbeat: heartbeatData,
      sentinelEvents,
    })

    return NextResponse.json(
      {
        data: latest,
        history,
        heartbeatData,
        sentinelState,
        sentinelEvents,
        meta,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Failed to load radar data",
      },
      { status: 500 }
    )
  }
}