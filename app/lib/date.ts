const MEXICO_CITY_TIMEZONE = "America/Mexico_City"

function parseValidDate(value?: string | null) {
  if (!value) return null

  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null

  return dt
}

export function formatDate(date?: string | null) {
  const dt = parseValidDate(date)
  if (!dt) return "—"

  return dt.toLocaleString("es-MX", {
    timeZone: MEXICO_CITY_TIMEZONE,
  })
}

export function shortTime(date?: string | null) {
  const dt = parseValidDate(date)
  if (!dt) return "—"

  return dt.toLocaleTimeString("es-MX", {
    timeZone: MEXICO_CITY_TIMEZONE,
  })
}

export function minutesSince(dateString?: string | null) {
  const dt = parseValidDate(dateString)
  if (!dt) return null

  const diffMs = Date.now() - dt.getTime()
  if (diffMs <= 0) return 0

  return Math.floor(diffMs / 60000)
}

export function formatRelativeMinutes(dateString?: string | null) {
  const mins = minutesSince(dateString)
  if (mins === null) return "unknown"

  if (mins < 1) return "just now"
  if (mins === 1) return "1 min ago"
  if (mins < 60) return `${mins} min ago`

  const hours = Math.floor(mins / 60)
  const remaining = mins % 60

  if (remaining === 0) {
    return hours === 1 ? "1h ago" : `${hours}h ago`
  }

  return `${hours}h ${remaining}m ago`
}