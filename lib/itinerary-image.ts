/**
 * Itinerary-as-image: renders a trip's day-by-day plan onto a canvas and
 * returns a PNG blob sized for WhatsApp sharing — the Kenyan sharing channel.
 * Pure canvas drawing (no external assets), so nothing can taint the bitmap;
 * prices and names come straight from the caller's data, never invented.
 */

import type { PrintableItinerary } from './itinerary'
import { formatKES as KES } from './kenya-data'

const W = 1080
const SCALE = 2
const MARGIN = 56
const CONTENT_W = W - MARGIN * 2

// Palette matches the printable document and the app's brand.
const GREEN = '#0e7a55'
const INK = '#14211a'
const MUTED = '#5b6a63'
const HAIRLINE = '#e4e9e3'
const BG = '#ffffff'

const FONT_SERIF = 'Georgia, "Times New Roman", serif'
const FONT_SANS = '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'

type Row =
  | { kind: 'day'; day: number; total: number }
  | { kind: 'stop'; time: string; title: string[]; meta: string[]; travel?: string; cost: string }
  | { kind: 'gap'; h: number }

function wrap(ctx: CanvasRenderingContext2D, text: string, font: string, maxWidth: number, maxLines: number): string[] {
  ctx.font = font
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate
    else {
      lines.push(line)
      line = w
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  // Ellipsize the last line when content overflowed.
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1]
    while (last.length > 4 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last.trimEnd()}…`
  }
  return lines
}

/** Builds the full row model with exact heights so measuring equals drawing. */
function buildRows(ctx: CanvasRenderingContext2D, t: PrintableItinerary): Row[] {
  const rows: Row[] = []
  const days = [...new Set(t.stops.map(s => s.day))].sort((a, b) => a - b)
  for (const day of days) {
    rows.push({ kind: 'day', day, total: t.stops.filter(s => s.day === day).reduce((sum, s) => sum + (s.cost || 0), 0) })
    const dayStops = t.stops.filter(s => s.day === day).sort((a, b) => a.time.localeCompare(b.time))
    for (let i = 0; i < dayStops.length; i++) {
      const s = dayStops[i]
      const title = wrap(ctx, s.name, `700 26px ${FONT_SERIF}`, CONTENT_W - 130 - 150, 2)
      const meta = wrap(ctx, `${s.place} · ${s.kind}${s.verified ? '' : ' · suggested (estimate)'}`, `400 20px ${FONT_SANS}`, CONTENT_W - 130 - 150, 1)
      const travel = i > 0 && s.travelKm != null ? `${s.travelKm} km${s.travelMins ? ` · ~${s.travelMins} min` : ''}` : undefined
      rows.push({
        kind: 'stop',
        time: s.time,
        title,
        meta,
        ...(travel ? { travel } : {}),
        cost: s.cost > 0 ? KES(s.cost) : '—',
      })
      // Hairline between stops.
      if (i < dayStops.length - 1) rows.push({ kind: 'gap', h: 1 })
    }
    rows.push({ kind: 'gap', h: 18 })
  }
  return rows
}

function rowHeight(row: Row): number {
  if (row.kind === 'gap') return row.h
  if (row.kind === 'day') return 34 + 46 + 16
  const body = Math.max(row.title.length * 32, 30) + row.meta.length * 26
  return 12 + body + (row.travel ? 24 : 0) + 12
}

export async function renderItineraryImage(t: PrintableItinerary): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('Canvas unavailable — browser only')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  // Guard against excessive size (Chrome limit 16384, memory ~ W*H*4)
  const MAX_H = 12000
  if (t.stops.length > 50) throw new Error('Itinerary too large to render as image')

  const rows = buildRows(ctx, t)
  const headerH = 208
  const summaryH = 92
  const footerH = 96
  const contentH = rows.reduce((sum, r) => sum + rowHeight(r), 0)
  const H = headerH + summaryH + contentH + footerH
  if (H > MAX_H) throw new Error(`Itinerary too tall (${H}px) — try fewer stops`)

  canvas.width = W * SCALE
  canvas.height = H * SCALE
  ctx.scale(SCALE, SCALE)

  // Page
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // ── Header band ──
  ctx.fillStyle = GREEN
  ctx.fillRect(0, 0, W, headerH)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `700 20px ${FONT_SANS}`
  ctx.fillText('K E N Y A T R A C E', MARGIN, 58)
  ctx.fillStyle = '#ffffff'
  const nameLines = wrap(ctx, t.name, `700 42px ${FONT_SERIF}`, CONTENT_W, 2)
  nameLines.forEach((line, i) => ctx.fillText(line, MARGIN, 104 + i * 48))
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `400 21px ${FONT_SANS}`
  const sub = `${t.origin ? `${t.origin} → ` : ''}${t.destination} · ${t.startDate} → ${t.endDate}`
  ctx.fillText(wrap(ctx, sub, `400 21px ${FONT_SANS}`, CONTENT_W, 1)[0], MARGIN, headerH - 34)

  // ── Summary chips ──
  const chips = [
    `${t.stops.length} stop${t.stops.length === 1 ? '' : 's'} · ${new Set(t.stops.map(s => s.day)).size} day${new Set(t.stops.map(s => s.day)).size === 1 ? '' : 's'}`,
    `Budget ${KES(t.budget)}`,
    `Stops ≈ ${KES(t.totalCost)}`,
  ]
  let cx = MARGIN
  const cy = headerH + 26
  ctx.font = `600 19px ${FONT_SANS}`
  for (const chip of chips) {
    const w = ctx.measureText(chip).width + 36
    ctx.strokeStyle = HAIRLINE
    ctx.lineWidth = 1.5
    roundRect(ctx, cx, cy, w, 42, 21)
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.fillText(chip, cx + 18, cy + 27)
    cx += w + 12
  }

  // ── Rows ──
  let y = headerH + summaryH
  for (const row of rows) {
    if (row.kind === 'gap') {
      y += row.h
      continue
    }
    if (row.kind === 'day') {
      y += 34
      ctx.fillStyle = INK
      ctx.font = `700 30px ${FONT_SERIF}`
      ctx.fillText(`Day ${row.day}`, MARGIN, y + 30)
      ctx.font = `600 21px ${FONT_SANS}`
      ctx.fillStyle = MUTED
      const label = `≈ ${KES(row.total)}`
      ctx.fillText(label, W - MARGIN - ctx.measureText(label).width, y + 29)
      y += 46
      ctx.fillStyle = HAIRLINE
      ctx.fillRect(MARGIN, y + 8, CONTENT_W, 1.5)
      y += 16
      continue
    }
    // Stop row
    const top = y + 12
    ctx.fillStyle = INK
    ctx.font = `700 24px ${FONT_SANS}`
    ctx.fillText(row.time, MARGIN, top + 22)
    row.title.forEach((line, i) => {
      ctx.font = `700 26px ${FONT_SERIF}`
      ctx.fillStyle = INK
      ctx.fillText(line, MARGIN + 112, top + 22 + i * 32)
    })
    row.meta.forEach((line, i) => {
      ctx.font = `400 20px ${FONT_SANS}`
      ctx.fillStyle = MUTED
      ctx.fillText(line, MARGIN + 112, top + 24 + row.title.length * 32 + i * 26)
    })
    if (row.travel) {
      ctx.font = `400 19px ${FONT_SANS}`
      ctx.fillStyle = MUTED
      ctx.fillText(row.travel, MARGIN + 112, top + 28 + row.title.length * 32 + row.meta.length * 26)
    }
    ctx.font = `600 23px ${FONT_SANS}`
    ctx.fillStyle = INK
    ctx.fillText(row.cost, W - MARGIN - ctx.measureText(row.cost).width, top + 22)
    y += rowHeight(row)
  }

  // ── Footer ──
  ctx.fillStyle = HAIRLINE
  ctx.fillRect(MARGIN, H - footerH + 10, CONTENT_W, 1.5)
  ctx.fillStyle = MUTED
  ctx.font = `400 19px ${FONT_SANS}`
  ctx.fillText('Planned with KenyaTrace — plan your own Kenya trip.', MARGIN, H - footerH + 48)
  ctx.fillText('Suggested stops are marked; their prices are estimates.', MARGIN, H - footerH + 76)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), 'image/png')
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Renders and downloads `<trip-name>-itinerary.png`. */
export async function downloadItineraryImage(t: PrintableItinerary): Promise<void> {
  const blob = await renderItineraryImage(t)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kenya-trip'}-itinerary.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
