import { chatJSON } from '@/lib/ai'
import { seasonGuidance } from '@/lib/seasons'
import { z } from 'zod'
import { rateLimit, getClientKey } from '@/lib/rate-limit'

export const maxDuration = 60

/**
 * The AI trip brief: a short, honest summary of a *saved* trip. Grounded the
 * same way as the planner — the model can only describe the actual stops it
 * is given, with facts that all come from that data. No invented claims, no
 * brochure filler.
 */

const stopSchema = z.object({
  title: z.string(),
  place: z.string(),
  day: z.number().int().positive(),
  kind: z.string(),
  cost: z.number().nonnegative(),
  verified: z.boolean(),
  time: z.string().optional(),
  travelKm: z.number().optional(),
  travelMins: z.number().optional(),
})

const requestSchema = z.object({
  origin: z.string().min(2).max(120).optional(),
  destination: z.string().max(120).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  stops: z.array(stopSchema).min(1).max(40),
  doneCount: z.number().int().min(0).max(40),
})

const briefSchema = z.object({
  summary: z.string().min(10).max(400),
  highlights: z.array(z.string()).length(3),
  tip: z.string().min(5).max(240),
})

const SYSTEM = `You are KenyaTrace's trip narrator. You are given a traveller's ACTUAL saved itinerary. Write a short, sharp trip brief about it.

Return ONLY a single compact valid JSON object with exactly these fields — no markdown, no code fences, no extra fields:
{"summary":"3-4 honest sentences that tell the shape of the trip: where it starts, the main destination(s), roughly how many days, what kind of places it includes, and how far apart they are.","highlights":["highlight 1","highlight 2","highlight 3"],"tip":"One practical, specific tip for this exact trip"}

Rules:
- GROUNDING: Every fact must come from the given stops. Never invent a place, price, distance, activity or season that is not in the data. When a stop is marked verified:false, do not repeat its price as fact.
- ANTI-SLOP: No marketing filler ("a great choice", "unforgettable", "must-visit", "hidden gem"). Prefer specific, checkable facts: "3 days around Lake Naivasha", "four stops a day", "KES 14,000 a night at Sopa", "~37 km between the first two stops".
- STRUCTURE: Use the day numbers and travel distances to describe the trip's rhythm. Mention where it starts (origin) and the destination.
- TONE: A sharp local who has done this route — informative, concrete, never breathless.
- Keep every string short.`

export async function POST(request: Request) {
  try {
    const rl = rateLimit(`brief:${getClientKey(request)}`, 20, 60_000)
    if (!rl.ok) {
      return Response.json({ error: 'Too many requests — try again shortly.' }, { status: 429 })
    }
    const body = await request.json()
    const input = requestSchema.parse(body)
    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json({ error: 'Trip brief service is temporarily unavailable — try again shortly.' }, { status: 503 })
    }
    const stopsText = input.stops
      .map(s => {
        const travel = s.travelKm != null ? ` (${s.travelKm} km ~${s.travelMins ?? '?'} min from previous)` : ''
        const price = s.verified && s.cost > 0 ? `, KES ${s.cost}` : ''
        return `• Day ${s.day} ${s.time ?? ''} ${s.title} — ${s.place} [${s.kind}]${price}${travel}${s.verified ? '' : ' (unverified suggestion)'}`
      })
      .join('\n')
    const season = input.month ? seasonGuidance(input.month) : ''
    const brief = await chatJSON({
      system: SYSTEM,
      prompt: [
        `Trip: ${input.stops.length} stops across ${Math.max(...input.stops.map(s => s.day), 1)} day(s)${input.origin ? `, starting from ${input.origin}` : ''}${input.destination ? `, destination ${input.destination}` : ''}. ${input.doneCount} of ${input.stops.length} stops completed so far.`,
        season,
        'STOPS:\n' + stopsText,
      ].filter(Boolean).join(' '),
      schema: briefSchema,
      maxTokens: 800,
    })
    return Response.json(brief)
  } catch (error) {
    console.error('[brief] error', error)
    const raw = error instanceof Error ? error.message : 'Could not generate the trip brief'
    const message = raw.includes('OPENROUTER') || raw.includes('Bearer') ? 'Trip brief service is temporarily unavailable' : raw
    const isConfig = /OPENROUTER_API_KEY is not configured/i.test(raw)
    return Response.json({ error: message }, { status: isConfig ? 503 : 400 })
  }
}
