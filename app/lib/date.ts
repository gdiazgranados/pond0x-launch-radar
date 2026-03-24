export function formatDate(date?: string) {
  if (!date) return "—"
  return new Date(date).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  })
}

export function shortTime(date?: string) {
  if (!date) return "—"
  return new Date(date).toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City",
  })
}

export function minutesSince(dateString?: string) {
  if (!dateString) return null

  const ts = new Date(dateString).getTime()
  if (Number.isNaN(ts)) return null

  const diffMs = Date.now() - ts
  return Math.max(0, Math.floor(diffMs / 60000))
}

export function formatRelativeMinutes(dateString?: string) {
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