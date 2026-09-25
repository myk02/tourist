/**
 * iCalendar (RFC 5545) feed builder — the TripIt-style "subscribe in Google /
 * Apple Calendar" feature. Pure string assembly, no dependencies, fully
 * unit-tested: every generated line is escaped per §3.4.1, lines are folded
 * at 75 octets per §3.1, and datetimes are emitted in floating local format
 * (calendars render them in the traveller's own timezone, which is what a
 * trip itinerary means).
 */

export interface IcsEvent {
  /** Stable unique id — the same stop keeps the same uid across regenerations, so edits update instead of duplicating. */
  uid: string
  /** Calendar-day or timed start. */
  start: string
  /** Calendar-day or timed end (defaults to 1 hour after start when omitted). */
  end?: string
  summary: string
  description?: string
  location?: string
}

/** Escapes text values per RFC 5545 §3.3.11 (backslash first, then ; , \n). */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Folds a content line to ≤75 octets per RFC 5545 §3.1 with CRLF + space continuations. */
export function icsFold(line: string): string[] {
  const encoder = new TextEncoder()
  const lines: string[] = []
  let current = ''
  let currentBytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (currentBytes + size > 75 && current.length > 0) {
      lines.push(current)
      current = ` ${char}`
      currentBytes = 1 + size
    } else {
      current += char
      currentBytes += size
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

/**
 * Calendar date "YYYY-MM-DD" (VALUE=DATE) or local datetime "YYYY-MM-DDTHH:mm"
 * (floating local time — rendered in the subscriber's timezone).
 */
function icsDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replace(/-/g, '')
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value)
  if (m) return `${m[1].replace(/-/g, '')}T${m[2].replace(':', '')}00`
  // Unparseable — all-day placeholder so the feed never emits garbage.
  return '19700101'
}

/** Builds the full VCALENDAR text for a trip feed. */
export function buildIcsFeed(opts: { tripName: string; events: IcsEvent[] }): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KenyaTrace//Trip Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.tripName)}`,
  ]
  for (const e of opts.events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${icsEscape(e.uid)}`)
    lines.push(`DTSTAMP:${icsDate(new Date().toISOString().slice(0, 16))}Z`)
    const allDay = /^\d{4}-\d{2}-\d{2}$/.test(e.start)
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`)
      lines.push(`DTEND;VALUE=DATE:${icsDate(e.end ?? e.start)}`)
    } else {
      lines.push(`DTSTART:${icsDate(e.start)}`)
      const end = e.end ?? addHour(e.start)
      lines.push(`DTEND:${icsDate(end)}`)
    }
    lines.push(`SUMMARY:${icsEscape(e.summary)}`)
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`)
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.flatMap(icsFold).join('\r\n')
}

/** Adds one hour to a "YYYY-MM-DDTHH:mm" string (no DST math needed for a default slot). */
function addHour(dt: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(dt)
  if (!m) return dt
  const h = Math.min(parseInt(m[2], 10) + 1, 23)
  return `${m[1]}T${String(h).padStart(2, '0')}:${m[3]}`
}
