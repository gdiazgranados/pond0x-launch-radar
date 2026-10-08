/** Strict UTC timestamp accepted by the simulation engine and snapshot loader. */
export function isCanonicalUtcTimestamp(value: string): boolean {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return false
  }
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return false
  const normalized = new Date(milliseconds).toISOString()
  const [dateTime, fraction = ""] = value.slice(0, -1).split(".")
  const expected = dateTime + "." + fraction.padEnd(3, "0") + "Z"
  return normalized === expected
}
