import { NextResponse } from "next/server"

const OWNER = "gdiazgranados"
const REPO = "pond0x-launch-radar"
const BRANCH = "radar-data"

async function fetchGitHubFile(path: string) {
  const token = process.env.GITHUB_TOKEN
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`

  const res = await fetch(url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status}`)
  }

  return res.json()
}

export async function GET() {
  try {
    const [latest, history, heartbeat, sentinelState, sentinelEvents] =
      await Promise.all([
        fetchGitHubFile("public/data/latest.json"),
        fetchGitHubFile("public/data/history.json"),
        fetchGitHubFile("public/data/heartbeat.json"),
        fetchGitHubFile("public/data/sentinel-state.json"),
        fetchGitHubFile("public/data/sentinel-events.json"),
      ])

    return NextResponse.json(
      {
        data: latest,
        history,
        heartbeatData: heartbeat,
        sentinelState,
        sentinelEvents,
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