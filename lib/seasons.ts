/**
 * Kenya seasonality — the single source of truth shared by the planner UI
 * (the "when are you going?" hint) and the plan API (the AI prompt guidance),
 * so what the traveller sees is exactly what the planner is told.
 *
 * Accepts a "YYYY-MM" month string and returns short human labels plus the
 * fact-based guidance injected into the AI prompt.
 */

export type SeasonKey = 'migration' | 'dry-calving' | 'festive' | 'shoulder' | 'green'

const SEASONS: { key: SeasonKey; months: number[]; label: string; guidance: string }[] = [
  {
    key: 'migration',
    months: [7, 8, 9, 10],
    label: 'High season · Mara migration',
    guidance:
      'SEASON (Jul-Oct): high season — Maasai Mara wildebeest migration peaks Jul-Oct; wildlife is at its most dramatic, camps and bush flights sell out and rates run premium. Favour the Mara/Rift Valley; book early.',
  },
  {
    key: 'dry-calving',
    months: [1, 2],
    label: 'Dry season · Mara calving',
    guidance:
      'SEASON (Jan-Feb): dry season — Maasai Mara calving season (Jan-Feb) puts predators on the plains; Amboseli/Tsavo viewing is excellent as animals gather at water; the coast is warm and sunny.',
  },
  {
    key: 'festive',
    months: [12],
    label: 'Dry season · Coast at its best',
    guidance:
      'SEASON (Dec): dry, festive high season — the coast is at its best (hot and sunny), Mara and Amboseli are excellent, but prices are high and lodges fill fast; book ahead.',
  },
  {
    key: 'shoulder',
    months: [3, 11],
    label: 'Shoulder season · good value',
    guidance:
      'SEASON (Mar/Nov): shoulder — generally dry and good value with fewer crowds; the coast stays lovely in November and parks start to green in March.',
  },
  {
    key: 'green',
    months: [4, 5, 6],
    label: 'Green season · lower rates',
    guidance:
      'SEASON (Apr-Jun): long-rains / green season — lush parks, low-season rates and few visitors; expect afternoon showers and some muddy tracks; beach weather on the coast is less reliable. Great for budget travellers and photography.',
  },
]

function monthNumber(month?: string): number | null {
  if (!month) return null
  const m = parseInt(month.slice(5, 7), 10)
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : null
}

/** Short human label shown next to the travel-date input. */
export function seasonLabel(month?: string): string | null {
  const m = monthNumber(month)
  if (m == null) return null
  return SEASONS.find(s => s.months.includes(m))?.label ?? null
}

/** Fact-based guidance block injected into the AI prompt (empty when no month). */
export function seasonGuidance(month?: string): string {
  const m = monthNumber(month)
  if (m == null) return ''
  return SEASONS.find(s => s.months.includes(m))?.guidance ?? ''
}
