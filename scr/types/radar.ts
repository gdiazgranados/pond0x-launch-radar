export type RadarData = {
  id: string
  totalFiles: number
  added: number
  changed: number
  movementCount: number
  movementPct: number
  addedPct: number
  changedPct: number
  signals: string[]
  score: number
  level: "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" | string
  insight?: string
  confidence?: number
  tags?: string[]
  alert?: string | null
  summary: string
  note: string
  trend?: number
  trendDirection?: "UP" | "DOWN" | "FLAT" | string
  generatedAt: string
}

export type AlertItem = {
  id: string
  level: string
  score: number
  movementPct: number
  trend: number
  trendDirection: string
  signals: string[]
  tags: string[]
  insight: string
  summary: string
  sentAt: string
}

export type HeartbeatData = {
  source: string
  lastRunAt: string | null
  lastSuccessAt: string | null
  status: "unknown" | "running" | "success" | "failed" | string
  scheduleMinutes: number
}