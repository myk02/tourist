import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
})

const requestSchema = z.object({
  destinations: z.string().min(2).max(180),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  budget: z.number().positive().max(10_000_000),
  interests: z.array(z.string()).max(20).default([]),
  pace: z.enum(['relaxed', 'balanced', 'full']).default('balanced'),
  extra: z.string().max(500).default(''),
})

const stopSchema = z.object({
  day: z.number().int().positive(),
  time: z.string(),
  title: z.string(),
  place: z.string(),
  cost: z.number().nonnegative(),
  kind: z.enum(['Stay', 'Transport', 'Experience', 'Food']),
  lat: z.number().min(-5).max(5),
  lng: z.number().min(33).max(42),
  reason: z.string().optional(),
  duration: z.number().int().positive().max(600).optional(),
})

const itinerarySchema = z.object({
  name: z.string(),
  destination: z.string(),
  summary: z.string(),
  stops: z.array(stopSchema).min(3).max(24),
})

const replanSchema = z.object({
  mode: z.literal('day'),
  day: z.number().int().positive(),
  destinations: z.string().min(2).max(180),
  budget: z.number().positive().max(10_000_000),
  interests: z.array(z.string()).max(20).default([]),
  pace: z.enum(['relaxed', 'balanced', 'full']).default('balanced'),
  extra: z.string().max(500).default(''),
  keptStops: z.array(z.object({ title: z.string(), place: z.string() })).max(10),
})

const paceGuidance = {
  relaxed: 'Max 3 stops per day with generous free time between activities.',
  balanced: '3-4 well-paced stops per day.',
  full: '4-6 stops per day with full, efficient days.',
} as const

const system =
  'You are KenyaTrace, an expert Kenya trip designer. Create realistic, geographically coherent itineraries using only real places in Kenya. Use KES costs, conservative travel times, practical daily pacing, and coordinates inside Kenya. Keep the total at or below the stated budget. Do not invent hotels or tour operators; generic stays and activities are acceptable. For every stop include a short one-sentence reason explaining why it fits this traveller, and a realistic duration in minutes for how long the traveller spends there (30-300 for experiences, 60-1440 for stays).'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (body?.mode === 'day') {
      const input = replanSchema.parse(body)
      const { output } = await generateText({
        model: openrouter('openai/gpt-4o-mini'),
        output: Output.object({ schema: z.object({ stops: z.array(stopSchema).min(1).max(8) }) }),
        system,
        prompt: [
          `Regenerate ONLY day ${input.day} of a Kenya trip to ${input.destinations}. Budget: KES ${input.budget}. Interests: ${input.interests.join(', ') || 'none specified'}. Pace: ${input.pace} — ${paceGuidance[input.pace]}.`,
          `These stops are LOCKED and must stay fixed in the plan (keep them, keep the same day): ${input.keptStops.length ? input.keptStops.map(s => `"${s.title}" (${s.place})`).join('; ') : 'none'}.`,
          input.extra ? `Additional notes: ${input.extra}` : '',
          'Return the stops for day ' + input.day + ' only, each with day: ' + input.day + '. Total cost should stay within the trip budget.',
        ].filter(Boolean).join(' '),
      })
      return Response.json({ stops: output.stops })
    }

    const input = requestSchema.parse(body)
    const { output } = await generateText({
      model: openrouter('openai/gpt-4o-mini'),
      output: Output.object({ schema: itinerarySchema }),
      system,
      prompt: [
        `Plan a trip to ${input.destinations} from ${input.startDate} to ${input.endDate}. Budget: KES ${input.budget}.`,
        `Interests: ${input.interests.join(', ') || 'none specified'}. Pace: ${input.pace} — ${paceGuidance[input.pace]}.`,
        input.extra ? `Anything else: ${input.extra}` : '',
      ].filter(Boolean).join(' '),
    })
    return Response.json(output)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to build an itinerary'
    return Response.json({ error: message }, { status: 400 })
  }
}
