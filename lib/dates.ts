/** Local-calendar YYYY-MM-DD — trip dates are plain calendar strings, so
 *  comparisons must never mix UTC parse of "YYYY-MM-DD" with a UTC-shifted
 *  Date. Parse both sides through this formatter (Date.parse of YYYY-MM-DD is
 *  UTC midnight, which lines up consistently on both sides). */
export function localDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole days between two YYYY-MM-DD calendar dates (b - a). */
export function calendarDayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

/** Human "x min/hours/days ago" for saved-copy timestamps. */
export function timeAgo(at: number): string {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}
