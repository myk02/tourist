import { chatRaw } from '@/lib/ai'
import { budgetTierPrompt, validatePlanBudget, validateReplanDayCost } from '@/lib/budget'
import { seasonGuidance } from '@/lib/seasons'
import { mapWithConcurrency, drivingLeg } from '@/lib/travel'
import { z } from 'zod'

// Plan generation legitimately takes a while (multi-attempt model calls plus
// OSRM legs). Declare the ceiling so the platform doesn't kill the function
// at the default 60s and return an HTML 504 the client can't parse.
export const maxDuration = 300

// ─── Request schemas ─────────────────────────────────────────────────────────

const candidateSchema = z.object({
  id: z.string(),
  vertical: z.string(),
  name: z.string(),
  location: z.string(),
  price: z.number(),
  unit: z.string(),
  rating: z.number(),
  reviews: z.number(),
  tags: z.array(z.string()),
  description: z.string(),
  lat: z.number(),
  lng: z.number(),
  image: z.string(),
})

const requestSchema = z.object({
  origin: z.string().min(2).max(120),
  originLat: z.number().min(-5).max(5).optional(),
  originLng: z.number().min(33).max(42).optional(),
  traveler: z.enum(['citizen', 'tourist', 'foreigner']),
  budget: z.number().positive().max(10_000_000),
  days: z.number().int().min(1).max(30),
  interests: z.array(z.string()).max(20).default([]),
  pace: z.enum(['relaxed', 'balanced', 'full']).default('balanced'),
  extra: z.string().max(500).default(''),
  // Travel month ("YYYY-MM") — drives season-aware guidance in the prompt.
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  // Real, verified places from the KenyaTrace catalog. The AI must choose from
  // these — it never invents names, prices, ratings or coordinates.
  candidates: z.array(candidateSchema).max(120).default([]),
})

const replanSchema = requestSchema.extend({
  mode: z.literal('day'),
  day: z.number().int().positive(),
  // A full day of short stops can legitimately exceed 10 locks.
  keptStops: z.array(z.object({ title: z.string(), place: z.string() })).max(30),
})

type Candidate = z.infer<typeof candidateSchema>

const KINDS = ['Stay', 'Transport', 'Experience', 'Food'] as const

const TRAVELER = {
  citizen: 'a Kenyan citizen planning from {origin} — prioritise local transport (matatus, PSVs, buses, boda bodas), local rates and practical routes',
  tourist: 'a tourist already in Kenya staying in {origin} — classic safari and coast experiences, comfortable lodges, guided tours',
  foreigner: 'a foreigner visiting Kenya from abroad, arriving via {origin} — include arrival logistics, domestic flights and a first-time Kenya itinerary',
} as const

const paceGuidance = {
  relaxed: 'Max 3 stops per day with generous free time.',
  balanced: '3-4 well-paced stops per day.',
  full: '4-6 stops per day with full, efficient days.',
} as const

const SYSTEM = `You are KenyaTrace, an expert Kenya travel planner. Return ONLY a single compact valid JSON object — no markdown, no code fences, no explanations, no extra fields.

═══════ PLANNING ORIGIN — NON-NEGOTIABLE ═══════
The traveller's CURRENT location is given as "origin", with exact coordinates in "originLat"/"originLng" when known. This origin is the ONLY valid starting point of the trip. NEVER assume, default to, or invent Nairobi, Mombasa, or any other city — the trip starts where the traveller actually is. Every journey leg, every day's plan and every "howToGetThere" must be built FROM that origin and be reachable from it. When coordinates are provided, use them to judge distance and travel time from where the traveller is; when they are not, use the origin place name. If you are ever unsure where the traveller is, plan from the origin as written — never a guessed city.

═══════ REAL CATALOG — NEVER INVENT PLACES ═══════
The user prompt includes a CATALOG of real, verified places in Kenya, each with an "id". Choose every stay, activity, attraction, flight and transfer FOR THIS TRIP FROM THE CATALOG ONLY, and return each chosen place's "id" on its stop. The system attaches the real price, rating, location and photo from that id — never restate or invent a name, price, rating or coordinate yourself. You may skip catalog items; only pick ones that genuinely fit the origin, budget tier, season and pace.
If the traveller needs something the catalog cannot provide (typically a restaurant, market or small local experience), add at most 2 "gap" stops per trip with "source":"gap" and NO id, price or coordinates — the system marks those as unverified suggestions.

Use EXACTLY this output shape (field names matter, keep it compact). The towns in this example are FORMAT ONLY — plan from the given origin, never from these example towns:
{"name":"Trip title","destination":"Main destination","summary":"One short sentence","originNote":"One short sentence","journey":[{"from":"Kisumu","to":"Maasai Mara","how":"Safari via Kericho and Bomet, ~6 h","distanceKm":330,"timeMins":360,"cost":4000}],"stops":[{"day":1,"time":"08:00","id":"<catalog-id>","title":"Dunga Hill Camp","place":"Kisumu","kind":"Stay","howToGetThere":"5 min from the Kisumu lakeshore","reason":"Riverside camp 90 min from your stop, KES 2,000 a night.","duration":720}]}

Rules:
- PLANNING ORIGIN: the first journey leg ("from") and the trip must start at the traveller's location — the "origin" given in the prompt. Do not start the trip anywhere else.
- CATALOG: every catalog stop must carry its "id". Never attach a price, rating or coordinates to a stop yourself — the system reads them from the catalog by id. Gap stops (max 2) carry "source":"gap" and nothing else fabricated.
- REASONS — write like a sharp local, not a brochure. Every "reason" must contain at least one specific, checkable fact (a price, a distance, a drive time, a season, a rating, or "X min from the previous stop"). No vague filler ("a great choice", "don't miss it", "breathtaking", "must-visit", "hidden gem"). At most 15 words.
- SUMMARY and ORIGINNOTE: concrete and specific (real place names, real numbers), never generic marketing sentences.
- Use only real Kenyan towns, parks, attractions, hotels and routes.
- All costs come from the catalog. Total stop costs must stay AT OR BELOW the stated budget.
- CHOOSE THE DESTINATION TO FIT THE BUDGET, not the wish-list. The user prompt gives a daily allowance (budget ÷ days) and a budget tier. Pick the destination(s) whose realistic daily cost matches that allowance: a tight allowance means day trips and lakes close to the origin; a generous one means Mara/coast safaris. Never plan a luxury itinerary on a shoestring budget, and never waste a generous budget on budget-only spots.
- "kind" is one of: Stay, Transport, Experience, Food.
- Coordinates come only from the catalog; never invent them.
- 3-8 stops total. Keep every string short.`

// ─── Resilient extraction (the free model's shapes vary wildly) ─────────────

interface RawStop {
  day: number
  time: string
  title: string
  place: string
  cost: number
  kind: string
  lat?: number
  lng?: number
  howToGetThere?: string
  reason?: string
  duration?: number
  id?: string
  sequence: number
}

interface RawLeg { from: string; to: string; how: string; distanceKm: number; timeMins: number; cost: number }

function stopTime(sequence: number): string {
  const hour = [9, 12, 15, 18][Math.min(Math.max(sequence - 1, 0), 3)]
  return `${String(hour).padStart(2, '0')}:00`
}

function inferKind(title: string): string {
  const n = title.toLowerCase()
  if (/(lodge|hotel|resort|camp|guesthouse|inn|apartment|villa)/.test(n)) return 'Stay'
  if (/(airport|flight|matatu|bus|taxi|transfer|ferry|train|ride)/.test(n)) return 'Transport'
  if (/(restaurant|caf[eé]|food|market|dinner|lunch)/.test(n)) return 'Food'
  return 'Experience'
}

function parseLatLng(value: unknown): { lat?: number; lng?: number } {
  if (!value) return {}
  if (typeof value === 'string') {
    const parts = value.split(',').map(s => parseFloat(s.trim()))
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return { lat: parts[0], lng: parts[1] }
    return {}
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const lat = typeof o.latitude === 'number' ? o.latitude : typeof o.lat === 'number' ? o.lat : undefined
    const lng = typeof o.longitude === 'number' ? o.longitude : typeof o.lng === 'number' ? o.lng : undefined
    return { lat, lng }
  }
  return {}
}

function walk<T>(node: unknown, out: T[], isMatch: (o: Record<string, unknown>) => boolean, normalize: (o: Record<string, unknown>) => T): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out, isMatch, normalize)
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (isMatch(obj)) out.push(normalize(obj))
    else for (const v of Object.values(obj)) walk(v, out, isMatch, normalize)
  }
}

function isStop(o: Record<string, unknown>): boolean {
  return (typeof o.destination === 'string' || typeof o.title === 'string') && (typeof o.day === 'number' || (typeof o.day === 'string' && o.day.trim() !== ''))
}

function normalizeStop(o: Record<string, unknown>): RawStop {
  const destination = String(o.destination || o.title || o.name || '')
  const day = Math.max(1, Math.round(Number(o.day) || 1))
  const sequence = typeof o.stopSequence === 'number' ? o.stopSequence : 1
  const costObj = o.stopCostsKES as Record<string, unknown> | undefined
  const cost = typeof costObj?.total === 'number' ? costObj.total : typeof o.cost === 'number' ? o.cost : typeof o.price === 'number' ? o.price : 0
  const { lat, lng } = parseLatLng(o.coordinates ?? o.location ?? o.latlng)
  let kind = typeof o.kind === 'string' ? o.kind : inferKind(destination)
  if (!(KINDS as readonly string[]).includes(kind)) kind = inferKind(destination)
  const id = typeof o.id === 'string' && o.id ? o.id : typeof o.listingId === 'string' && o.listingId ? o.listingId : undefined
  return {
    day,
    time: typeof o.time === 'string' && o.time ? o.time : stopTime(sequence),
    title: destination,
    place: String(o.place || destination),
    cost: Math.max(0, cost),
    kind,
    lat,
    lng,
    howToGetThere: typeof o.howToGetThere === 'string' && o.howToGetThere ? o.howToGetThere : typeof o.getThere === 'string' ? o.getThere : undefined,
    reason: typeof o.reason === 'string' && o.reason ? o.reason : undefined,
    duration: typeof o.durationMinutes === 'number' ? o.durationMinutes : typeof o.duration === 'number' ? o.duration : undefined,
    id,
    sequence,
  }
}

function isLeg(o: Record<string, unknown>): boolean {
  return typeof o.from === 'string' && typeof o.to === 'string' && typeof o.how === 'string'
}

function normalizeLeg(o: Record<string, unknown>): RawLeg {
  return {
    from: String(o.from),
    to: String(o.to),
    how: String(o.how),
    distanceKm: Number(o.distanceKm) || 0,
    timeMins: Number(o.timeMins) || 0,
    cost: Number(o.costKES ?? o.cost) || 0,
  }
}

/** Loose place-name equality: "Westlands, Nairobi" matches "Nairobi", and "Diani Beach" matches "Diani". */
function fuzzyPlaceMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na.length >= 3 && nb.includes(na)) return true
  if (nb.length >= 3 && na.includes(nb)) return true
  // Shared token fallback (e.g. "Diani Beach" vs "Diani").
  const tokens = new Set(na.split(' '))
  for (const tok of nb.split(' ')) if (tok.length >= 3 && tokens.has(tok)) return true
  return false
}

/**
 * Hard guard so the AI cannot plan from the wrong city: when the traveller's
 * physical location is known (coordinates provided), the first journey leg
 * must actually start there. Rejection reasons are fed back into AI retries.
 */
function validateOriginStart(legs: { from: string }[], origin: string, originLat?: number, originLng?: number): void {
  // No coordinates (typed place abroad, or a label that could not be geocoded):
  // the prompt rules carry the origin — free text can't be reliably verified.
  if (originLat == null || originLng == null) return
  // Coordinate-fallback label ("Lat -1.2921, Lng 36.8219" when reverse
  // geocoding failed) has no place words to match against — skip rather than
  // reject every plan.
  const words = origin.toLowerCase().replace(/\blat\b|\blng\b/g, ' ').replace(/[^a-z]+/g, ' ').trim()
  if (words.replace(/\s+/g, '').length < 3) return
  const first = legs[0]
  if (first && !fuzzyPlaceMatch(first.from, origin)) {
    throw new Error(`the first journey leg does not start from the traveller's location (${origin}) — the trip must begin there, not from a different city`)
  }
}

function extractJson(text: string): string {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The AI did not return a JSON object')
  return t.slice(start, end + 1).replace(/[\u0000-\u001F]/g, ' ')
}

/** Maps a catalog vertical to an itinerary kind. */
function kindFromVertical(vertical: string): string {
  if (vertical === 'stays') return 'Stay'
  if (vertical === 'flights' || vertical === 'taxis' || vertical === 'cars') return 'Transport'
  return 'Experience'
}

/**
 * The honesty step: catalog stops become real data (name, price, place,
 * coords, photo, verified), gap stops stay AI-drafted and unverified with no
 * invented coordinates. This is where the "model curates, never invents" rule
 * is enforced.
 */
function resolveStops(raw: RawStop[], catalogById: Map<string, Candidate>) {
  // Free models often repeat a favourite pick across days — keep the first
  // occurrence of each real listing so the plan doesn't sell the same place twice.
  const seenListings = new Set<string>()
  return raw
    .map(s => {
      const item = s.id ? catalogById.get(s.id) : undefined
      if (item) {
        if (seenListings.has(item.id)) return null
        seenListings.add(item.id)
        return {
          day: s.day,
          time: s.time,
          title: item.name,
          place: item.location,
          cost: item.price,
          kind: kindFromVertical(item.vertical),
          lat: item.lat,
          lng: item.lng,
          howToGetThere: s.howToGetThere,
          reason: s.reason,
          duration: s.duration,
          verified: true,
          source: 'catalog' as const,
          listingId: item.id,
          vertical: item.vertical,
          unit: item.unit,
          image: item.image,
        }
      }
      return {
        day: s.day,
        time: s.time,
        title: s.title,
        place: s.place,
        cost: Math.max(0, s.cost || 0),
        kind: s.kind,
        howToGetThere: s.howToGetThere,
        reason: s.reason,
        duration: s.duration,
        verified: false,
        source: 'gap' as const,
        // No AI-invented coordinates — the client can still resolve a real
        // location by name; otherwise the stop simply isn't placed on the map.
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
}

/** Walks whatever JSON the model returned and pulls out stops, legs and copy. */
function buildPlan(raw: string, origin: string, fallbackDays: number, interests: string[], catalogById: Map<string, Candidate>) {
  const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>
  const stops: RawStop[] = []
  walk(parsed, stops, isStop, normalizeStop)
  const legs: RawLeg[] = []
  walk(parsed, legs, isLeg, normalizeLeg)
  const seen = new Set<string>()
  const uniqueLegs = legs.filter(l => { const k = `${l.from}|${l.to}|${l.how}`; if (seen.has(k)) return false; seen.add(k); return true })

  stops.sort((a, b) => (a.day - b.day) || (a.sequence - b.sequence))
  const uniqueStops = stops.filter((s, i) => stops.findIndex(x => x.title === s.title && x.day === s.day) === i)

  const tripSummary = (parsed.tripSummary ?? {}) as Record<string, unknown>
  const days = Number(tripSummary.totalDurationDays) || fallbackDays
  const interestsStr = Array.isArray(tripSummary.interests) ? tripSummary.interests.join(', ') : interests.join(', ')
  // `destination` is the field the model is explicitly asked to fill — prefer
  // it over any stop. uniqueStops[0] is the *first* stop of day 1 (e.g. "Settle
  // into a Westlands hotel"), not the destination, so it's only a fallback.
  const destination =
    typeof parsed.destination === 'string' && parsed.destination.trim()
      ? parsed.destination.trim()
      : uniqueStops[0]?.title || 'Kenya'
  const name = typeof parsed.name === 'string' && parsed.name ? parsed.name : `${destination} · ${days} days from ${origin}`
  const summary =
    typeof parsed.summary === 'string' && parsed.summary
      ? parsed.summary
      : `A ${days}-day trip from ${origin}${interestsStr ? ` — ${interestsStr}` : ''}${typeof tripSummary.accommodationStyle === 'string' && tripSummary.accommodationStyle ? `, staying in ${tripSummary.accommodationStyle}` : ''}.`
  const originNote = typeof parsed.originNote === 'string' && parsed.originNote ? parsed.originNote : `The best route from ${origin}.`

  return {
    name,
    destination,
    summary,
    originNote,
    journey: uniqueLegs,
    stops: resolveStops(uniqueStops, catalogById),
  }
}

/**
 * Computes real road distance/duration between consecutive stops within each
 * day (OSRM with estimate fallback) and stamps travelKm/travelMins on each
 * stop after the first one of its day.
 */
async function attachTravelTimes(stops: { day: number; lat?: number; lng?: number; travelKm?: number; travelMins?: number; travelRouted?: boolean }[]): Promise<void> {
  const legs: { index: number; from: { lat: number; lng: number }; to: { lat: number; lng: number } }[] = []
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]
    const cur = stops[i]
    if (prev.day === cur.day && prev.lat != null && prev.lng != null && cur.lat != null && cur.lng != null) {
      legs.push({ index: i, from: { lat: prev.lat, lng: prev.lng }, to: { lat: cur.lat, lng: cur.lng } })
    }
  }
  const results = await mapWithConcurrency(legs, 3, leg => drivingLeg(leg.from, leg.to))
  results.forEach((r, k) => {
    const stop = stops[legs[k].index]
    stop.travelKm = r.km
    stop.travelMins = r.mins
    // Whether this leg is a real OSRM route or a straight-line estimate —
    // surfaced in the UI so travellers know how much to trust the number.
    stop.travelRouted = r.route === 'osrm'
  })
}

async function runWithRetry<T extends { stops: { length: number } }>(
  system: string,
  prompt: string,
  maxTokens: number,
  build: (raw: string) => T,
  minStops: number,
  validate?: (result: T) => void,
): Promise<T> {
  let lastError: unknown = null
  // Three attempts so budget enforcement can converge: the model may overshoot,
  // then undershoot, then land in range. (Four used to risk blowing through
  // serverless time caps — each attempt can take up to a minute.)
  for (let attempt = 0; attempt < 3; attempt++) {
    // Retries tell the model exactly what was wrong (e.g. it overshot the
    // budget) so the next attempt fixes the real problem. Keep `reason`
    // code-generated (numbers and fixed strings only) so model output can
    // never flow back into a prompt.
    const reason = lastError instanceof Error ? lastError.message : 'the output was unusable'
    const instruction = attempt === 0
      ? ''
      : ` Your previous answer was rejected: ${reason}. Fix exactly that problem and return ONLY a single valid JSON object matching the given shape — no markdown, no code fences, no explanations.`
    try {
      const raw = await chatRaw(system, prompt + instruction, maxTokens)
      const result = build(raw)
      if (result.stops.length < minStops) throw new Error(`Not enough stops (${result.stops.length} of ${minStops} required) — plan a fuller trip`)
      validate?.(result)
      return result
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not build a plan')
}

/** The catalog block appended to the user prompt so the model only picks real places. */
function catalogPrompt(candidates: Candidate[]): string {
  if (candidates.length === 0) return ''
  const lines = candidates.map(c => {
    const tags = c.tags.slice(0, 3).join(', ')
    const desc = c.description.length > 90 ? `${c.description.slice(0, 90)}…` : c.description
    return `• ${c.id} | ${c.name} (${c.location}) | ${c.vertical} | KES ${c.price}/${c.unit} | ★${c.rating} (${c.reviews}) | ${tags} | ${desc}`
  })
  return `\nCATALOG (choose from these real places only, by id):\n${lines.join('\n')}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (body?.mode === 'day') {
      const input = replanSchema.parse(body)
      const catalogById = new Map(input.candidates.map(c => [c.id, c]))
      const profile = TRAVELER[input.traveler].replace('{origin}', input.origin)
      const coordsLine = input.originLat != null && input.originLng != null ? ` They are EXACTLY at latitude ${input.originLat}, longitude ${input.originLng}.` : ''
      const allowance = Math.round(input.budget / input.days)
      const plan = await runWithRetry(
        SYSTEM,
        [
          `Regenerate ONLY day ${input.day} of a trip for ${profile} (starting in ${input.origin}${coordsLine}). The trip is anchored to ${input.origin} — do not relocate it to Nairobi or any other city. Trip budget: KES ${input.budget} total (KES ${allowance}/day). ${budgetTierPrompt(input.budget, input.days)} Interests: ${input.interests.join(', ') || 'none'}. Pace: ${input.pace} — ${paceGuidance[input.pace]}.`,
          input.month ? seasonGuidance(input.month) : '',
          `This day's stops should cost roughly one day's share (around KES ${allowance}/day, never more than ~KES ${Math.max(allowance * 2, 6000).toLocaleString()}).`,
          `LOCKED stops that must stay fixed: ${input.keptStops.length ? input.keptStops.map(s => `"${s.title}" (${s.place})`).join('; ') : 'none'}.`,
          input.extra ? `Notes: ${input.extra}` : '',
          `Return ONLY the stops for day ${input.day}, each with day: ${input.day}, choosing from the CATALOG by id where possible (at most 2 gap stops with "source":"gap").`,
          catalogPrompt(input.candidates),
        ].filter(Boolean).join(' '),
        3000,
        raw => {
          const stops: RawStop[] = []
          walk(JSON.parse(extractJson(raw)), stops, isStop, normalizeStop)
          // A model slip can scatter other days' stops into the JSON — only the
          // requested day may be merged into the itinerary.
          const dayStops = stops.filter(s => s.day === input.day)
          if (dayStops.length === 0) throw new Error(`No stops returned for day ${input.day} — plan that day with at least one stop`)
          dayStops.sort((a, b) => a.sequence - b.sequence)
          return { stops: resolveStops(dayStops, catalogById) }
        },
        1,
        p => {
          const dayCost = p.stops.reduce((s, x) => s + x.cost, 0)
          const rejection = validateReplanDayCost(dayCost, input.budget, input.days, input.day)
          if (rejection) throw new Error(rejection)
        },
      )
      await attachTravelTimes(plan.stops)
      return Response.json({ stops: plan.stops })
    }

    const input = requestSchema.parse(body)
    const catalogById = new Map(input.candidates.map(c => [c.id, c]))
    const profile = TRAVELER[input.traveler].replace('{origin}', input.origin)
    const coordsLine = input.originLat != null && input.originLng != null ? ` They are EXACTLY at latitude ${input.originLat}, longitude ${input.originLng} (place: ${input.origin}).` : ''
    const allowance = Math.round(input.budget / input.days)
    const plan = await runWithRetry(
      SYSTEM,
      [
        `${profile}${coordsLine}.`,
        `ORIGIN RULE (non-negotiable): the trip starts at ${input.origin}${input.originLat != null && input.originLng != null ? ` — the traveller is physically at latitude ${input.originLat}, longitude ${input.originLng}` : ''} — and nowhere else. The first journey leg must start there. NEVER default to Nairobi or any other city the traveller is not in.`,
        `Trip: ${input.days} day(s), total budget KES ${input.budget} (KES ${allowance.toLocaleString()}/day). ${budgetTierPrompt(input.budget, input.days)}`,
        `Pick the destination(s) whose realistic daily cost best fits KES ${allowance.toLocaleString()}/day — prefer the closest good fit from ${input.origin} when money is tight, and upgrade to premium parks or the coast only when the allowance clearly covers them. Aim to spend roughly 70-100% of the total budget, never more.`,
        `Interests: ${input.interests.join(', ') || 'not specified'}. Pace: ${input.pace} — ${paceGuidance[input.pace]}.`,
        input.month ? seasonGuidance(input.month) : '',
        input.extra ? `Anything else: ${input.extra}` : '',
        'Build a day-by-day itinerary choosing real places from the CATALOG by id (at most 2 gap stops with "source":"gap").',
        catalogPrompt(input.candidates),
      ].filter(Boolean).join(' '),
        5000,
        raw => buildPlan(raw, input.origin, input.days, input.interests, catalogById),
        3,
        p => {
          validateOriginStart(p.journey, input.origin, input.originLat, input.originLng)
          const rejection = validatePlanBudget(p.stops, input.budget)
          if (rejection) throw new Error(rejection)
        },
      )
      await attachTravelTimes(plan.stops)
      return Response.json(plan)
  } catch (error) {
    // A ZodError's .message is a long multi-line dump — collapse it to the
    // first issue so the 400 body stays human-readable (e.g. a traveller
    // geolocated outside Kenya).
    if (error instanceof z.ZodError) {
      const first = error.issues[0]
      return Response.json(
        { error: first ? `${first.path.join('.') || 'request'}: ${first.message}` : 'Invalid request' },
        { status: 400 },
      )
    }
    const message = error instanceof Error ? error.message : 'Unable to build a plan'
    return Response.json({ error: message }, { status: 400 })
  }
}
