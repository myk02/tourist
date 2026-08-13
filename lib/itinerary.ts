/**
 * Printable / offline itinerary: builds a self-contained HTML document from a
 * trip and its stops (no external assets, no app chrome) that the traveller
 * can print or save as a PDF for the road, the driver, or a phone with no
 * signal.
 */

export interface PrintableStop {
  day: number
  time: string
  name: string
  place: string
  kind: string
  cost: number
  verified?: boolean
  travelKm?: number
  travelMins?: number
}

export interface PrintableItinerary {
  name: string
  destination: string
  origin?: string
  startDate: string
  endDate: string
  budget: number
  totalCost: number
  stops: PrintableStop[]
}

const KES = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatMins(mins?: number): string {
  if (!mins) return ''
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function buildPrintableItinerary(t: PrintableItinerary): string {
  const days = [...new Set(t.stops.map(s => s.day))].sort((a, b) => a - b)
  const dayRows = days
    .map(day => {
      const rows = t.stops
        .filter(s => s.day === day)
        .sort((a, b) => a.time.localeCompare(b.time))
        .map(
          (s, i) => `
            <tr>
              <td class="time">${esc(s.time)}</td>
              <td>
                <div class="stop-name">${esc(s.name)}</div>
                <div class="stop-meta">${esc(s.place)} · ${esc(s.kind)}${s.verified ? '' : ' · suggested (price ~estimate)'}</div>
              </td>
              ${s.travelKm != null && i > 0 ? `<td class="travel">${s.travelKm} km · ~${formatMins(s.travelMins)}</td>` : '<td class="travel"></td>'}
              <td class="cost">${s.cost > 0 ? KES(s.cost) : '—'}</td>
            </tr>`,
        )
        .join('')
      const dayTotal = t.stops.filter(s => s.day === day).reduce((sum, s) => sum + (s.cost || 0), 0)
      return `
        <section class="day">
          <h2>Day ${day} <span class="day-total">≈ ${KES(dayTotal)}</span></h2>
          <table>
            <thead><tr><th>Time</th><th>Stop</th><th>Getting there</th><th>Cost</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(t.name)} · Itinerary · KenyaTrace</title>
<style>
  @page { margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #14211a; margin: 0; padding: 0 4mm; }
  .masthead { border-bottom: 3px solid #0e7a55; padding-bottom: 10px; margin-bottom: 18px; }
  .brand { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #0e7a55; font-weight: 700; }
  h1 { font-size: 30px; margin: 6px 0 4px; }
  .sub { font-size: 14px; color: #5b6a63; margin: 0; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 4px; }
  .summary span { border: 1px solid #d7e0d6; border-radius: 999px; padding: 4px 12px; font-size: 12.5px; color: #14211a; }
  .summary b { color: #0e7a55; }
  .day { page-break-before: always; }
  .day:first-of-type { page-break-before: avoid; }
  .day h2 { font-size: 20px; margin: 22px 0 8px; border-bottom: 1px solid #e4e9e3; padding-bottom: 6px; }
  .day-total { font-size: 13px; font-weight: 500; color: #0e7a55; }
  table { width: 100%; border-collapse: collapse; font-family: inherit; }
  th { text-align: left; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #5b6a63; padding: 6px 8px; border-bottom: 1px solid #e4e9e3; }
  td { padding: 8px; border-bottom: 1px solid #eef1ec; vertical-align: top; }
  td.time { white-space: nowrap; font-weight: 700; font-size: 13px; }
  .stop-name { font-weight: 700; font-size: 14px; }
  .stop-meta { font-size: 12px; color: #5b6a63; margin-top: 1px; }
  td.travel { font-size: 12px; color: #5b6a63; white-space: nowrap; }
  td.cost { text-align: right; white-space: nowrap; font-weight: 600; font-size: 13px; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e4e9e3; font-size: 12px; color: #5b6a63; }
  .footer b { color: #14211a; }
  @media print { .noprint { display: none; } }
</style>
</head>
<body>
  <div class="masthead">
    <div class="brand">KenyaTrace</div>
    <h1>${esc(t.name)}</h1>
    <p class="sub">${t.origin ? `${esc(t.origin)} → ` : ''}${esc(t.destination)} · ${esc(t.startDate)} → ${esc(t.endDate)}</p>
    <div class="summary">
      <span>${t.stops.length} stop${t.stops.length === 1 ? '' : 's'} · ${days.length} day${days.length === 1 ? '' : 's'}</span>
      <span>Planned budget <b>${KES(t.budget)}</b></span>
      <span>Stops total ≈ <b>${KES(t.totalCost)}</b></span>
    </div>
  </div>
  ${dayRows}
  <div class="footer">Planned with <b>KenyaTrace</b> — plan your own Kenya trip. Prices from verified listings; suggested stops are marked and their prices are estimates.</div>
  <p class="noprint" style="font-size:11px;color:#5b6a63;">Tip: save as PDF via your print dialog for an offline copy.</p>
</body>
</html>`
}
