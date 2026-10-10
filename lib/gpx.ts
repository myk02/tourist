/**
 * Offline trip vault: GPX export + local snapshot for dead zones.
 * The Mara, Amboseli and Tsavo regularly drop signal — travellers can
 * download a GPX (works in Maps.me / Organic Maps / Gaia) and keep a
 * localStorage snapshot of the day-by-day plan with an honest timestamp.
 */

export interface GpxStop {
  name: string
  place?: string | null
  lat?: number | null
  lng?: number | null
  day?: number | null
  time?: string | null
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Build a GPX 1.1 document with one waypoint per geocoded stop + a track. */
export function buildGpx(tripName: string, stops: GpxStop[]): string {
  const safe = escapeXml(tripName.trim() || 'KenyaTrace trip')
  const geo = stops.filter(s => s.lat != null && s.lng != null)
  const wpts = geo
    .map(s => {
      const label = escapeXml([s.name, s.place].filter(Boolean).join(' — '))
      const cmt = escapeXml(
        [s.day != null ? `Day ${s.day}` : null, s.time || null].filter(Boolean).join(' · '),
      )
      return `    <wpt lat="${s.lat}" lon="${s.lng}"><name>${label}</name>${cmt ? `<cmt>${cmt}</cmt>` : ''}</wpt>`
    })
    .join('\n')
  const track =
    geo.length >= 2
      ? `  <trk><name>${safe}</name><trkseg>\n${geo
          .map(s => `      <trkpt lat="${s.lat}" lon="${s.lng}" />`)
          .join('\n')}\n  </trkseg></trk>\n`
      : ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="KenyaTrace" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${safe}</name></metadata>\n${wpts ? `${wpts}\n` : ''}${track}</gpx>`
}

/** Trigger a browser download for a text payload. No-op server-side. */
export function downloadTextFile(filename: string, text: string, mime = 'application/gpx+xml'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return s || 'trip'
}

export function gpxFilename(tripName: string): string {
  return `${slugify(tripName)}.gpx`
}
