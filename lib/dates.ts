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

/**
 * Day number (1-based) for a check-in date relative to the trip start date.
 * Single source for bookings.ts — local-midnight parse on both sides so the
 * diff can't flip at 02:00 EAT the way a UTC/midday mix would.
 */
export function dayFromDate(startDate: string, checkIn: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime()
  const check = new Date(`${checkIn}T00:00:00`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(check)) return 1
  return Math.max(Math.round((check - start) / 86_400_000) + 1, 1)
}

/**
 * Check-in day as a timestamp for reminder windows. Midday UTC anchor: a
 * midnight parse would make "the day before" flip at 02:00 EAT, which reads
 * wrong in the email subject. Single source for reminders.ts.
 */
export function checkInMs(checkIn: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null
  const ms = Date.parse(`${checkIn}T12:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

const PRETTY_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** `2026-08-18` → `18 Aug 2026` for display. Pass-through when malformed. */
export function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${parseInt(m[3], 10)} ${PRETTY_MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`
}

/**
 * Nights between check-in and check-out (≥1). Local-midnight parse on both
 * sides — same convention as dayFromDate. Single source for bookings.ts stay
 * duration math (was pasted twice with inline clamping).
 */
export function stayNights(checkIn: string, checkOut: string): number {
  const diff = new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()
  const days = Number.isFinite(diff) ? Math.max(Math.round(diff / 86_400_000), 1) : 1
  return days
}

/** Whole days from today (local) until a YYYY-MM-DD date. Negative = past. */
export function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
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
